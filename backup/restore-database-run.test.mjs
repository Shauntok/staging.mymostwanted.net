import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Readable} from "node:stream";
import test from "node:test";
import {encryptBackupFile} from "./crypto.mjs";
import {createBackupManifest} from "./manifest.mjs";
import {restoreDatabaseBackupRun} from "./restore-database-run.mjs";

const runId = "restore_database_run";
const sourceProjectRef = "abcdefghijklmnopqrst";
const targetProjectRef = "bcdefghijklmnopqrstu";
const encodedKey = randomBytes(32).toString("base64");
const databaseKinds = [
  "database_roles", "database_schema", "database_auth_schema", "database_storage_schema",
  "database_data", "database_auth_data", "database_storage_data", "migration_history",
  "database_platform_compatibility",
];
const appliedDatabaseKinds = databaseKinds.filter((kind) => kind !== "database_platform_compatibility");
const digest = (value) => createHash("sha256").update(value).digest("hex");

async function fixture(t) {
  const workspace = await mkdtemp(join(tmpdir(), "mmwr-db-restore-test-"));
  t.after(() => rm(workspace, {recursive: true, force: true}));
  const remote = new Map();
  const artifacts = [];
  for (const [index, kind] of databaseKinds.entries()) {
    const artifactId = `db_${index}`;
    const plaintext = Buffer.from(kind === "database_platform_compatibility"
      ? JSON.stringify({databaseMajorVersion: 17, authMigrations: ["20260101000000"], storageMigrations: [{id: 1, hash: "a".repeat(40), name: "initial"}]})
      : `verified ${kind}`);
    const inputPath = join(workspace, `${artifactId}.plain`);
    const outputPath = join(workspace, `${artifactId}.mmwrbk`);
    await writeFile(inputPath, plaintext);
    const metadata = await encryptBackupFile({inputPath, outputPath, encodedKey, runId, artifactId});
    const bytes = await readFile(outputPath);
    const objectKey = `runs/${runId}/${artifactId}.mmwrbk`;
    remote.set(objectKey, {bytes, head: {formatVersion: "1", contentLength: bytes.length, encryptedSha256: digest(bytes)}});
    artifacts.push({artifactId, kind, objectKey, plaintextBytes: plaintext.length, plaintextSha256: digest(plaintext), encryptedBytes: metadata.encrypted.bytes, encryptedSha256: metadata.encrypted.sha256});
  }
  const manifest = createBackupManifest({
    runId,
    createdAt: "2026-10-05T00:00:00Z",
    databaseMajorVersion: 17,
    databaseExportStartedAt: "2026-10-04T23:59:00Z",
    databaseExportCompletedAt: "2026-10-05T00:00:00Z",
    storageInventoryVerified: true,
    storageBuckets: [],
    artifacts,
  });
  const artifactId = "manifest_db";
  const inputPath = join(workspace, `${artifactId}.plain`);
  const outputPath = join(workspace, `${artifactId}.mmwrbk`);
  await writeFile(inputPath, JSON.stringify(manifest));
  const metadata = await encryptBackupFile({inputPath, outputPath, encodedKey, runId, artifactId});
  const bytes = await readFile(outputPath);
  const objectKey = `runs/${runId}/${artifactId}.mmwrbk`;
  remote.set(objectKey, {bytes, head: {formatVersion: "1", contentLength: bytes.length, encryptedSha256: digest(bytes)}});
  return {remote, backupRun: {runId, status: "succeeded", integrityVerified: true, manifestObjectKey: objectKey}, manifestBytes: metadata.encrypted.bytes};
}

function objectStore(remote, calls) {
  return {
    async headEncryptedObject(key) { calls.push(`head:${key}`); return remote.get(key)?.head ?? null; },
    async getEncryptedObject(key) {
      calls.push(`get:${key}`);
      const item = remote.get(key);
      if (!item) throw new Error("missing object");
      return Readable.from([item.bytes]);
    },
  };
}

function targetDatabase(calls, overrides = {}) {
  return {
    projectRef: targetProjectRef,
    async preflight() { calls.push("preflight"); return {projectRef: targetProjectRef, environment: "isolated", pristine: true}; },
    async verifyPlatformCompatibility(source) {
      calls.push("verify-platform");
      assert.equal(source.databaseMajorVersion, 17);
      assert.deepEqual(source.authMigrations, ["20260101000000"]);
      assert.deepEqual(source.storageMigrations, [{id: 1, hash: "a".repeat(40), name: "initial"}]);
    },
    async applyArtifact({kind, filePath}) { calls.push(`apply:${kind}:${await readFile(filePath, "utf8")}`); },
    ...overrides,
  };
}

test("restores only after all encrypted database artifacts have been downloaded and authenticated, in dependency order", async (t) => {
  const priorGate = process.env.MMWR_BACKUP_RESTORE_ENABLED;
  process.env.MMWR_BACKUP_RESTORE_ENABLED = "true";
  t.after(() => priorGate === undefined ? delete process.env.MMWR_BACKUP_RESTORE_ENABLED : process.env.MMWR_BACKUP_RESTORE_ENABLED = priorGate);
  const {remote, backupRun} = await fixture(t);
  const calls = [];
  const result = await restoreDatabaseBackupRun({backupRun, objectStore: objectStore(remote, calls), encodedKey, sourceProjectRef, targetProjectRef, targetEnvironment: "isolated", targetDatabase: targetDatabase(calls)});
  assert.deepEqual(result.appliedKinds, appliedDatabaseKinds);
  const firstApply = calls.findIndex((call) => call.startsWith("apply:"));
  assert.ok(firstApply > calls.findLastIndex((call) => call.startsWith("get:")));
  assert.ok(calls.indexOf("verify-platform") < firstApply);
  assert.deepEqual(calls.filter((call) => call.startsWith("apply:")).map((call) => call.split(":")[1]), appliedDatabaseKinds);
});

