import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {Readable} from "node:stream";
import test from "node:test";
import {decryptBackupFile, encryptBackupFile, BackupValidationError} from "./crypto.mjs";
import {createBackupManifest, parseBackupManifest} from "./manifest.mjs";
import {planBackupRetention} from "./retention.mjs";
import {getMaxStorageObjectBytes, getMaxTotalStorageBytes} from "./limits.mjs";
import {createIsolatedRestorePlan} from "./restore-plan.mjs";
import {runFullBackup} from "./worker.mjs";

const key = randomBytes(32).toString("base64");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const databaseKinds = [
  "database_roles", "database_schema", "database_data", "database_auth_schema",
  "database_auth_data", "database_storage_schema", "database_storage_data", "migration_history",
  "database_platform_compatibility",
];

function makeManifest(runId = "fixture_run") {
  const artifacts = databaseKinds.map((kind, index) => {
    const artifactId = `artifact_${index}`;
    const bytes = Buffer.from(`synthetic ${kind}`);
    return {
      artifactId,
      kind,
      objectKey: `runs/${runId}/${artifactId}.mmwrbk`,
      plaintextBytes: bytes.length,
      plaintextSha256: digest(bytes),
      encryptedBytes: bytes.length + 36,
      encryptedSha256: digest(Buffer.concat([Buffer.from("encrypted:"), bytes])),
    };
  });
  artifacts.push({
    artifactId: "storage_0",
    kind: "storage_object",
    objectKey: `runs/${runId}/storage_0.mmwrbk`,
    plaintextBytes: 4,
    plaintextSha256: digest("file"),
    encryptedBytes: 40,
    encryptedSha256: digest("encrypted:file"),
    sourceBucket: "evidence",
    sourceObjectPath: "fixture/random/object.bin",
    sourceMimeType: "application/octet-stream",
  });
  artifacts.push({
    artifactId: "storage_thumbnail_0",
    kind: "storage_object",
    objectKey: `runs/${runId}/storage_thumbnail_0.mmwrbk`,
    plaintextBytes: 4,
    plaintextSha256: digest("webp"),
    encryptedBytes: 40,
    encryptedSha256: digest("encrypted:webp"),
    sourceBucket: "mmwr-public-thumbnail-derivatives",
    sourceObjectPath: "fixture/scan-job/lease.webp",
    sourceMimeType: "image/webp",
    sourceCacheControl: "0",
  });
  return createBackupManifest({
    runId,
    createdAt: new Date("2026-10-04T12:00:00.000Z"),
    databaseMajorVersion: 17,
    databaseExportStartedAt: "2026-10-04T11:59:00.000Z",
    databaseExportCompletedAt: "2026-10-04T12:00:00.000Z",
    storageInventoryVerified: true,
    storageBuckets: [
      {id: "evidence", name: "evidence", public: false, fileSizeLimit: null, allowedMimeTypes: null},
      {id: "mmwr-public-thumbnail-derivatives", name: "mmwr-public-thumbnail-derivatives", public: false, fileSizeLimit: 524288, allowedMimeTypes: ["image/webp"]},
    ],
    artifacts,
  });
}

async function temporaryDirectory(t, prefix = "mmwr-backup-test-") {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(() => rm(directory, {recursive: true, force: true}));
  return directory;
}

test("backup encryption round-trips empty and multi-chunk files", async (t) => {
  const directory = await temporaryDirectory(t);
  for (const [name, contents] of [["empty", Buffer.alloc(0)], ["large", randomBytes(384 * 1024)]]) {
    const inputPath = join(directory, `${name}.plain`);
    const encryptedPath = join(directory, `${name}.mmwrbk`);
    const outputPath = join(directory, `${name}.restored`);
    await writeFile(inputPath, contents);
    const metadata = await encryptBackupFile({inputPath, outputPath: encryptedPath, encodedKey: key, runId: "run_1", artifactId: `artifact_${name}`});
    const decrypted = await decryptBackupFile({
      inputPath: encryptedPath,
      outputPath,
      encodedKey: key,
      runId: "run_1",
      artifactId: `artifact_${name}`,
      expectedPlaintextSha256: metadata.plaintext.sha256,
      expectedPlaintextBytes: metadata.plaintext.bytes,
      expectedEncryptedSha256: metadata.encrypted.sha256,
      expectedEncryptedBytes: metadata.encrypted.bytes,
    });
    assert.deepEqual(await readFile(outputPath), contents);
    assert.equal(decrypted.plaintext.sha256, digest(contents));
    assert.equal(metadata.format, "MMWRBK01");
  }
});

