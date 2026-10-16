import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {spawn} from "node:child_process";
import {createHash, randomBytes, randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {Readable} from "node:stream";
import test from "node:test";
import {runFullBackup} from "./worker.mjs";
import {exportSupabaseDatabase} from "./supabase-cli-export.mjs";
import {createSupabaseStorageSource} from "./supabase-storage-source.mjs";
import {createDockerPsqlRestoreTarget} from "./supabase-psql-target.mjs";
import {createSupabaseStorageTarget} from "./supabase-storage-target.mjs";
import {restoreDatabaseBackupRun} from "./restore-database-run.mjs";
import {restoreStorageBackupRun} from "./restore-storage-run.mjs";

const enabled = process.env.MMWR_TEST_LOCAL_FULL_RESTORE === "true";
const targetProjectRef = process.env.MMWR_TEST_LOCAL_FULL_RESTORE_PROJECT_REF ?? "";
const sourceProjectRef = "abcdefghijklmnopqrst";
const targetUrl = process.env.MMWR_TEST_LOCAL_FULL_RESTORE_TARGET_URL ?? "";
const targetSecretKey = process.env.MMWR_TEST_LOCAL_FULL_RESTORE_TARGET_SECRET_KEY ?? "";
const sourceUrl = process.env.MMWR_TEST_LOCAL_FULL_RESTORE_SOURCE_URL ?? "";
const sourceSecretKey = process.env.MMWR_TEST_LOCAL_FULL_RESTORE_SOURCE_SECRET_KEY ?? "";
const sourceDatabaseUrl = process.env.MMWR_TEST_LOCAL_FULL_RESTORE_SOURCE_DATABASE_URL ?? "";
const sourceDatabasePassword = process.env.MMWR_TEST_LOCAL_FULL_RESTORE_SOURCE_DATABASE_PASSWORD ?? "";
const sourceContainer = process.env.MMWR_TEST_LOCAL_FULL_RESTORE_SOURCE_CONTAINER ?? "supabase_db_mmwr";

function assertLoopbackUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    assert.fail(`${name} must be a local Supabase URL.`);
  }
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), `${name} must use loopback.`);
  return url;
}

function assertPasswordlessDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    assert.fail("Source database URL must be valid.");
  }
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Source database must use loopback.");
  assert.equal(url.password, "", "Source database password must be supplied separately.");
  return url;
}

function createMemoryObjectStore() {
  const objects = new Map();
  return {
    async putEncryptedFile({runId, artifactId, filePath, encryptedSha256, encryptedBytes}) {
      const bytes = await readFile(filePath);
      assert.equal(bytes.length, encryptedBytes);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), encryptedSha256);
      objects.set(`runs/${runId}/${artifactId}.mmwrbk`, {
        bytes,
        head: {formatVersion: "1", contentLength: bytes.length, encryptedSha256},
      });
    },
    async headEncryptedObject(key) {
      return objects.get(key)?.head ?? null;
    },
    async getEncryptedObject(key) {
      const object = objects.get(key);
      if (!object) throw new Error("Encrypted local test artifact is missing.");
      return Readable.from([object.bytes]);
    },
  };
}

function readTargetRowCount(containerName, relation) {
  assert.match(relation, /^(public|private|auth|storage|supabase_migrations)\.[a-z_]+$/);
  const sql = `SELECT count(*) FROM ${relation};`;
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("docker", [
      "exec", "--user", "postgres", containerName, "psql", "--no-psqlrc", "--no-align", "--tuples-only",
      "--set", "ON_ERROR_STOP=1", "--username", "supabase_admin", "--dbname", "postgres", "--command", sql,
    ], {shell: false, windowsHide: true, stdio: ["ignore", "pipe", "ignore"]});
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
    child.once("error", () => rejectPromise(new Error("Local restore readback could not start.")));
    child.once("close", (code) => {
      if (code !== 0 || !/^\d+\s*$/.test(output)) rejectPromise(new Error("Local restore readback failed."));
      else resolvePromise(Number(output.trim()));
    });
  });
}