test("rejects a non-pristine target before downloading or applying data", async (t) => {
  const priorGate = process.env.MMWR_BACKUP_RESTORE_ENABLED;
  process.env.MMWR_BACKUP_RESTORE_ENABLED = "true";
  t.after(() => priorGate === undefined ? delete process.env.MMWR_BACKUP_RESTORE_ENABLED : process.env.MMWR_BACKUP_RESTORE_ENABLED = priorGate);
  const {remote, backupRun} = await fixture(t);
  const calls = [];
  const target = targetDatabase(calls, {async preflight() { calls.push("preflight"); return {projectRef: targetProjectRef, environment: "isolated", pristine: false}; }});
  await assert.rejects(restoreDatabaseBackupRun({backupRun, objectStore: objectStore(remote, calls), encodedKey, sourceProjectRef, targetProjectRef, targetEnvironment: "isolated", targetDatabase: target}), /pristine isolated target/);
  assert.deepEqual(calls, ["preflight"]);
});

test("does not apply any database artifact when one encrypted component fails authentication", async (t) => {
  const priorGate = process.env.MMWR_BACKUP_RESTORE_ENABLED;
  process.env.MMWR_BACKUP_RESTORE_ENABLED = "true";
  t.after(() => priorGate === undefined ? delete process.env.MMWR_BACKUP_RESTORE_ENABLED : process.env.MMWR_BACKUP_RESTORE_ENABLED = priorGate);
  const {remote, backupRun} = await fixture(t);
  const damaged = remote.get(`runs/${runId}/db_6.mmwrbk`);
  damaged.bytes[damaged.bytes.length - 1] ^= 0xff;
  damaged.head.encryptedSha256 = digest(damaged.bytes);
  const calls = [];
  await assert.rejects(restoreDatabaseBackupRun({backupRun, objectStore: objectStore(remote, calls), encodedKey, sourceProjectRef, targetProjectRef, targetEnvironment: "isolated", targetDatabase: targetDatabase(calls)}));
  assert.equal(calls.some((call) => call.startsWith("apply:")), false);
});

test("rejects a target with different managed Supabase migration ledgers before any restore write", async (t) => {
  const priorGate = process.env.MMWR_BACKUP_RESTORE_ENABLED;
  process.env.MMWR_BACKUP_RESTORE_ENABLED = "true";
  t.after(() => priorGate === undefined ? delete process.env.MMWR_BACKUP_RESTORE_ENABLED : process.env.MMWR_BACKUP_RESTORE_ENABLED = priorGate);
  const {remote, backupRun} = await fixture(t);
  const calls = [];
  const target = targetDatabase(calls, {async verifyPlatformCompatibility() {
    calls.push("verify-platform");
    throw new Error("Managed Supabase migration state differs from the backup.");
  }});
  await assert.rejects(restoreDatabaseBackupRun({backupRun, objectStore: objectStore(remote, calls), encodedKey, sourceProjectRef, targetProjectRef, targetEnvironment: "isolated", targetDatabase: target}), /platform migration state is incompatible/);
  assert.equal(calls.some((call) => call.startsWith("apply:")), false);
});

test("stops after a component write fails without retrying or applying later components", async (t) => {
  const priorGate = process.env.MMWR_BACKUP_RESTORE_ENABLED;
  process.env.MMWR_BACKUP_RESTORE_ENABLED = "true";
  t.after(() => priorGate === undefined ? delete process.env.MMWR_BACKUP_RESTORE_ENABLED : process.env.MMWR_BACKUP_RESTORE_ENABLED = priorGate);
  const {remote, backupRun} = await fixture(t);
  const calls = [];
  const target = targetDatabase(calls, {async applyArtifact({kind}) {
    calls.push(`apply:${kind}`);
    if (kind === "database_auth_schema") throw new Error("Local database restore psql command failed (object_already_exists).");
  }});
  await assert.rejects(restoreDatabaseBackupRun({backupRun, objectStore: objectStore(remote, calls), encodedKey, sourceProjectRef, targetProjectRef, targetEnvironment: "isolated", targetDatabase: target}), (error) => {
    assert.match(error.message, /stopped at database_auth_schema \(object_already_exists\)/);
    assert.match(error.message, /may be partially restored and must be discarded/);
    assert.doesNotMatch(error.message, /psql command failed/);
    return true;
  });
  assert.equal(calls.filter((call) => call === "apply:database_roles").length, 1);
  assert.equal(calls.filter((call) => call === "apply:database_auth_schema").length, 1);
  assert.equal(calls.some((call) => call.includes("database_storage_schema")), false);
  assert.equal(calls.some((call) => call.includes("object_already_exists")), false);
});

test("keeps the restore path closed unless its dedicated gate is explicitly enabled", async (t) => {
  const priorGate = process.env.MMWR_BACKUP_RESTORE_ENABLED;
  delete process.env.MMWR_BACKUP_RESTORE_ENABLED;
  t.after(() => priorGate === undefined ? delete process.env.MMWR_BACKUP_RESTORE_ENABLED : process.env.MMWR_BACKUP_RESTORE_ENABLED = priorGate);
  const {remote, backupRun} = await fixture(t);
  const calls = [];
  await assert.rejects(restoreDatabaseBackupRun({backupRun, objectStore: objectStore(remote, calls), encodedKey, sourceProjectRef, targetProjectRef, targetEnvironment: "isolated", targetDatabase: targetDatabase(calls)}), /disabled by configuration/);
  assert.deepEqual(calls, []);
});