test("backup decryption rejects tampering and removes the partial plaintext", async (t) => {
  const directory = await temporaryDirectory(t);
  const inputPath = join(directory, "source");
  const encryptedPath = join(directory, "encrypted");
  const outputPath = join(directory, "restored");
  await writeFile(inputPath, "synthetic protected bytes");
  const metadata = await encryptBackupFile({inputPath, outputPath: encryptedPath, encodedKey: key, runId: "run_2", artifactId: "artifact_2"});
  const bytes = await readFile(encryptedPath);
  bytes[bytes.length - 1] ^= 1;
  await writeFile(encryptedPath, bytes);
  await assert.rejects(decryptBackupFile({
    inputPath: encryptedPath,
    outputPath,
    encodedKey: key,
    runId: "run_2",
    artifactId: "artifact_2",
    expectedPlaintextSha256: metadata.plaintext.sha256,
    expectedPlaintextBytes: metadata.plaintext.bytes,
    expectedEncryptedSha256: metadata.encrypted.sha256,
    expectedEncryptedBytes: metadata.encrypted.bytes,
  }), BackupValidationError);
  await assert.rejects(readFile(outputPath), {code: "ENOENT"});
});

test("backup decryption can verify an authenticated manifest without an external plaintext digest", async (t) => {
  const directory = await temporaryDirectory(t);
  const inputPath = join(directory, "manifest.mmwrbk");
  const outputPath = join(directory, "manifest.json");
  await writeFile(inputPath, JSON.stringify({runId: "run_manifest"}));
  const metadata = await encryptBackupFile({inputPath, outputPath: join(directory, "encrypted"), encodedKey: key, runId: "run_manifest", artifactId: "manifest_1"});
  const encryptedPath = join(directory, "encrypted");
  await decryptBackupFile({
    inputPath: encryptedPath,
    outputPath,
    encodedKey: key,
    runId: "run_manifest",
    artifactId: "manifest_1",
    expectedEncryptedSha256: metadata.encrypted.sha256,
    expectedEncryptedBytes: metadata.encrypted.bytes,
  });
  assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), {runId: "run_manifest"});
  await assert.rejects(decryptBackupFile({
    inputPath: encryptedPath,
    outputPath: join(directory, "invalid.json"),
    encodedKey: key,
    runId: "run_manifest",
    artifactId: "manifest_1",
    expectedPlaintextSha256: metadata.plaintext.sha256,
    expectedEncryptedSha256: metadata.encrypted.sha256,
    expectedEncryptedBytes: metadata.encrypted.bytes,
  }), /plaintext expectations/);
});

test("backup encryption rejects unsafe key, context, and same-file paths", async (t) => {
  const directory = await temporaryDirectory(t);
  const inputPath = join(directory, "source");
  await writeFile(inputPath, "fixture");
  await assert.rejects(encryptBackupFile({inputPath, outputPath: inputPath, encodedKey: key, runId: "run", artifactId: "object"}), /different files/);
  await assert.rejects(encryptBackupFile({inputPath, outputPath: join(directory, "out"), encodedKey: "invalid", runId: "run", artifactId: "object"}), /canonical base64/);
  await assert.rejects(encryptBackupFile({inputPath, outputPath: join(directory, "out"), encodedKey: key, runId: "../run", artifactId: "object"}), /IDs must use/);
});

test("backup manifests round-trip and reject traversal, duplicate mappings, and missing components", () => {
  const manifest = makeManifest();
  const restoredManifest = parseBackupManifest(JSON.stringify(manifest), manifest.runId);
  assert.equal(restoredManifest.artifactCount, 11);
  assert.deepEqual(restoredManifest.storageBuckets.find((bucket) => bucket.name === "mmwr-public-thumbnail-derivatives"), {
    id: "mmwr-public-thumbnail-derivatives",
    name: "mmwr-public-thumbnail-derivatives",
    public: false,
    fileSizeLimit: 524288,
    allowedMimeTypes: ["image/webp"],
  });
  assert.equal(restoredManifest.artifacts.find((artifact) => artifact.sourceBucket === "mmwr-public-thumbnail-derivatives")?.sourceObjectPath, "fixture/scan-job/lease.webp");
  assert.throws(() => createBackupManifest({...manifest, runId: "different"}), /artifact key/);
  const unsafePath = structuredClone(manifest);
  unsafePath.artifacts.at(-1).sourceObjectPath = "evidence/../secret";
  assert.throws(() => createBackupManifest(unsafePath), /invalid Storage object path/);
  const duplicate = structuredClone(manifest);
  duplicate.artifacts[1].artifactId = duplicate.artifacts[0].artifactId;
  duplicate.artifacts[1].objectKey = duplicate.artifacts[0].objectKey;
  assert.throws(() => createBackupManifest(duplicate), /duplicate artifact/);
  for (const kind of [
    "database_auth_schema",
    "database_auth_data",
    "database_storage_schema",
    "database_storage_data",
  ]) {
    const missing = structuredClone(manifest);
    missing.artifacts = missing.artifacts.filter((artifact) => artifact.kind !== kind);
    assert.throws(() => createBackupManifest(missing), /missing a required database dump component/);
  }
  const missingCompatibility = structuredClone(manifest);
  missingCompatibility.artifacts = missingCompatibility.artifacts.filter((artifact) => artifact.kind !== "database_platform_compatibility");
  assert.throws(() => createBackupManifest(missingCompatibility), /missing a required database dump component/);
  assert.throws(() => parseBackupManifest(manifest, "another_run"), BackupValidationError);
});

