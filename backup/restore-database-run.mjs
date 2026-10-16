import {createHash, randomBytes} from "node:crypto";
import {createWriteStream} from "node:fs";
import {chmod, mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {Readable, Transform} from "node:stream";
import {pipeline} from "node:stream/promises";
import {decryptBackupFile, BackupValidationError, safeBackupObjectName} from "./crypto.mjs";
import {parseBackupManifest} from "./manifest.mjs";

const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;
const MAX_DATABASE_ARTIFACT_BYTES = 2 * 1024 * 1024 * 1024;
const DATABASE_RESTORE_ORDER = Object.freeze([
  "database_roles",
  "database_schema",
  "database_auth_schema",
  "database_storage_schema",
  "database_data",
  "database_auth_data",
  "database_storage_data",
  "migration_history",
]);
const REQUIRED_DATABASE_KINDS = Object.freeze([...DATABASE_RESTORE_ORDER, "database_platform_compatibility"]);

function validatePlatformCompatibility(value, expectedDatabaseMajorVersion) {
  if (!value || value.databaseMajorVersion !== expectedDatabaseMajorVersion
    || !Array.isArray(value.authMigrations) || value.authMigrations.length > 10000
    || value.authMigrations.some((version) => typeof version !== "string" || !/^\d{2,20}$/.test(version))
    || new Set(value.authMigrations).size !== value.authMigrations.length
    || !Array.isArray(value.storageMigrations) || value.storageMigrations.length > 10000
    || value.storageMigrations.some((migration) => !migration || !Number.isSafeInteger(migration.id) || migration.id < 0
      || typeof migration.hash !== "string" || !/^[a-f0-9]{40,64}$/i.test(migration.hash)
      || typeof migration.name !== "string" || !/^[a-z0-9_-]{1,200}$/i.test(migration.name))
    || new Set(value.storageMigrations.map((migration) => migration.id)).size !== value.storageMigrations.length) {
    throw new BackupValidationError("Backup platform compatibility metadata is invalid.");
  }
  return value;
}

function validateBackupRun(backupRun) {
  if (!backupRun || typeof backupRun.runId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(backupRun.runId)
    || backupRun.status !== "succeeded" || backupRun.integrityVerified !== true
    || typeof backupRun.manifestObjectKey !== "string") {
    throw new Error("Database restore requires a successful, integrity-verified backup run.");
  }
  const match = /^runs\/([A-Za-z0-9_-]{1,80})\/([A-Za-z0-9_-]{1,80})\.mmwrbk$/.exec(backupRun.manifestObjectKey);
  if (!match || match[1] !== backupRun.runId
    || safeBackupObjectName(match[1], match[2]) !== backupRun.manifestObjectKey) {
    throw new Error("Database restore manifest object reference is invalid.");
  }
  return {runId: backupRun.runId, manifestArtifactId: match[2], manifestObjectKey: backupRun.manifestObjectKey};
}

async function downloadAndVerify({objectStore, artifact, runId, workspace, label, maxBytes}) {
  const remoteKey = safeBackupObjectName(runId, artifact.artifactId);
  if (artifact.objectKey !== remoteKey) throw new BackupValidationError("Backup manifest contains an invalid object reference.");
  let head;
  try {
    head = await objectStore.headEncryptedObject(remoteKey);
  } catch {
    throw new Error("An encrypted database backup object could not be inspected.");
  }
  if (!head || head.formatVersion !== "1"
    || !Number.isSafeInteger(head.contentLength) || head.contentLength < 1 || head.contentLength > maxBytes + 36
    || typeof head.encryptedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(head.encryptedSha256)) {
    throw new BackupValidationError("Encrypted database backup object metadata is invalid.");
  }
  if ((artifact.encryptedBytes !== undefined && artifact.encryptedBytes !== head.contentLength)
    || (artifact.encryptedSha256 !== undefined && artifact.encryptedSha256 !== head.encryptedSha256)) {
    throw new BackupValidationError("Encrypted database backup metadata differs from the manifest.");
  }
  let remoteStream;
  try {
    remoteStream = await objectStore.getEncryptedObject(remoteKey);
  } catch {
    throw new Error("An encrypted database backup object could not be downloaded.");
  }
  if (!remoteStream || typeof remoteStream[Symbol.asyncIterator] !== "function") {
    throw new Error("Database backup download returned an invalid stream.");
  }
  const encryptedPath = resolve(workspace, `${label}_${randomBytes(8).toString("hex")}.mmwrbk`);
  const hash = createHash("sha256");
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes + 36 || bytes > head.contentLength) {
        callback(new BackupValidationError("Encrypted database backup exceeded its verified byte limit."));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
    flush(callback) {
      callback(bytes === head.contentLength ? undefined : new BackupValidationError("Encrypted database backup size did not match its metadata."));
    },
  });
  await pipeline(Readable.from(remoteStream), meter, createWriteStream(encryptedPath, {flags: "wx", mode: 0o600}));
  const digest = hash.digest("hex");
  if (digest !== head.encryptedSha256) throw new BackupValidationError("Encrypted database backup digest does not match its metadata.");
  return {encryptedPath, encryptedBytes: bytes, encryptedSha256: digest};
}

