import {createHash, randomBytes} from "node:crypto";
import {createWriteStream} from "node:fs";
import {chmod, mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {Readable, Transform} from "node:stream";
import {pipeline} from "node:stream/promises";
import {decryptBackupFile, BackupValidationError, safeBackupObjectName} from "./crypto.mjs";
import {getMaxStorageObjectBytes, getMaxTotalStorageBytes} from "./limits.mjs";
import {parseBackupManifest} from "./manifest.mjs";
import {restoreStorageArtifacts} from "./restore-storage.mjs";

const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;

function validateBackupRun(backupRun) {
  if (!backupRun || typeof backupRun.runId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(backupRun.runId)
    || backupRun.status !== "succeeded" || backupRun.integrityVerified !== true
    || typeof backupRun.manifestObjectKey !== "string") {
    throw new Error("Storage restore requires a successful, integrity-verified backup run.");
  }
  const match = /^runs\/([A-Za-z0-9_-]{1,80})\/([A-Za-z0-9_-]{1,80})\.mmwrbk$/.exec(backupRun.manifestObjectKey);
  if (!match || match[1] !== backupRun.runId
    || safeBackupObjectName(match[1], match[2]) !== backupRun.manifestObjectKey) {
    throw new Error("Storage restore manifest object reference is invalid.");
  }
  return {runId: backupRun.runId, manifestArtifactId: match[2], manifestObjectKey: backupRun.manifestObjectKey};
}

async function writeAndHashEncryptedObject({stream, outputPath, expectedBytes, maxBytes}) {
  if (!stream || typeof stream[Symbol.asyncIterator] !== "function") {
    throw new Error("Backup object download returned an invalid stream.");
  }
  const hash = createHash("sha256");
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes || bytes > expectedBytes) {
        callback(new BackupValidationError("Encrypted backup object exceeded its verified byte limit."));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
    flush(callback) {
      callback(bytes === expectedBytes ? undefined : new BackupValidationError("Encrypted backup object size did not match its verified metadata."));
    },
  });
  await pipeline(Readable.from(stream), meter, createWriteStream(outputPath, {flags: "wx", mode: 0o600}));
  return {bytes, sha256: hash.digest("hex")};
}

async function getVerifiedEncryptedObject({objectStore, artifact, runId, maxBytes, workspace, label}) {
  const remoteKey = safeBackupObjectName(runId, artifact.artifactId);
  if (artifact.objectKey !== remoteKey) throw new BackupValidationError("Backup manifest contains an invalid object reference.");
  let head;
  try {
    head = await objectStore.headEncryptedObject(remoteKey);
  } catch {
    throw new Error("An encrypted backup object could not be inspected.");
  }
  if (!head || head.formatVersion !== "1"
    || !Number.isSafeInteger(head.contentLength) || head.contentLength < 1 || head.contentLength > maxBytes
    || typeof head.encryptedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(head.encryptedSha256)) {
    throw new BackupValidationError("Encrypted backup object metadata is invalid.");
  }
  if (artifact.encryptedBytes !== undefined && artifact.encryptedBytes !== head.contentLength) {
    throw new BackupValidationError("Encrypted backup object size differs from the manifest.");
  }
  if (artifact.encryptedSha256 !== undefined && artifact.encryptedSha256 !== head.encryptedSha256) {
    throw new BackupValidationError("Encrypted backup object digest differs from the manifest.");
  }

  let remoteStream;
  try {
    remoteStream = await objectStore.getEncryptedObject(remoteKey);
  } catch {
    throw new Error("An encrypted backup object could not be downloaded.");
  }
  const encryptedPath = resolve(workspace, `${label}_${randomBytes(8).toString("hex")}.mmwrbk`);
  const digest = await writeAndHashEncryptedObject({
    stream: remoteStream,
    outputPath: encryptedPath,
    expectedBytes: head.contentLength,
    maxBytes,
  });
  if (digest.sha256 !== head.encryptedSha256) {
    throw new BackupValidationError("Encrypted backup object digest does not match its stored metadata.");
  }
  return {encryptedPath, encryptedBytes: digest.bytes, encryptedSha256: digest.sha256};
}

/**
 * Downloads, authenticates, and restores Storage objects from one successful
 * encrypted backup run. It never restores the database or touches hosted state
 * unless the caller supplies a matching explicitly isolated Storage adapter.
 */
