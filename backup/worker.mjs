import {createHash, randomBytes} from "node:crypto";
import {chmod, lstat, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {createWriteStream} from "node:fs";
import {tmpdir} from "node:os";
import {isAbsolute, relative, resolve, sep} from "node:path";
import {Readable, Transform} from "node:stream";
import {pipeline} from "node:stream/promises";
import {createBackupManifest, parseBackupManifest} from "./manifest.mjs";
import {getMaxStorageObjectBytes, getMaxTotalStorageBytes} from "./limits.mjs";
import {
  BackupValidationError,
  encryptBackupFile,
  decryptBackupFile,
  newBackupArtifactId,
  safeBackupObjectName,
} from "./crypto.mjs";

const DATABASE_ARTIFACT_KINDS = new Set([
  "database_roles",
  "database_schema",
  "database_data",
  "database_auth_schema",
  "database_auth_data",
  "database_storage_schema",
  "database_storage_data",
  "migration_history",
  "database_platform_compatibility",
]);
const MAX_STORAGE_OBJECTS = 99992;

function makeRunId(now) {
  const timestamp = `${now.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
  return `backup_${timestamp}_${randomBytes(8).toString("hex")}`;
}

function assertPrivateWorkspace(path) {
  if (!isAbsolute(path)) throw new Error("Backup workspace path must be absolute.");
}

function withinWorkspace(workspace, candidate) {
  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new Error("Backup source artifact path is invalid.");
  }
  const absolute = resolve(candidate);
  const relativePath = relative(workspace, absolute);
  if (!relativePath || relativePath === "." || relativePath === ".."
    || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error("Backup source artifact must be a file inside the private workspace.");
  }
  return absolute;
}

async function hashStreamToFile(stream, outputPath) {
  const hash = createHash("sha256");
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(stream, meter, createWriteStream(outputPath, {flags: "wx", mode: 0o600}));
  return {sha256: hash.digest("hex"), bytes};
}

function asReadableStream(value) {
  if (value instanceof Readable) return value;
  if (value && typeof value[Symbol.asyncIterator] === "function") return Readable.from(value);
  throw new Error("Backup source did not provide a readable stream.");
}

async function verifyRemoteArtifact({objectStore, artifact, runId, encodedKey, workspace}) {
  const verificationSuffix = randomBytes(8).toString("hex");
  const downloadedPath = resolve(workspace, `${artifact.artifactId}.${verificationSuffix}.verify-download`);
  const plaintextPath = resolve(workspace, `${artifact.artifactId}.${verificationSuffix}.verify-plaintext`);
  const remoteStream = asReadableStream(await objectStore.getEncryptedObject(artifact.objectKey));
  const remoteDigest = await hashStreamToFile(remoteStream, downloadedPath);

  if (remoteDigest.sha256 !== artifact.encryptedSha256
    || remoteDigest.bytes !== artifact.encryptedBytes) {
    throw new BackupValidationError("A stored backup object did not match its local encrypted checksum.");
  }

  await decryptBackupFile({
    inputPath: downloadedPath,
    outputPath: plaintextPath,
    encodedKey,
    runId,
    artifactId: artifact.artifactId,
    expectedPlaintextSha256: artifact.plaintextSha256,
    expectedPlaintextBytes: artifact.plaintextBytes,
    expectedEncryptedSha256: artifact.encryptedSha256,
    expectedEncryptedBytes: artifact.encryptedBytes,
  });
  return {downloadedPath, plaintextPath};
}

function createStorageByteLimit(maxBytes, expectedBytes) {
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes || bytes > expectedBytes) {
        callback(new Error("Backup Storage object exceeded its verified byte limit."));
        return;
      }
      callback(null, chunk);
    },
    flush(callback) {
      callback(bytes === expectedBytes ? undefined : new Error("Backup Storage object size did not match its inventory."));
    },
  });
  return {meter, getBytes: () => bytes};
}

async function saveEncryptedArtifact({
  runId,
  artifactId,
  kind,
  sourcePath,
  encodedKey,
  workspace,
  objectStore,
  storageMetadata,
}) {
  const safeSourcePath = withinWorkspace(workspace, sourcePath);
  const sourceStat = await lstat(safeSourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error("Backup source artifact must be a regular file in the private workspace.");
  }
  const encryptedPath = resolve(workspace, `${artifactId}.mmwrbk`);
  const digests = await encryptBackupFile({
    inputPath: safeSourcePath,
    outputPath: encryptedPath,
    encodedKey,
    runId,
    artifactId,
  });
  const objectKey = safeBackupObjectName(runId, artifactId);
  await objectStore.putEncryptedFile({
    runId,
    artifactId,
    filePath: encryptedPath,
    encryptedSha256: digests.encrypted.sha256,
    encryptedBytes: digests.encrypted.bytes,
  });

  const artifact = {
    artifactId,
    kind,
    objectKey,
    plaintextBytes: digests.plaintext.bytes,
    plaintextSha256: digests.plaintext.sha256,
    encryptedBytes: digests.encrypted.bytes,
    encryptedSha256: digests.encrypted.sha256,
    ...storageMetadata,
  };
  await verifyRemoteArtifact({objectStore, artifact, runId, encodedKey, workspace});
  return artifact;
}

function validateDatabaseExports(exports, workspace) {
  if (!Array.isArray(exports) || exports.length !== DATABASE_ARTIFACT_KINDS.size) {
    throw new Error("Backup database export did not provide every required component.");
  }
  const kinds = new Set();
  for (const item of exports) {
    if (!item || !DATABASE_ARTIFACT_KINDS.has(item.kind) || kinds.has(item.kind)) {
      throw new Error("Backup database export contains a missing, duplicate, or unsupported component.");
    }
    withinWorkspace(workspace, item.path);
    kinds.add(item.kind);
  }
  if (kinds.size !== DATABASE_ARTIFACT_KINDS.size) {
    throw new Error("Backup database export is incomplete.");
  }
  return exports;
}

function validateStorageObject(object) {
  if (!object || typeof object.bucket !== "string" || object.bucket.length < 1
    || object.bucket.length > 63 || !/^[A-Za-z0-9._-]+$/.test(object.bucket)
    || typeof object.path !== "string" || object.path.length < 1 || object.path.length > 1024
    || /[\u0000-\u001f\u007f]/.test(object.path) || object.path.startsWith("/")
    || object.path.includes("\\") || object.path.split("/").some((part) => part === ".." || part === ".")
    || !Number.isSafeInteger(object.size) || object.size < 0
    || typeof object.updatedAt !== "string" || !Number.isFinite(Date.parse(object.updatedAt))) {
    throw new Error("Backup Storage inventory contains invalid object metadata.");
  }
  return {
    bucket: object.bucket,
    path: object.path,
    size: object.size,
    updatedAt: new Date(object.updatedAt).toISOString(),
    mimeType: typeof object.mimeType === "string" ? object.mimeType : undefined,
    cacheControl: typeof object.cacheControl === "string" ? object.cacheControl : undefined,
  };
}

async function* storageInventory(source) {
  if (typeof source.listStorageObjects !== "function") {
    throw new Error("Backup source does not provide a Storage inventory.");
  }
  let cursor = null;
  const seenCursors = new Set();
  const seenObjects = new Set();
  let count = 0;
  do {
    const page = await source.listStorageObjects(cursor);
    if (!page || !Array.isArray(page.objects)) {
      throw new Error("Backup Storage inventory page is invalid.");
    }
    for (const item of page.objects) {
      count += 1;
      if (count > MAX_STORAGE_OBJECTS) {
        throw new Error("Backup Storage inventory exceeds the configured object limit.");
      }
      const object = validateStorageObject(item);
      const objectKey = `${object.bucket}\u0000${object.path}`;
      if (seenObjects.has(objectKey)) throw new Error("Backup Storage inventory contains a duplicate object.");
      seenObjects.add(objectKey);
      yield object;
    }
    cursor = page.nextCursor ?? null;
    if (cursor !== null) {
      if (typeof cursor !== "string" || cursor.length > 2048 || seenCursors.has(cursor)) {
        throw new Error("Backup Storage inventory cursor is invalid or repeated.");
      }
      seenCursors.add(cursor);
    }
  } while (cursor !== null);
}

function storageMetadata(object) {
  return {
    sourceBucket: object.bucket,
    sourceObjectPath: object.path,
    ...(object.mimeType ? {sourceMimeType: object.mimeType} : {}),
    ...(object.cacheControl ? {sourceCacheControl: object.cacheControl} : {}),
  };
}

/**
 * Executes one all-or-nothing backup run using injected, environment-specific
 * adapters. A run succeeds only after every encrypted object and the encrypted
 * manifest have been downloaded, authenticated, and checksum-verified.
 * Adapters must be separately configured by the eventual isolated Worker.
 */
export async function runFullBackup({
  source,
  objectStore,
  prepareSources,
  encodedKey,
  databaseMajorVersion,
  triggerKind = "scheduled",
  requestedBy = null,
  workspaceRoot = tmpdir(),
  now = new Date(),
  onStatus = async () => {},
}) {
  if (process.env.MMWR_BACKUP_ENABLED !== "true") {
    throw new Error("Backup operations are disabled by configuration.");
  }
  if (typeof prepareSources !== "function" && (!source || !objectStore)) {
    throw new Error("Backup source and encrypted object store are required.");
  }
  if (!(["scheduled", "owner_manual"].includes(triggerKind))
    || (triggerKind === "scheduled" && requestedBy !== null)
    || (triggerKind === "owner_manual"
      && (typeof requestedBy !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedBy)))) {
    throw new Error("Backup trigger metadata is invalid.");
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Backup run requires a valid reference time.");
  }
  const runId = makeRunId(now);
  let workspace = null;
  let activeSource = source;
  let activeObjectStore = objectStore;
  const artifacts = [];
  let finalStatus = "failed";
  let failureCode = "backup_failed";
  let savedManifest = null;
  let encryptedBytes = 0;
  const emitStatus = (status, phase, extras = {}) => onStatus({
    runId,
    triggerKind,
    requestedBy,
    status,
    phase,
    integrityVerified: status === "succeeded",
    artifactCount: artifacts.length,
    encryptedBytes,
    failureCode: status === "failed" ? failureCode : null,
    ...extras,
  });

  try {
    // Record the run before validating worker-only credentials or constructing
    // provider adapters, so the ledger captures setup failures when reachable.
    await emitStatus("running", "database_export");
    if (typeof prepareSources === "function") {
      const prepared = await prepareSources();
      activeSource = prepared?.source;
      activeObjectStore = prepared?.objectStore;
    }
    if (!activeSource || !activeObjectStore) {
      throw new Error("Backup source and encrypted object store are required.");
    }
    if (typeof encodedKey !== "string" || !encodedKey.trim()) {
      throw new Error("Backup encryption key is missing or invalid.");
    }
    if (!Number.isInteger(databaseMajorVersion) || databaseMajorVersion < 13 || databaseMajorVersion > 99) {
      throw new Error("Backup database major version is missing or invalid.");
    }
    assertPrivateWorkspace(workspaceRoot);
    const rootInfo = await lstat(workspaceRoot);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
      throw new Error("Backup workspace root must be a private, non-symbolic directory.");
    }
    workspace = await mkdtemp(resolve(workspaceRoot, "mmwr-backup-"));
    await chmod(workspace, 0o700);

    const maxStorageObjectBytes = getMaxStorageObjectBytes();
    const maxTotalStorageBytes = getMaxTotalStorageBytes();
    if (typeof activeSource.exportDatabase !== "function") {
      throw new Error("Backup source does not provide database export.");
    }
    const databaseExportStartedAt = new Date().toISOString();
    const databaseExports = validateDatabaseExports(
      await activeSource.exportDatabase({runId, workspace}),
      workspace,
    );
    const databaseExportCompletedAt = new Date().toISOString();

    for (const item of databaseExports) {
      const artifact = await saveEncryptedArtifact({
        runId,
        artifactId: newBackupArtifactId(item.kind === "database_platform_compatibility" ? "platform_compat" : item.kind),
        kind: item.kind,
        sourcePath: item.path,
        encodedKey,
        workspace,
        objectStore: activeObjectStore,
      });
      artifacts.push(artifact);
      encryptedBytes += artifact.encryptedBytes;
      await emitStatus("running", "database_export");
    }

    await emitStatus("running", "storage_backup");
    if (typeof activeSource.downloadStorageObject !== "function"
      || typeof activeSource.isStorageObjectUnchanged !== "function"
      || typeof activeSource.listStorageBuckets !== "function") {
      throw new Error("Backup source does not provide complete Storage inventory checks.");
    }

    const initialStorageBuckets = await activeSource.listStorageBuckets();
    const initialStorageInventory = [];
    for await (const object of storageInventory(activeSource)) initialStorageInventory.push(object);
    initialStorageInventory.reduce((total, object) => {
      const nextTotal = total + object.size;
      if (!Number.isSafeInteger(nextTotal) || nextTotal > maxTotalStorageBytes) {
        throw new Error("Storage inventory exceeds the configured total backup byte budget.");
      }
      return nextTotal;
    }, 0);

    for (const object of initialStorageInventory) {
      if (object.size > maxStorageObjectBytes) {
        throw new Error("A Storage object exceeds the configured per-object backup byte limit.");
      }
      const artifactId = newBackupArtifactId("storage");
      const sourcePath = resolve(workspace, `${artifactId}.source`);
      const bounded = createStorageByteLimit(maxStorageObjectBytes, object.size);
      await pipeline(
        asReadableStream(await activeSource.downloadStorageObject(object)),
        bounded.meter,
        createWriteStream(sourcePath, {flags: "wx", mode: 0o600}),
      );
      if (bounded.getBytes() !== object.size) {
        throw new Error("A Storage object size did not match its inventory.");
      }
      const current = await activeSource.isStorageObjectUnchanged(object);
      if (current !== true) {
        throw new Error("A Storage object changed or disappeared during the backup run.");
      }
      const artifact = await saveEncryptedArtifact({
        runId,
        artifactId,
        kind: "storage_object",
        sourcePath,
        encodedKey,
        workspace,
        objectStore: activeObjectStore,
        storageMetadata: storageMetadata(object),
      });
      if (artifact.plaintextBytes !== object.size) {
        throw new Error("A Storage object size changed while it was being copied.");
      }
      artifacts.push(artifact);
      encryptedBytes += artifact.encryptedBytes;
      await emitStatus("running", "storage_backup");
    }

    const finalStorageInventory = [];
    for await (const object of storageInventory(activeSource)) finalStorageInventory.push(object);
    const finalStorageBuckets = await activeSource.listStorageBuckets();
    finalStorageInventory.reduce((total, object) => {
      const nextTotal = total + object.size;
      if (!Number.isSafeInteger(nextTotal) || nextTotal > maxTotalStorageBytes) {
        throw new Error("Storage inventory exceeds the configured total backup byte budget.");
      }
      return nextTotal;
    }, 0);
    const inventoryFingerprint = (items) => JSON.stringify(items
      .map((item) => ({
        bucket: item.bucket,
        path: item.path,
        size: item.size,
        updatedAt: item.updatedAt,
        ...(item.mimeType ? {mimeType: item.mimeType} : {}),
        ...(item.cacheControl ? {cacheControl: item.cacheControl} : {}),
      }))
      .sort((left, right) => `${left.bucket}\u0000${left.path}`.localeCompare(`${right.bucket}\u0000${right.path}`)));
    if (inventoryFingerprint(initialStorageInventory) !== inventoryFingerprint(finalStorageInventory)) {
      throw new Error("Storage inventory changed while the backup run was in progress.");
    }
    const bucketFingerprint = (buckets) => JSON.stringify(buckets
      .map((bucket) => ({
        id: bucket.id,
        name: bucket.name,
        public: bucket.public,
        fileSizeLimit: bucket.fileSizeLimit,
        allowedMimeTypes: bucket.allowedMimeTypes === null ? null : [...bucket.allowedMimeTypes].sort(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)));
    if (bucketFingerprint(initialStorageBuckets) !== bucketFingerprint(finalStorageBuckets)) {
      throw new Error("Storage bucket configuration changed while the backup run was in progress.");
    }

    const manifest = createBackupManifest({
      runId,
      createdAt: now,
      databaseMajorVersion,
      databaseExportStartedAt,
      databaseExportCompletedAt,
      storageInventoryVerified: true,
      storageBuckets: initialStorageBuckets,
      artifacts,
    });
    const manifestArtifactId = newBackupArtifactId("manifest");
    const manifestPath = resolve(workspace, `${manifestArtifactId}.json`);
    await writeFile(manifestPath, JSON.stringify(manifest), {flag: "wx", mode: 0o600});

    await emitStatus("running", "manifest_verification");
    savedManifest = await saveEncryptedArtifact({
      runId,
      artifactId: manifestArtifactId,
      kind: "manifest",
      sourcePath: manifestPath,
      encodedKey,
      workspace,
      objectStore: activeObjectStore,
    });
    const {plaintextPath} = await verifyRemoteArtifact({
      objectStore: activeObjectStore,
      artifact: savedManifest,
      runId,
      encodedKey,
      workspace,
    });
    const storedManifest = await readFile(plaintextPath, "utf8");
    parseBackupManifest(storedManifest, runId);

    encryptedBytes += savedManifest.encryptedBytes;
    finalStatus = "succeeded";
    await emitStatus(finalStatus, "complete", {
      artifactCount: artifacts.length + 1,
      manifestObjectKey: savedManifest.objectKey,
      completedAt: new Date().toISOString(),
    });
    return {
      runId,
      status: finalStatus,
      integrityVerified: true,
      artifactCount: artifacts.length + 1,
      encryptedBytes,
      manifestObjectKey: savedManifest.objectKey,
    };
  } catch (error) {
    if (error instanceof BackupValidationError) failureCode = "backup_validation_failed";
    await emitStatus("failed", "failed").catch(() => {});
    // Provider errors can contain database URLs, object paths, or source names.
    // Keep them out of the public worker error and status payload.
    throw new Error(`Backup run failed (${failureCode}).`);
  } finally {
    if (workspace) await rm(workspace, {recursive: true, force: true}).catch(() => {});
    await Promise.resolve().then(() => activeSource?.close?.()).catch(() => {});
    await Promise.resolve().then(() => activeObjectStore?.close?.()).catch(() => {});
  }
}

