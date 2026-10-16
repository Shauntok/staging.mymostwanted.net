import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Readable} from "node:stream";
import test from "node:test";
import {createClient} from "@supabase/supabase-js";
import {encryptBackupFile} from "./crypto.mjs";
import {createBackupManifest} from "./manifest.mjs";
import {restoreStorageBackupRun} from "./restore-storage-run.mjs";
import {createSupabaseStorageTarget} from "./supabase-storage-target.mjs";

const enabled = process.env.MMWR_TEST_LOCAL_STORAGE_RESTORE === "true";
const databaseKinds = [
  "database_roles", "database_schema", "database_auth_schema", "database_storage_schema",
  "database_data", "database_auth_data", "database_storage_data", "migration_history",
  "database_platform_compatibility",
];
const digest = (value) => createHash("sha256").update(value).digest("hex");

test("local isolated Supabase restores a synthetic encrypted backup Storage object", {skip: !enabled}, async (t) => {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const projectRef = process.env.MMWR_LOCAL_SUPABASE_PROJECT_REF;
  assert.ok(url && secretKey && projectRef, "explicit local Supabase URL, secret and project ref are required");
  const parsedUrl = new URL(url);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(parsedUrl.hostname), "local Storage test must use loopback");
  assert.notEqual(process.env.NODE_ENV, "production");

  const suffix = randomBytes(8).toString("hex");
  const runId = `local_restore_${suffix}`;
  const manifestArtifactId = `manifest_${suffix}`;
  const objectArtifactId = `storage_${suffix}`;
  const bucketId = `mmwr-restore-${suffix}`;
  const objectPath = `synthetic/${suffix}.bin`;
  const objectBytes = Buffer.from(`synthetic isolated restore fixture ${suffix}`);
  const encodedKey = randomBytes(32).toString("base64");
  const workspace = await mkdtemp(join(tmpdir(), "mmwr-local-storage-restore-"));
  const client = createClient(url, secretKey, {auth: {autoRefreshToken: false, persistSession: false}});
  const target = createSupabaseStorageTarget({url, secretKey, projectRef});
  const remoteObjects = new Map();
  const objectStore = {
    async headEncryptedObject(key) {
      return remoteObjects.get(key)?.head ?? null;
    },
    async getEncryptedObject(key) {
      const stored = remoteObjects.get(key);
      if (!stored) throw new Error("synthetic encrypted object is missing");
      return Readable.from([stored.bytes]);
    },
  };

  t.after(async () => {
    const bucketInventory = await client.storage.listBuckets();
    if (bucketInventory.error) throw new Error("Local Storage restore cleanup could not list buckets.");
    if (bucketInventory.data?.some((bucket) => bucket.id === bucketId)) {
      const removed = await client.storage.from(bucketId).remove([objectPath]);
      if (removed.error) throw new Error("Local Storage restore object cleanup failed.");
      const deleted = await client.storage.deleteBucket(bucketId);
      if (deleted.error) throw new Error("Local Storage restore bucket cleanup failed.");
      const remaining = await client.storage.listBuckets();
      if (remaining.error || remaining.data?.some((bucket) => bucket.id === bucketId)) {
        throw new Error("Local Storage restore test bucket remains after cleanup.");
      }
    }
    await rm(workspace, {recursive: true, force: true});
  });

  assert.equal((await target.listBuckets()).some((bucket) => bucket.id === bucketId), false);
  const databaseArtifacts = databaseKinds.map((kind, index) => {
    const artifactId = `db_${index}_${suffix}`;
    const plaintext = Buffer.from(`synthetic ${kind} ${suffix}`);
    return {
      artifactId,
      kind,
      objectKey: `runs/${runId}/${artifactId}.mmwrbk`,
      plaintextBytes: plaintext.length,
      plaintextSha256: digest(plaintext),
      encryptedBytes: plaintext.length + 36,
      encryptedSha256: digest(`encrypted ${kind} ${suffix}`),
    };
  });
  const objectInputPath = join(workspace, "source.object");
  const objectEncryptedPath = join(workspace, "source.object.mmwrbk");
  await writeFile(objectInputPath, objectBytes);
  const objectEncryption = await encryptBackupFile({
    inputPath: objectInputPath,
    outputPath: objectEncryptedPath,
    encodedKey,
    runId,
    artifactId: objectArtifactId,
  });
  const objectKey = `runs/${runId}/${objectArtifactId}.mmwrbk`;
  remoteObjects.set(objectKey, {
    bytes: await readFile(objectEncryptedPath),
    head: {
      contentLength: objectEncryption.encrypted.bytes,
      encryptedSha256: objectEncryption.encrypted.sha256,
      formatVersion: "1",
    },
  });
  const manifest = createBackupManifest({
    runId,
    createdAt: new Date().toISOString(),
    databaseMajorVersion: 17,
    databaseExportStartedAt: new Date(Date.now() - 1000).toISOString(),
    databaseExportCompletedAt: new Date().toISOString(),
    storageInventoryVerified: true,
    storageBuckets: [{
      id: bucketId,
      name: bucketId,
      public: false,
      fileSizeLimit: 1024,
      allowedMimeTypes: ["application/octet-stream"],
    }],
    artifacts: [...databaseArtifacts, {
      artifactId: objectArtifactId,
      kind: "storage_object",
      objectKey,
      plaintextBytes: objectBytes.length,
      plaintextSha256: digest(objectBytes),
      encryptedBytes: objectEncryption.encrypted.bytes,
      encryptedSha256: objectEncryption.encrypted.sha256,
      sourceBucket: bucketId,
      sourceObjectPath: objectPath,
      sourceMimeType: "application/octet-stream",
      sourceCacheControl: "0",
    }],
  });
  const manifestInputPath = join(workspace, "manifest.json");
  const manifestEncryptedPath = join(workspace, "manifest.mmwrbk");
  await writeFile(manifestInputPath, JSON.stringify(manifest));
  const manifestEncryption = await encryptBackupFile({
    inputPath: manifestInputPath,
    outputPath: manifestEncryptedPath,
    encodedKey,
    runId,
    artifactId: manifestArtifactId,
  });
  const manifestObjectKey = `runs/${runId}/${manifestArtifactId}.mmwrbk`;
  remoteObjects.set(manifestObjectKey, {
    bytes: await readFile(manifestEncryptedPath),
    head: {
      contentLength: manifestEncryption.encrypted.bytes,
      encryptedSha256: manifestEncryption.encrypted.sha256,
      formatVersion: "1",
    },
  });

  const originalRestoreGate = process.env.MMWR_BACKUP_RESTORE_ENABLED;
  process.env.MMWR_BACKUP_RESTORE_ENABLED = "true";
  let result;
  try {
    result = await restoreStorageBackupRun({
      backupRun: {runId, status: "succeeded", integrityVerified: true, manifestObjectKey},
      objectStore,
      encodedKey,
      sourceProjectRef: "zzzzzzzzzzzzzzzzzzzz",
      targetProjectRef: projectRef,
      targetEnvironment: "isolated",
      targetStorage: target,
      maxStorageObjectBytes: 1024,
      maxTotalStorageBytes: 2048,
    });
  } finally {
    if (originalRestoreGate === undefined) delete process.env.MMWR_BACKUP_RESTORE_ENABLED;
    else process.env.MMWR_BACKUP_RESTORE_ENABLED = originalRestoreGate;
  }

  assert.deepEqual(result, {restoredBuckets: 1, restoredObjects: 1, writesPerformed: true});
  assert.deepEqual(await target.listObjects(bucketId), [{path: objectPath}]);
  const restoredBucket = (await target.listBuckets()).find((bucket) => bucket.id === bucketId);
  assert.equal(restoredBucket?.public, false);
  assert.equal(restoredBucket?.fileSizeLimit, 1024);
});