function runLocalDatabaseCommand(containerName, sql) {
  assert.match(containerName, /^supabase_db_[a-z0-9]{1,64}$/);
  assert.equal(typeof sql, "string");
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("docker", [
      "exec", "--user", "postgres", containerName, "psql", "--no-psqlrc",
      "--set", "ON_ERROR_STOP=1", "--username", "supabase_admin", "--dbname", "postgres", "--command", sql,
    ], {shell: false, windowsHide: true, stdio: ["ignore", "ignore", "ignore"]});
    child.once("error", () => rejectPromise(new Error("Local database fixture command could not start.")));
    child.once("close", (code, signal) => {
      if (code === 0 && !signal) resolvePromise();
      else rejectPromise(new Error("Local database fixture command failed."));
    });
  });
}

async function readStreamBytes(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

test("actual local Supabase backup encrypts and restores database plus Storage into a fresh isolated stack", {skip: !enabled}, async (t) => {
  assert.match(targetProjectRef, /^mmwrrestoretarget[a-z0-9]{3}$/);
  assert.notEqual(targetProjectRef, "abcdefghijklmnopqrst");
  assert.match(sourceContainer, /^supabase_db_[a-z0-9]{1,64}$/);
  assertLoopbackUrl(sourceUrl, "Source API URL");
  assertLoopbackUrl(targetUrl, "Target API URL");
  const safeDatabaseUrl = assertPasswordlessDatabaseUrl(sourceDatabaseUrl);
  assert.ok(sourceSecretKey.length >= 32, "Source local Secret Key is required.");
  assert.ok(targetSecretKey.length >= 32, "Target local Secret Key is required.");
  assert.ok(sourceDatabasePassword.length > 0, "Source local database password is required.");

  const sourceClient = createClient(sourceUrl, sourceSecretKey, {
    auth: {autoRefreshToken: false, persistSession: false, detectSessionInUrl: false},
  });
  const sourceBucket = `mmwr-restore-${randomBytes(8).toString("hex")}`;
  const sourceObjectPath = "fixture/nested/restore-check.bin";
  const sourceObjectBytes = Buffer.from("synthetic DB and Storage restore fixture\u0000bytes");
  const fixtureOwnerId = randomUUID();
  const fixtureSubmissionId = randomUUID();
  const fixtureEvidenceId = randomUUID();
  const evidenceObjectPath = `${fixtureOwnerId}/${fixtureSubmissionId}/restore-reference-fixture.pdf`;
  const thumbnailObjectPath = `${fixtureOwnerId}/${fixtureSubmissionId}/${fixtureEvidenceId}.webp`;
  const evidenceObjectBytes = Buffer.from("%PDF-1.4\nSynthetic isolated restore reference fixture\n%%EOF\n");
  const thumbnailObjectBytes = Buffer.from("synthetic isolated WebP restore reference fixture");
  let evidenceObjectUploaded = false;
  let thumbnailObjectUploaded = false;
  let databaseFixtureSeeded = false;
  t.after(async () => {
    if (databaseFixtureSeeded) {
      await runLocalDatabaseCommand(sourceContainer, `DELETE FROM private.submissions WHERE id = '${fixtureSubmissionId}';`);
    }
    for (const [bucket, path] of [
      ["mmwr-evidence-quarantine", evidenceObjectPath],
      ["mmwr-public-thumbnail-derivatives", thumbnailObjectPath],
    ]) {
      if ((bucket === "mmwr-evidence-quarantine" && !evidenceObjectUploaded)
        || (bucket === "mmwr-public-thumbnail-derivatives" && !thumbnailObjectUploaded)) continue;
      const {data: buckets, error: listError} = await sourceClient.storage.listBuckets();
      if (listError) throw new Error("Synthetic source Storage cleanup could not inspect buckets.");
      if (buckets?.some((entry) => entry.id === bucket)) {
        const {error: removeError} = await sourceClient.storage.from(bucket).remove([path]);
        if (removeError) throw new Error("Synthetic source evidence fixture cleanup failed.");
      }
    }
    const {data: buckets, error: listError} = await sourceClient.storage.listBuckets();
    if (listError) throw new Error("Synthetic source Storage cleanup could not inspect buckets.");
    if (buckets?.some((bucket) => bucket.id === sourceBucket)) {
      const {error: removeError} = await sourceClient.storage.from(sourceBucket).remove([sourceObjectPath]);
      if (removeError) throw new Error("Synthetic source Storage object cleanup failed.");
      const {error: deleteError} = await sourceClient.storage.deleteBucket(sourceBucket);
      if (deleteError) throw new Error("Synthetic source Storage bucket cleanup failed.");
    }
  });
  const {error: createBucketError} = await sourceClient.storage.createBucket(sourceBucket, {
    public: false,
    fileSizeLimit: 1024,
    allowedMimeTypes: ["application/octet-stream"],
  });
  if (createBucketError) throw new Error("Synthetic source Storage bucket could not be created.");
  const {error: uploadError} = await sourceClient.storage.from(sourceBucket).upload(sourceObjectPath, sourceObjectBytes, {
    contentType: "application/octet-stream",
    cacheControl: "0",
    upsert: false,
  });
  if (uploadError) throw new Error("Synthetic source Storage object could not be uploaded.");

  const {error: evidenceUploadError} = await sourceClient.storage.from("mmwr-evidence-quarantine").upload(
    evidenceObjectPath,
    evidenceObjectBytes,
    {contentType: "application/pdf", cacheControl: "0", upsert: false},
  );
  if (evidenceUploadError) throw new Error("Synthetic source evidence fixture could not be uploaded.");
  evidenceObjectUploaded = true;
  const {error: thumbnailUploadError} = await sourceClient.storage.from("mmwr-public-thumbnail-derivatives").upload(
    thumbnailObjectPath,
    thumbnailObjectBytes,
    {contentType: "image/webp", cacheControl: "0", upsert: false},
  );
  if (thumbnailUploadError) throw new Error("Synthetic source thumbnail fixture could not be uploaded.");
  thumbnailObjectUploaded = true;
  await runLocalDatabaseCommand(sourceContainer, `
    BEGIN;
    INSERT INTO private.submissions (id, submitted_title, original_source, status, risk_level)
    VALUES ('${fixtureSubmissionId}', 'Isolated restore reference fixture', 'Synthetic local test data', 'received', 'ordinary');
    INSERT INTO private.evidence_metadata (
      id, submission_id, uploaded_by, object_path, thumbnail_object_path, mime_type, scan_state, visibility
    ) VALUES (
      '${fixtureEvidenceId}', '${fixtureSubmissionId}', NULL, '${evidenceObjectPath}',
      '${thumbnailObjectPath}', 'application/pdf', 'clean', 'public_thumbnail'
    );
    COMMIT;
  `);
  databaseFixtureSeeded = true;

  const originalBackupGate = process.env.MMWR_BACKUP_ENABLED;
  const originalRestoreGate = process.env.MMWR_BACKUP_RESTORE_ENABLED;
  const originalStorageBudget = process.env.MMWR_BACKUP_MAX_TOTAL_STORAGE_BYTES;
  process.env.MMWR_BACKUP_ENABLED = "true";
  process.env.MMWR_BACKUP_RESTORE_ENABLED = "true";
  process.env.MMWR_BACKUP_MAX_TOTAL_STORAGE_BYTES ??= String(1024 * 1024 * 1024);
  try {
    const sourceAdapter = createSupabaseStorageSource({
      url: sourceUrl,
      secretKey: sourceSecretKey,
      databaseUrl: safeDatabaseUrl.toString(),
      databasePassword: sourceDatabasePassword,
    });
    let databaseExportFailure = "";
    const source = {
      ...sourceAdapter,
      async exportDatabase({workspace}) {
        try {
          return await exportSupabaseDatabase({
            workspace,
            databaseUrl: safeDatabaseUrl.toString(),
            databasePassword: sourceDatabasePassword,
            pgDumpTransport: {mode: "docker", containerName: sourceContainer},
          });
        } catch (error) {
          databaseExportFailure = error instanceof Error ? error.message : "unknown export error";
          throw error;
        }
      },
    };
    const expectedBuckets = await source.listStorageBuckets();
    const objectStore = createMemoryObjectStore();
    const statusEvents = [];
    let backupRun;
    try {
      backupRun = await runFullBackup({
        source,
        objectStore,
        encodedKey: Buffer.alloc(32, 7).toString("base64"),
        databaseMajorVersion: 17,
        onStatus: async (event) => statusEvents.push(event),
      });
    } catch {
      const stages = statusEvents.map(({phase, status}) => `${phase}:${status}`).join(",");
      throw new Error(`Local backup failed during stages: ${stages || "before status reporting"}; database exporter: ${databaseExportFailure || "not reached"}.`);
    }
    assert.equal(backupRun.status, "succeeded");
    assert.equal(backupRun.integrityVerified, true);
    assert.ok(statusEvents.some((event) => event.phase === "complete" && event.status === "succeeded"));

    const restoreKey = Buffer.alloc(32, 7).toString("base64");
    const targetDatabase = createDockerPsqlRestoreTarget({projectRef: targetProjectRef});
    const databaseResult = await restoreDatabaseBackupRun({
      backupRun,
      objectStore,
      encodedKey: restoreKey,
      sourceProjectRef,
      targetProjectRef,
      targetEnvironment: "isolated",
      targetDatabase,
    });
    assert.equal(databaseResult.appliedKinds.length, 8);

    const targetStorage = createSupabaseStorageTarget({
      url: targetUrl,
      secretKey: targetSecretKey,
      projectRef: targetProjectRef,
    });
    const storageResult = await restoreStorageBackupRun({
      backupRun,
      objectStore,
      encodedKey: restoreKey,
      sourceProjectRef,
      targetProjectRef,
      targetEnvironment: "isolated",
      targetStorage,
    });
    assert.ok(storageResult.restoredObjects >= 1);
    assert.equal((await targetStorage.listBuckets()).length, expectedBuckets.length);
    assert.deepEqual(await targetStorage.listObjects(sourceBucket), [{path: sourceObjectPath}]);
    assert.deepEqual(await readStreamBytes(await targetStorage.downloadObject({bucket: sourceBucket, path: sourceObjectPath})), sourceObjectBytes);
    assert.ok((await targetStorage.listObjects("mmwr-evidence-quarantine")).some(({path}) => path === evidenceObjectPath));
    assert.deepEqual(await readStreamBytes(await targetStorage.downloadObject({bucket: "mmwr-evidence-quarantine", path: evidenceObjectPath})), evidenceObjectBytes);
    assert.ok((await targetStorage.listObjects("mmwr-public-thumbnail-derivatives")).some(({path}) => path === thumbnailObjectPath));
    assert.deepEqual(await readStreamBytes(await targetStorage.downloadObject({bucket: "mmwr-public-thumbnail-derivatives", path: thumbnailObjectPath})), thumbnailObjectBytes);
    assert.equal(await readTargetRowCount(`supabase_db_${targetProjectRef}`, "private.areas"), 175);
    assert.ok(await readTargetRowCount(`supabase_db_${targetProjectRef}`, "private.evidence_metadata") >= 1);
    assert.equal(await targetDatabase.verifyApplicationStorageReferences(), true);
  } finally {
    if (originalBackupGate === undefined) delete process.env.MMWR_BACKUP_ENABLED;
    else process.env.MMWR_BACKUP_ENABLED = originalBackupGate;
    if (originalRestoreGate === undefined) delete process.env.MMWR_BACKUP_RESTORE_ENABLED;
    else process.env.MMWR_BACKUP_RESTORE_ENABLED = originalRestoreGate;
    if (originalStorageBudget === undefined) delete process.env.MMWR_BACKUP_MAX_TOTAL_STORAGE_BYTES;
    else process.env.MMWR_BACKUP_MAX_TOTAL_STORAGE_BYTES = originalStorageBudget;
  }
});