test("retention keeps daily, weekly, and monthly representatives without selecting unsafe runs", () => {
  const now = new Date("2026-10-04T12:00:00.000Z");
  const successful = Array.from({length: 250}, (_, index) => {
    const completedAt = new Date(now.getTime() - index * 24 * 60 * 60 * 1000);
    return {id: `backup_${index}`, kind: "full_backup", status: "succeeded", integrityVerified: true, completedAt};
  });
  const runs = [
    ...successful,
    {id: "partial", kind: "full_backup", status: "running", integrityVerified: false, completedAt: now},
    {id: "unverified", kind: "full_backup", status: "succeeded", integrityVerified: false, completedAt: now},
    {id: "other-kind", kind: "database_only", status: "succeeded", integrityVerified: true, completedAt: now},
  ];
  const plan = planBackupRetention(runs, {timeZone: "Asia/Kuala_Lumpur", now});
  const reasons = plan.keep.flatMap((item) => item.reasons);
  assert.equal(reasons.filter((item) => item.period === "daily").length, 7);
  assert.equal(reasons.filter((item) => item.period === "weekly").length, 4);
  assert.equal(reasons.filter((item) => item.period === "monthly").length, 6);
  assert.equal(plan.untouched, 3);
  assert.equal(plan.deleteCandidates.some((item) => ["partial", "unverified", "other-kind"].includes(item.id)), false);
  assert.ok(plan.deleteCandidates.length > 0);
});

test("retention requires an explicit timezone, bounded counts, and no future completed runs", () => {
  assert.throws(() => planBackupRetention([], {}), /explicit IANA time zone/);
  assert.throws(() => planBackupRetention([], {timeZone: "Not/AZone"}), /valid IANA time zone/);
  assert.throws(() => planBackupRetention([], {timeZone: "UTC", retention: {daily: 0}}), /integer from 1 to 366/);
  assert.throws(() => planBackupRetention([{id: "future", kind: "full_backup", status: "succeeded", integrityVerified: true, completedAt: "2026-10-05T00:00:00Z"}], {timeZone: "UTC", now: new Date("2026-10-04T00:00:00Z")}), /invalid identity or completion time/);
});

test("restore plans validate manifest identity and require a different isolated target", () => {
  const manifest = makeManifest("restore_fixture");
  const plan = createIsolatedRestorePlan({
    manifest,
    expectedRunId: "restore_fixture",
    sourceProjectRef: "abcdefghijklmnopqrst",
    targetProjectRef: "bcdefghijklmnopqrstu",
    targetEnvironment: "isolated",
  });
  assert.equal(plan.mode, "offline_plan_only");
  assert.equal(plan.writesPerformed, false);
  assert.deepEqual(plan.databaseArtifacts.map((item) => item.kind), [
    "database_roles", "database_schema", "database_auth_schema", "database_storage_schema",
    "database_data", "database_auth_data", "database_storage_data", "migration_history",
    "database_platform_compatibility",
  ]);
  assert.deepEqual(plan.storageObjects.map((item) => [item.bucket, item.path]), [
    ["evidence", "fixture/random/object.bin"],
    ["mmwr-public-thumbnail-derivatives", "fixture/scan-job/lease.webp"],
  ]);
  assert.throws(() => createIsolatedRestorePlan({
    manifest, expectedRunId: "restore_fixture", sourceProjectRef: "abcdefghijklmnopqrst",
    targetProjectRef: "abcdefghijklmnopqrst", targetEnvironment: "isolated",
  }), /differ from its source/);
  assert.throws(() => createIsolatedRestorePlan({
    manifest, expectedRunId: "restore_fixture", sourceProjectRef: "abcdefghijklmnopqrst",
    targetProjectRef: "bcdefghijklmnopqrstu", targetEnvironment: "production",
  }), /explicitly isolated/);
});

