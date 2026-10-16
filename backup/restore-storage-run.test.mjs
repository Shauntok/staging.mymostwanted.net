import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Readable} from "node:stream";
import test from "node:test";
import {encryptBackupFile} from "./crypto.mjs";
import {createBackupManifest} from "./manifest.mjs";
import {restoreStorageBackupRun} from "./restore-storage-run.mjs";

const originalRestoreGate=process.env.MMWR_BACKUP_RESTORE_ENABLED;
test.beforeEach(()=>{process.env.MMWR_BACKUP_RESTORE_ENABLED="true";});
test.afterEach(()=>{
  if(originalRestoreGate===undefined)delete process.env.MMWR_BACKUP_RESTORE_ENABLED;
  else process.env.MMWR_BACKUP_RESTORE_ENABLED=originalRestoreGate;
});

const runId = "restore_run";
const manifestArtifactId = "manifest_restore";
const sourceProjectRef = "abcdefghijklmnopqrst";
const targetProjectRef = "bcdefghijklmnopqrstu";
const encodedKey = randomBytes(32).toString("base64");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const databaseKinds = [
  "database_roles", "database_schema", "database_auth_schema", "database_storage_schema",
  "database_data", "database_auth_data", "database_storage_data", "migration_history",
  "database_platform_compatibility",
];

async function makeEncryptedRun(t) {
  const workspace = await mkdtemp(join(tmpdir(), "mmwr-restore-run-test-"));
  t.after(() => rm(workspace, {recursive: true, force: true}));
  const remote = new Map();
  const addEncrypted = async (artifactId, plaintext) => {
    const inputPath = join(workspace, `${artifactId}.plain`);
    const outputPath = join(workspace, `${artifactId}.mmwrbk`);
    await writeFile(inputPath, plaintext);
    const metadata = await encryptBackupFile({inputPath, outputPath, encodedKey, runId, artifactId});
    const objectKey = `runs/${runId}/${artifactId}.mmwrbk`;
    remote.set(objectKey, {
      bytes: await readFile(outputPath),
      head: {
        contentLength: metadata.encrypted.bytes,
        encryptedSha256: metadata.encrypted.sha256,
        formatVersion: "1",
      },
    });
    return {objectKey, ...metadata};
  };

  const storagePlaintext = Buffer.from("authenticated storage fixture");
  const storageEncrypted = await addEncrypted("storage_restore", storagePlaintext);
  const artifacts = databaseKinds.map((kind, index) => {
    const artifactId = `database_${index}`;
    const plaintext = Buffer.from(`synthetic ${kind}`);
    return {
      artifactId,
      kind,
      objectKey: `runs/${runId}/${artifactId}.mmwrbk`,
      plaintextBytes: plaintext.length,
      plaintextSha256: digest(plaintext),
      encryptedBytes: plaintext.length + 36,
      encryptedSha256: digest(`encrypted ${kind}`),
    };
  });
  artifacts.push({
    artifactId: "storage_restore",
    kind: "storage_object",
    objectKey: storageEncrypted.objectKey,
    plaintextBytes: storagePlaintext.length,
    plaintextSha256: digest(storagePlaintext),
    encryptedBytes: storageEncrypted.encrypted.bytes,
    encryptedSha256: storageEncrypted.encrypted.sha256,
    sourceBucket: "evidence",
    sourceObjectPath: "submission/file.bin",
    sourceMimeType: "application/octet-stream",
    sourceCacheControl: "private, no-store",
  });
  const manifest = createBackupManifest({
    runId,
    createdAt: "2026-10-05T00:00:00Z",
    databaseMajorVersion: 17,
    databaseExportStartedAt: "2026-10-04T23:59:00Z",
    databaseExportCompletedAt: "2026-10-05T00:00:00Z",
    storageInventoryVerified: true,
    storageBuckets: [{id: "evidence", name: "evidence", public: false, fileSizeLimit: null, allowedMimeTypes: null}],
    artifacts,
  });
  const manifestEncrypted = await addEncrypted(manifestArtifactId, Buffer.from(JSON.stringify(manifest)));
  return {remote, manifestEncrypted, storagePlaintext};
}

function makeObjectStore(remote, calls = []) {
  return {
    calls,
    async headEncryptedObject(key) {
      calls.push(`head:${key}`);
      return remote.get(key)?.head ?? null;
    },
    async getEncryptedObject(key) {
      calls.push(`get:${key}`);
      const value = remote.get(key);
      if (!value) throw new Error("not found");
      return Readable.from([value.bytes]);
    },
  };
}