function assertTargetIdentity({preflight, targetDatabase, targetProjectRef, targetEnvironment}) {
  if (!preflight || preflight.projectRef !== targetProjectRef
    || targetDatabase.projectRef !== targetProjectRef
    || preflight.environment !== "isolated" || targetEnvironment !== "isolated"
    || preflight.pristine !== true) {
    throw new Error("Database restore requires a pristine isolated target matching the requested project reference.");
  }
}

/**
 * Authenticates every database artifact before the first write, then applies
 * the components to an explicitly pristine isolated target in dependency order.
 * A mid-restore failure is partial and must be handled by discarding that target.
 */
export async function restoreDatabaseBackupRun({
  backupRun,
  objectStore,
  encodedKey,
  sourceProjectRef,
  targetProjectRef,
  targetEnvironment,
  targetDatabase,
  maxDatabaseArtifactBytes = MAX_DATABASE_ARTIFACT_BYTES,
}) {
  if (process.env.MMWR_BACKUP_RESTORE_ENABLED !== "true") {
    throw new Error("Backup restore operations are disabled by configuration.");
  }
  const run = validateBackupRun(backupRun);
  if (typeof sourceProjectRef !== "string" || !/^[a-z0-9]{20}$/.test(sourceProjectRef)
    || typeof targetProjectRef !== "string" || !/^[a-z0-9]{20}$/.test(targetProjectRef)) {
    throw new Error("Database restore source or target project reference is invalid.");
  }
  if (sourceProjectRef === targetProjectRef || targetEnvironment !== "isolated") {
    throw new Error("Database restore may only target a different, explicitly isolated project.");
  }
  if (!Number.isSafeInteger(maxDatabaseArtifactBytes) || maxDatabaseArtifactBytes < 1
    || maxDatabaseArtifactBytes > MAX_DATABASE_ARTIFACT_BYTES) {
    throw new Error("Database restore artifact byte limit is invalid.");
  }
  if (!objectStore || typeof objectStore.getEncryptedObject !== "function"
    || typeof objectStore.headEncryptedObject !== "function"
    || !targetDatabase || typeof targetDatabase.preflight !== "function"
    || typeof targetDatabase.verifyPlatformCompatibility !== "function"
    || typeof targetDatabase.applyArtifact !== "function") {
    throw new Error("Database restore adapters are incomplete.");
  }

  let preflight;
  try {
    preflight = await targetDatabase.preflight();
  } catch {
    throw new Error("Database restore target preflight failed.");
  }
  assertTargetIdentity({preflight, targetDatabase, targetProjectRef, targetEnvironment});

  const workspace = await mkdtemp(resolve(tmpdir(), "mmwr-database-restore-"));
  await chmod(workspace, 0o700).catch(() => {});
  const appliedKinds = [];
  try {
    const manifestEncrypted = await downloadAndVerify({
      objectStore,
      artifact: {artifactId: run.manifestArtifactId, objectKey: run.manifestObjectKey},
      runId: run.runId,
      workspace,
      label: "manifest",
      maxBytes: MAX_MANIFEST_BYTES,
    });
    const manifestPath = resolve(workspace, "manifest.json");
    await decryptBackupFile({
      inputPath: manifestEncrypted.encryptedPath,
      outputPath: manifestPath,
      encodedKey,
      runId: run.runId,
      artifactId: run.manifestArtifactId,
      expectedEncryptedSha256: manifestEncrypted.encryptedSha256,
      expectedEncryptedBytes: manifestEncrypted.encryptedBytes,
    });
    const manifest = parseBackupManifest(await readFile(manifestPath, "utf8"), run.runId);
    const artifactsByKind = new Map();
    for (const artifact of manifest.artifacts) {
      if (!REQUIRED_DATABASE_KINDS.includes(artifact.kind)) continue;
      const entries = artifactsByKind.get(artifact.kind) ?? [];
      entries.push(artifact);
      artifactsByKind.set(artifact.kind, entries);
    }
    for (const kind of REQUIRED_DATABASE_KINDS) {
      if (artifactsByKind.get(kind)?.length !== 1) {
        throw new BackupValidationError(`Backup manifest must contain exactly one ${kind} artifact.`);
      }
    }

    const verifiedArtifacts = [];
    for (const kind of REQUIRED_DATABASE_KINDS) {
      const artifact = artifactsByKind.get(kind)[0];
      if (artifact.plaintextBytes > maxDatabaseArtifactBytes) {
        throw new BackupValidationError("Database artifact exceeds the configured restore byte limit.");
      }
      const encrypted = await downloadAndVerify({
        objectStore,
        artifact,
        runId: run.runId,
        workspace,
        label: artifact.artifactId,
        maxBytes: maxDatabaseArtifactBytes,
      });
      const plaintextPath = resolve(workspace, `${artifact.artifactId}.sql`);
      await decryptBackupFile({
        inputPath: encrypted.encryptedPath,
        outputPath: plaintextPath,
        encodedKey,
        runId: run.runId,
        artifactId: artifact.artifactId,
        expectedPlaintextSha256: artifact.plaintextSha256,
        expectedPlaintextBytes: artifact.plaintextBytes,
        expectedEncryptedSha256: encrypted.encryptedSha256,
        expectedEncryptedBytes: encrypted.encryptedBytes,
      });
      verifiedArtifacts.push({kind, filePath: plaintextPath});
    }

    const compatibilityArtifact = verifiedArtifacts.find((artifact) => artifact.kind === "database_platform_compatibility");
    let platformCompatibility;
    try {
      platformCompatibility = validatePlatformCompatibility(
        JSON.parse(await readFile(compatibilityArtifact.filePath, "utf8")),
        manifest.databaseMajorVersion,
      );
      await targetDatabase.verifyPlatformCompatibility(platformCompatibility);
    } catch (error) {
      if (error instanceof BackupValidationError) throw error;
      throw new Error("Isolated target Supabase platform migration state is incompatible with the backup.");
    }

    for (const artifact of verifiedArtifacts) {
      if (artifact.kind === "database_platform_compatibility") continue;
      try {
        await targetDatabase.applyArtifact(artifact);
      } catch (error) {
        const safeDiagnostic = error instanceof Error
          ? /^Local database restore psql command failed \(([a-z_]+)\)\.$/.exec(error.message)?.[1]
          : undefined;
        const diagnosticLabel = safeDiagnostic ? ` (${safeDiagnostic})` : "";
        throw new Error(`Database restore stopped at ${artifact.kind}${diagnosticLabel} after ${appliedKinds.length} component(s); the isolated target may be partially restored and must be discarded.`);
      }
      appliedKinds.push(artifact.kind);
    }
    return {runId: run.runId, targetProjectRef, appliedKinds, writesPerformed: true};
  } finally {
    await rm(workspace, {recursive: true, force: true}).catch(() => {});
  }
}