test("backup storage size limits fail closed on missing, malformed, and oversized values", () => {
  assert.equal(getMaxStorageObjectBytes(""), 10 * 1024 * 1024);
  assert.equal(getMaxStorageObjectBytes("1048576"), 1048576);
  assert.throws(() => getMaxStorageObjectBytes("0"), /invalid/);
  assert.throws(() => getMaxStorageObjectBytes("1073741825"), /supported range/);
  assert.throws(() => getMaxTotalStorageBytes(undefined), /must be configured/);
  assert.equal(getMaxTotalStorageBytes("5242880"), 5242880);
});

async function makeBackupAdapters({tamperOnDownload = false} = {}) {
  const remoteObjects = new Map();
  const status = [];
  const storedBytes = Buffer.from("synthetic private evidence bytes");
  const object = {
    bucket: "evidence",
    path: "fixture/random/object.bin",
    size: storedBytes.length,
    updatedAt: "2026-10-04T11:58:00.000Z",
    mimeType: "application/octet-stream",
    cacheControl: "private, no-store",
  };
  const thumbnailObject = {
    bucket: "mmwr-public-thumbnail-derivatives",
    path: "fixture/scan-job/lease.webp",
    size: 4,
    updatedAt: "2026-10-04T11:58:30.000Z",
    mimeType: "image/webp",
    cacheControl: "0",
  };
  const storageObjects = new Map([
    [`${object.bucket}/${object.path}`, storedBytes],
    [`${thumbnailObject.bucket}/${thumbnailObject.path}`, Buffer.from("webp")],
  ]);
  let sourceClosed = false;
  let objectStoreClosed = false;
  let putCount = 0;
  const calls = {exportDatabase: 0, downloadedStorageObjects: []};

  const source = {
    async exportDatabase({workspace: exportDirectory}) {
      calls.exportDatabase += 1;
      return Promise.all(databaseKinds.map(async (kind) => {
        const path = resolve(exportDirectory, `${kind}.dump`);
        await writeFile(path, `synthetic backup component ${kind}`);
        return {kind, path};
      }));
    },
    async listStorageBuckets() {
      return [
        {id: "evidence", name: "evidence", public: false, fileSizeLimit: null, allowedMimeTypes: null},
        {id: "mmwr-public-thumbnail-derivatives", name: "mmwr-public-thumbnail-derivatives", public: false, fileSizeLimit: 524288, allowedMimeTypes: ["image/webp"]},
      ];
    },
    async listStorageObjects() {
      return {objects: [object, thumbnailObject], nextCursor: null};
    },
    async downloadStorageObject(storageObject) {
      calls.downloadedStorageObjects.push(`${storageObject.bucket}/${storageObject.path}`);
      return Readable.from([storageObjects.get(`${storageObject.bucket}/${storageObject.path}`)]);
    },
    async isStorageObjectUnchanged() {
      return true;
    },
    async close() {
      sourceClosed = true;
    },
  };
  const objectStore = {
    async putEncryptedFile({runId, artifactId, filePath}) {
      const keyName = `runs/${runId}/${artifactId}.mmwrbk`;
      remoteObjects.set(keyName, await readFile(filePath));
      putCount += 1;
    },
    async getEncryptedObject(keyName) {
      const bytes = Buffer.from(remoteObjects.get(keyName));
      if (tamperOnDownload && putCount > 0) bytes[bytes.length - 1] ^= 1;
      return Readable.from([bytes]);
    },
    async close() {
      objectStoreClosed = true;
    },
  };
  return {
    source,
    objectStore,
    remoteObjects,
    status,
    storedBytes,
    calls,
    wasClosed: () => sourceClosed && objectStoreClosed,
    onStatus: async (event) => status.push(event),
  };
}

async function withBackupEnvironment(callback) {
  const previous = {
    enabled: process.env.MMWR_BACKUP_ENABLED,
    total: process.env.MMWR_BACKUP_MAX_TOTAL_STORAGE_BYTES,
  };
  process.env.MMWR_BACKUP_ENABLED = "true";
  process.env.MMWR_BACKUP_MAX_TOTAL_STORAGE_BYTES = "1048576";
  try {
    await callback();
  } finally {
    if (previous.enabled === undefined) delete process.env.MMWR_BACKUP_ENABLED;
    else process.env.MMWR_BACKUP_ENABLED = previous.enabled;
    if (previous.total === undefined) delete process.env.MMWR_BACKUP_MAX_TOTAL_STORAGE_BYTES;
    else process.env.MMWR_BACKUP_MAX_TOTAL_STORAGE_BYTES = previous.total;
  }
}