export async function restoreStorageBackupRun({
  backupRun,
  objectStore,
  encodedKey,
  sourceProjectRef,
  targetProjectRef,
  targetEnvironment,
  targetStorage,
  maxStorageObjectBytes,
  maxTotalStorageBytes,
}) {
  if (process.env.MMWR_BACKUP_RESTORE_ENABLED !== "true") {
    throw new Error("Backup restore operations are disabled by configuration.");
  }
  const storageObjectLimit = maxStorageObjectBytes === undefined ? getMaxStorageObjectBytes() : maxStorageObjectBytes;
  const totalStorageLimit = maxTotalStorageBytes === undefined ? getMaxTotalStorageBytes() : maxTotalStorageBytes;
  const run = validateBackupRun(backupRun);
  if (typeof sourceProjectRef !== "string" || !/^[a-z0-9]{20}$/.test(sourceProjectRef)
    || typeof targetProjectRef !== "string" || !/^[a-z0-9]{20}$/.test(targetProjectRef)) {
    throw new Error("Storage restore source or target project reference is invalid.");
  }
  if (sourceProjectRef === targetProjectRef) {
    throw new Error("An isolated restore target must differ from its source project.");
  }
  if (targetEnvironment !== "isolated") {
    throw new Error("Storage restore may only target an explicitly isolated environment.");
  }
  if (!targetStorage || targetStorage.projectRef !== targetProjectRef) {
    throw new Error("Storage restore adapter project reference must match the isolated target project reference.");
  }
  if (!objectStore || typeof objectStore.getEncryptedObject !== "function"
    || typeof objectStore.headEncryptedObject !== "function") {
    throw new Error("Storage restore backup object store is incomplete.");
  }
  if (!Number.isSafeInteger(storageObjectLimit) || storageObjectLimit < 1
    || !Number.isSafeInteger(totalStorageLimit) || totalStorageLimit < 1) {
    throw new Error("Storage restore byte budgets are invalid.");
  }

  const workspace = await mkdtemp(resolve(tmpdir(), "mmwr-storage-restore-run-"));
  await chmod(workspace, 0o700).catch(() => {});
  try {
    const manifestHead = await getVerifiedEncryptedObject({
      objectStore,
      artifact: {artifactId: run.manifestArtifactId, objectKey: run.manifestObjectKey},
      runId: run.runId,
      maxBytes: MAX_MANIFEST_BYTES + 36,
      workspace,
      label: "manifest",
    });
    const manifestPlaintextPath = resolve(workspace, "manifest.json");
    await decryptBackupFile({
      inputPath: manifestHead.encryptedPath,
      outputPath: manifestPlaintextPath,
      encodedKey,
      runId: run.runId,
      artifactId: run.manifestArtifactId,
      expectedEncryptedSha256: manifestHead.encryptedSha256,
      expectedEncryptedBytes: manifestHead.encryptedBytes,
    });
    const manifest = parseBackupManifest(await readFile(manifestPlaintextPath, "utf8"), run.runId);

    const storageArtifacts = manifest.artifacts.filter((artifact) => artifact.kind === "storage_object");
    let totalBytes = 0;
    const restoreObjects = [];
    for (const artifact of storageArtifacts) {
      if (artifact.plaintextBytes > storageObjectLimit) {
        throw new BackupValidationError("Storage object exceeds the configured restore byte limit.");
      }
      totalBytes += artifact.plaintextBytes;
      if (!Number.isSafeInteger(totalBytes) || totalBytes > totalStorageLimit) {
        throw new BackupValidationError("Storage objects exceed the configured total restore byte budget.");
      }
      const encrypted = await getVerifiedEncryptedObject({
        objectStore,
        artifact,
        runId: run.runId,
        maxBytes: storageObjectLimit + 36,
        workspace,
        label: artifact.artifactId,
      });
      const plaintextPath = resolve(workspace, `${artifact.artifactId}.plain`);
      await decryptBackupFile({
        inputPath: encrypted.encryptedPath,
        outputPath: plaintextPath,
        encodedKey,
        runId: run.runId,
        artifactId: artifact.artifactId,
        expectedPlaintextSha256: artifact.plaintextSha256,
        expectedPlaintextBytes: artifact.plaintextBytes,
        expectedEncryptedSha256: artifact.encryptedSha256,
        expectedEncryptedBytes: artifact.encryptedBytes,
      });
      restoreObjects.push({
        bucket: artifact.sourceBucket,
        path: artifact.sourceObjectPath,
        filePath: plaintextPath,
        mimeType: artifact.sourceMimeType ?? null,
        cacheControl: artifact.sourceCacheControl ?? null,
        plaintextSha256: artifact.plaintextSha256,
        plaintextBytes: artifact.plaintextBytes,
      });
    }

    return await restoreStorageArtifacts({
      sourceProjectRef,
      targetProjectRef,
      targetEnvironment,
      storageBuckets: manifest.storageBuckets,
      storageObjects: restoreObjects,
      targetStorage,
    });
  } finally {
    await rm(workspace, {recursive: true, force: true}).catch(() => {});
  }
}
