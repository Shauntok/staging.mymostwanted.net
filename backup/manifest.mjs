import {BackupValidationError} from "./crypto.mjs";

const MANIFEST_VERSION = 2;
const ARTIFACT_KINDS = new Set([
  "database_roles",
  "database_schema",
  "database_data",
  "database_auth_schema",
  "database_auth_data",
  "database_storage_schema",
  "database_storage_data",
  "migration_history",
  "database_platform_compatibility",
  "storage_object",
]);

function requireText(value, name, maxLength = 256) {
  if (typeof value !== "string" || value.length < 1 || value.length > maxLength) {
    throw new Error(`Backup manifest ${name} is invalid.`);
  }
  return value;
}

function requireDigest(value, name) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Backup manifest ${name} must be a SHA-256 digest.`);
  }
  return value;
}

function safeSourceObjectPath(value) {
  requireText(value, "storage object path", 1024);
  if (/[\u0000-\u001f\u007f]/.test(value)
    || value.startsWith("/")
    || value.includes("\\")
    || value.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error("Backup manifest contains an invalid Storage object path.");
  }
  return value;
}

function normalizeArtifact(artifact, runId) {
  if (!artifact || !ARTIFACT_KINDS.has(artifact.kind)) {
    throw new Error("Backup manifest contains an unsupported artifact kind.");
  }

  const artifactId = requireText(artifact.artifactId, "artifact ID", 80);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(artifactId)) {
    throw new Error("Backup manifest contains an invalid artifact ID.");
  }
  const objectKey = requireText(artifact.objectKey, "object key", 180);
  if (objectKey !== `runs/${runId}/${artifactId}.mmwrbk`) {
    throw new Error("Backup manifest artifact key does not match its run and artifact IDs.");
  }

  const normalized = {
    artifactId,
    kind: artifact.kind,
    objectKey,
    plaintextBytes: artifact.plaintextBytes,
    plaintextSha256: requireDigest(artifact.plaintextSha256, "plaintext digest"),
    encryptedBytes: artifact.encryptedBytes,
    encryptedSha256: requireDigest(artifact.encryptedSha256, "encrypted digest"),
  };
  if (!Number.isSafeInteger(normalized.plaintextBytes) || normalized.plaintextBytes < 0
    || !Number.isSafeInteger(normalized.encryptedBytes) || normalized.encryptedBytes < 1) {
    throw new Error("Backup manifest contains invalid artifact sizes.");
  }

  if (artifact.kind === "storage_object") {
    normalized.sourceBucket = requireText(artifact.sourceBucket, "source bucket", 63);
    normalized.sourceObjectPath = safeSourceObjectPath(artifact.sourceObjectPath);
    if (artifact.sourceMimeType !== undefined) {
      normalized.sourceMimeType = requireText(artifact.sourceMimeType, "source MIME type", 127);
    }
    if (artifact.sourceCacheControl !== undefined) {
      normalized.sourceCacheControl = requireText(artifact.sourceCacheControl, "source cache control", 127);
    }
  }

  return normalized;
}

function normalizeStorageBuckets(storageBuckets) {
  if (!Array.isArray(storageBuckets) || storageBuckets.length > 1000) {
    throw new Error("Backup manifest Storage bucket inventory is invalid.");
  }
  const normalized = storageBuckets.map((bucket) => {
    if (!bucket || typeof bucket.id !== "string" || bucket.id.length < 1 || bucket.id.length > 63
      || typeof bucket.name !== "string" || bucket.name.length < 1 || bucket.name.length > 63
      || typeof bucket.public !== "boolean"
      || (bucket.fileSizeLimit !== null && (!Number.isSafeInteger(bucket.fileSizeLimit) || bucket.fileSizeLimit < 1))
      || (bucket.allowedMimeTypes !== null
        && (!Array.isArray(bucket.allowedMimeTypes)
          || bucket.allowedMimeTypes.some((value) => typeof value !== "string" || value.length > 127)))) {
      throw new Error("Backup manifest contains invalid Storage bucket configuration.");
    }
    return {
      id: bucket.id,
      name: bucket.name,
      public: bucket.public,
      fileSizeLimit: bucket.fileSizeLimit,
      allowedMimeTypes: bucket.allowedMimeTypes === null ? null : [...bucket.allowedMimeTypes].sort(),
    };
  });
  if (new Set(normalized.map((bucket) => bucket.id)).size !== normalized.length
    || new Set(normalized.map((bucket) => bucket.name)).size !== normalized.length) {
    throw new Error("Backup manifest contains duplicate Storage buckets.");
  }
  return normalized.sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Returns a JSON-safe manifest. Store it only as an encrypted backup artifact;
 * its Storage bucket/object paths are sensitive recovery metadata.
 */
export function createBackupManifest({
  runId,
  createdAt,
  databaseMajorVersion,
  databaseExportStartedAt,
  databaseExportCompletedAt,
  storageInventoryVerified,
  storageBuckets,
  artifacts,
}) {
  requireText(runId, "run ID", 80);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(runId)) throw new Error("Backup manifest run ID is invalid.");
  const timestamp = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (!Number.isFinite(timestamp.getTime())) throw new Error("Backup manifest creation time is invalid.");
  if (!Number.isInteger(databaseMajorVersion) || databaseMajorVersion < 13 || databaseMajorVersion > 99) {
    throw new Error("Backup manifest database major version is invalid.");
  }
  const exportStartedAt = new Date(databaseExportStartedAt);
  const exportCompletedAt = new Date(databaseExportCompletedAt);
  if (!Number.isFinite(exportStartedAt.getTime()) || !Number.isFinite(exportCompletedAt.getTime())
    || exportCompletedAt < exportStartedAt || storageInventoryVerified !== true) {
    throw new Error("Backup manifest snapshot-window evidence is invalid.");
  }
  const normalizedStorageBuckets = normalizeStorageBuckets(storageBuckets);
  if (!Array.isArray(artifacts) || artifacts.length < 8 || artifacts.length > 100000) {
    throw new Error("Backup manifest artifact count is invalid.");
  }

  const normalizedArtifacts = artifacts.map((artifact) => normalizeArtifact(artifact, runId));
  const bucketNames = new Set(normalizedStorageBuckets.map((bucket) => bucket.name));
  if (normalizedArtifacts.some((artifact) => artifact.kind === "storage_object"
    && !bucketNames.has(artifact.sourceBucket))) {
    throw new Error("Backup manifest maps a Storage object to an unlisted bucket.");
  }
  const artifactIds = new Set(normalizedArtifacts.map((artifact) => artifact.artifactId));
  const objectKeys = new Set(normalizedArtifacts.map((artifact) => artifact.objectKey));
  if (artifactIds.size !== normalizedArtifacts.length || objectKeys.size !== normalizedArtifacts.length) {
    throw new Error("Backup manifest has duplicate artifact IDs or object keys.");
  }

  const requiredDatabaseKinds = [
    "database_roles",
    "database_schema",
    "database_data",
    "database_auth_schema",
    "database_auth_data",
    "database_storage_schema",
    "database_storage_data",
    "migration_history",
    "database_platform_compatibility",
  ];
  if (requiredDatabaseKinds.some((kind) => normalizedArtifacts.filter((artifact) => artifact.kind === kind).length !== 1)) {
    throw new Error("Backup manifest is missing a required database dump component.");
  }

  const storagePaths = normalizedArtifacts
    .filter((artifact) => artifact.kind === "storage_object")
    .map((artifact) => `${artifact.sourceBucket}\u0000${artifact.sourceObjectPath}`);
  if (new Set(storagePaths).size !== storagePaths.length) {
    throw new Error("Backup manifest contains a duplicate Storage object mapping.");
  }

  const plaintextBytes = normalizedArtifacts.reduce((total, artifact) => total + artifact.plaintextBytes, 0);
  const encryptedBytes = normalizedArtifacts.reduce((total, artifact) => total + artifact.encryptedBytes, 0);
  if (!Number.isSafeInteger(plaintextBytes) || !Number.isSafeInteger(encryptedBytes)) {
    throw new Error("Backup manifest byte totals exceed the supported range.");
  }

  return {
    format: "MMWR-BACKUP-MANIFEST",
    version: MANIFEST_VERSION,
    runId,
    createdAt: timestamp.toISOString(),
    databaseMajorVersion,
    databaseSnapshotModel: "independent_cli_dump_snapshots",
    databaseExportStartedAt: exportStartedAt.toISOString(),
    databaseExportCompletedAt: exportCompletedAt.toISOString(),
    storageInventoryVerified,
    storageBuckets: normalizedStorageBuckets,
    artifactCount: normalizedArtifacts.length,
    plaintextBytes,
    encryptedBytes,
    artifacts: normalizedArtifacts,
  };
}

export function parseBackupManifest(value, expectedRunId) {
  try {
    const manifest = typeof value === "string" ? JSON.parse(value) : value;
    if (!manifest || manifest.format !== "MMWR-BACKUP-MANIFEST" || manifest.version !== MANIFEST_VERSION) {
      throw new Error("Backup manifest format or version is unsupported.");
    }
    if (manifest.runId !== expectedRunId) throw new Error("Backup manifest run ID does not match the requested run.");
    const recreated = createBackupManifest(manifest);
    if (recreated.artifactCount !== manifest.artifactCount
      || recreated.plaintextBytes !== manifest.plaintextBytes
      || recreated.encryptedBytes !== manifest.encryptedBytes) {
      throw new Error("Backup manifest totals do not match its artifact list.");
    }
    return recreated;
  } catch (error) {
    if (error instanceof BackupValidationError) throw error;
    throw new BackupValidationError("Retrieved backup manifest is invalid.");
  }
}