test("full backup verifies synthetic database and Storage artifacts before success", async (t) => {
  await withBackupEnvironment(async () => {
    const root = await temporaryDirectory(t, "mmwr-backup-workspace-");
    const adapters = await makeBackupAdapters();
    let result;
    try {
      result = await runFullBackup({
        source: adapters.source,
        objectStore: adapters.objectStore,
        encodedKey: key,
        databaseMajorVersion: 17,
        now: new Date("2026-10-04T12:00:00.000Z"),
        workspaceRoot: root,
        onStatus: adapters.onStatus,
      });
    } catch (error) {
      assert.fail(`${error.message}; status=${JSON.stringify(adapters.status)}`);
    }
    assert.equal(result.status, "succeeded");
    assert.equal(result.integrityVerified, true);
    assert.equal(result.artifactCount, 12);
    assert.equal(adapters.remoteObjects.size, 12);
    assert.ok(adapters.calls.downloadedStorageObjects.includes("mmwr-public-thumbnail-derivatives/fixture/scan-job/lease.webp"));
    assert.equal(adapters.status.at(-1).phase, "complete");
    assert.equal(adapters.status.at(-1).integrityVerified, true);
    assert.ok([...adapters.remoteObjects.values()].every((bytes) => bytes.subarray(0, 8).toString("ascii") === "MMWRBK01"));
    assert.ok([...adapters.remoteObjects.values()].every((bytes) => !bytes.includes(adapters.storedBytes)));
    assert.deepEqual(await readdir(root), [], "temporary plaintext/encrypted workspace is removed after success");
    assert.equal(adapters.wasClosed(), true);
  });
});

test("missing total Storage budget fails before database export or remote uploads", async (t) => {
  await withBackupEnvironment(async () => {
    const root = await temporaryDirectory(t, "mmwr-backup-workspace-");
    const adapters = await makeBackupAdapters();
    const previous = process.env.MMWR_BACKUP_MAX_TOTAL_STORAGE_BYTES;
    delete process.env.MMWR_BACKUP_MAX_TOTAL_STORAGE_BYTES;
    try {
      await assert.rejects(runFullBackup({
        source: adapters.source,
        objectStore: adapters.objectStore,
        encodedKey: key,
        databaseMajorVersion: 17,
        now: new Date("2026-10-04T12:00:00.000Z"),
        workspaceRoot: root,
        onStatus: adapters.onStatus,
      }), /Backup run failed \(backup_failed\)/);
      assert.equal(adapters.calls.exportDatabase, 0);
      assert.equal(adapters.remoteObjects.size, 0);
      assert.equal(adapters.status[0].status, "running");
      assert.equal(adapters.status.at(-1).failureCode, "backup_failed");
      assert.deepEqual(await readdir(root), []);
    } finally {
      if (previous !== undefined) process.env.MMWR_BACKUP_MAX_TOTAL_STORAGE_BYTES = previous;
    }
  });
});

test("full backup records an integrity failure without exposing provider error text", async (t) => {
  await withBackupEnvironment(async () => {
    const root = await temporaryDirectory(t, "mmwr-backup-workspace-");
    const adapters = await makeBackupAdapters({tamperOnDownload: true});
    await assert.rejects(runFullBackup({
      source: adapters.source,
      objectStore: adapters.objectStore,
      encodedKey: key,
      databaseMajorVersion: 17,
      now: new Date("2026-10-04T12:00:00.000Z"),
      workspaceRoot: root,
      onStatus: adapters.onStatus,
    }), /Backup run failed \(backup_validation_failed\)/);
    assert.equal(adapters.status.at(-1).status, "failed");
    assert.equal(adapters.status.at(-1).failureCode, "backup_validation_failed");
    assert.deepEqual(await readdir(root), [], "temporary plaintext/encrypted workspace is removed after failure");
    assert.equal(adapters.wasClosed(), true);
  });
});

test("full backup stays closed when its explicit enable flag is absent", async () => {
  const previous = process.env.MMWR_BACKUP_ENABLED;
  delete process.env.MMWR_BACKUP_ENABLED;
  try {
    await assert.rejects(runFullBackup({}), /disabled by configuration/);
  } finally {
    if (previous !== undefined) process.env.MMWR_BACKUP_ENABLED = previous;
  }
});