function makeTargetStorage() {
  const buckets = new Map();
  const objects = new Map();
  const calls = [];
  return {
    projectRef: targetProjectRef,
    calls,
    async listBuckets() {
      calls.push("listBuckets");
      return [...buckets.values()];
    },
    async listObjects(bucket) {
      calls.push(`listObjects:${bucket}`);
      return [...objects.keys()].filter((key) => key.startsWith(`${bucket}/`))
        .map((key) => ({path: key.slice(bucket.length + 1)}));
    },
    async createBucket(bucket) {
      calls.push(`createBucket:${bucket.id}`);
      buckets.set(bucket.id, structuredClone(bucket));
    },
    async uploadObject({bucket, path, filePath, upsert}) {
      calls.push(`upload:${bucket}/${path}`);
      assert.equal(upsert, false);
      objects.set(`${bucket}/${path}`, await readFile(filePath));
    },
    async downloadObject({bucket, path}) {
      calls.push(`download:${bucket}/${path}`);
      return objects.get(`${bucket}/${path}`);
    },
  };
}

const runSummary = (manifestEncrypted) => ({
  runId,
  status: "succeeded",
  integrityVerified: true,
  manifestObjectKey: manifestEncrypted.objectKey,
});

const restoreArgs = ({backupRun, objectStore, targetStorage}) => ({
  backupRun,
  objectStore,
  encodedKey,
  sourceProjectRef,
  targetProjectRef,
  targetEnvironment: "isolated",
  targetStorage,
  maxStorageObjectBytes: 1024,
  maxTotalStorageBytes: 2048,
});

test("Storage restore stops before remote reads or target inspection when its global gate is closed", async (t) => {
  const fixture = await makeEncryptedRun(t);
  const calls = [];
  const objectStore = makeObjectStore(fixture.remote, calls);
  const target = makeTargetStorage();
  const args=restoreArgs({
    backupRun: runSummary(fixture.manifestEncrypted), objectStore, targetStorage: target,
  });
  delete args.maxStorageObjectBytes;
  delete args.maxTotalStorageBytes;
  delete process.env.MMWR_BACKUP_RESTORE_ENABLED;

  await assert.rejects(restoreStorageBackupRun(args), /Backup restore operations are disabled by configuration/);
  assert.deepEqual(calls, []);
  assert.deepEqual(target.calls, []);
});

test("encrypted backup Storage objects restore only after download, decrypt and target readback verification", async (t) => {
  const fixture = await makeEncryptedRun(t);
  const target = makeTargetStorage();
  const result = await restoreStorageBackupRun(restoreArgs({
    backupRun: runSummary(fixture.manifestEncrypted),
    objectStore: makeObjectStore(fixture.remote),
    targetStorage: target,
  }));

  assert.deepEqual(result, {restoredBuckets: 1, restoredObjects: 1, writesPerformed: true});
  assert.deepEqual(target.calls, [
    "listBuckets",
    "createBucket:evidence",
    "upload:evidence/submission/file.bin",
    "download:evidence/submission/file.bin",
  ]);
});

test("encrypted backup restore refuses invalid run state, wrong project binding, or non-isolated target before R2 reads", async (t) => {
  const fixture = await makeEncryptedRun(t);
  const calls = [];
  const objectStore = makeObjectStore(fixture.remote, calls);
  const target = makeTargetStorage();
  await assert.rejects(restoreStorageBackupRun(restoreArgs({
    backupRun: {...runSummary(fixture.manifestEncrypted), status: "failed"}, objectStore, targetStorage: target,
  })), /successful/);
  await assert.rejects(restoreStorageBackupRun(restoreArgs({
    backupRun: runSummary(fixture.manifestEncrypted), objectStore, targetStorage: {...target, projectRef: sourceProjectRef},
  })), /adapter project reference/);
  await assert.rejects(restoreStorageBackupRun({...restoreArgs({
    backupRun: runSummary(fixture.manifestEncrypted), objectStore, targetStorage: target,
  }), targetEnvironment: "production"}), /isolated/);
  assert.deepEqual(calls, []);
  assert.deepEqual(target.calls, []);
});

test("encrypted backup restore detects modified R2 bytes before any Storage write", async (t) => {
  const fixture = await makeEncryptedRun(t);
  const storageKey = `runs/${runId}/storage_restore.mmwrbk`;
  const remoteArtifact = fixture.remote.get(storageKey);
  remoteArtifact.bytes[remoteArtifact.bytes.length - 1] ^= 1;
  const target = makeTargetStorage();

  await assert.rejects(restoreStorageBackupRun(restoreArgs({
    backupRun: runSummary(fixture.manifestEncrypted),
    objectStore: makeObjectStore(fixture.remote),
    targetStorage: target,
  })), /digest/);
  assert.deepEqual(target.calls, []);
});

test("encrypted manifest authentication rejects changed ciphertext even when object metadata changes too", async (t) => {
  const fixture = await makeEncryptedRun(t);
  const remoteManifest = fixture.remote.get(fixture.manifestEncrypted.objectKey);
  remoteManifest.bytes[remoteManifest.bytes.length - 1] ^= 1;
  remoteManifest.head.encryptedSha256 = digest(remoteManifest.bytes);
  const target = makeTargetStorage();

  await assert.rejects(restoreStorageBackupRun(restoreArgs({
    backupRun: runSummary(fixture.manifestEncrypted),
    objectStore: makeObjectStore(fixture.remote),
    targetStorage: target,
  })), /authentication failed/);
  assert.deepEqual(target.calls, []);
});
