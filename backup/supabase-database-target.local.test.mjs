import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createHash, randomBytes} from "node:crypto";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Readable} from "node:stream";
import test from "node:test";
import {encryptBackupFile} from "./crypto.mjs";
import {createBackupManifest} from "./manifest.mjs";
import {restoreDatabaseBackupRun} from "./restore-database-run.mjs";
import {createDockerPsqlRestoreTarget} from "./supabase-psql-target.mjs";

const enabled = process.env.MMWR_TEST_LOCAL_DATABASE_RESTORE === "true";
const safeTargetRef = process.env.MMWR_TEST_LOCAL_DATABASE_RESTORE_PROJECT_REF ?? "";
const sourceProjectRef = "abcdefghijklmnopqrst";
const digest = (value) => createHash("sha256").update(value).digest("hex");

function objectStore(objects) {
  return {
    async headEncryptedObject(key) { return objects.get(key)?.head ?? null; },
    async getEncryptedObject(key) {
      const item = objects.get(key);
      if (!item) throw new Error("Missing synthetic artifact.");
      return Readable.from([item.bytes]);
    },
  };
}

async function createSyntheticEncryptedRun(workspace, targetRef, platformCompatibility) {
  const runId = `restore_${randomBytes(8).toString("hex")}`;
  const encodedKey = randomBytes(32).toString("base64");
  const suffix = targetRef;
  const names = {
    public: `mmwr_restore_probe_${suffix}`,
    auth: `mmwr_restore_auth_${suffix}`,
    storage: `mmwr_restore_storage_${suffix}`,
    history: `mmwr_restore_history_${suffix}`,
    role: `mmwr_restore_role_${suffix}`,
  };
  const plaintextByKind = new Map([
    ["database_roles", `CREATE ROLE ${names.role} NOLOGIN;\n`],
    ["database_schema", `CREATE TABLE public.${names.public} (id integer PRIMARY KEY);\nCREATE SCHEMA IF NOT EXISTS supabase_migrations;\nCREATE TABLE supabase_migrations.${names.history} (id integer PRIMARY KEY);\n`],
    ["database_auth_schema", `CREATE TABLE auth.${names.auth} (id integer PRIMARY KEY);\n`],
    ["database_storage_schema", `CREATE TABLE storage.${names.storage} (id integer PRIMARY KEY);\n`],
    ["database_data", `COPY public.${names.public} (id) FROM stdin;\n11\n\\.\n`],
    ["database_auth_data", `COPY auth.${names.auth} (id) FROM stdin;\n22\n\\.\n`],
    ["database_storage_data", `COPY storage.${names.storage} (id) FROM stdin;\n33\n\\.\n`],
    ["migration_history", `COPY supabase_migrations.${names.history} (id) FROM stdin;\n44\n\\.\n`],
    ["database_platform_compatibility", JSON.stringify(platformCompatibility)],
  ]);
  const objects = new Map();
  const artifacts = [];
  let index = 0;
  for (const [kind, plaintext] of plaintextByKind) {
    const artifactId = `artifact_${index++}`;
    const sourcePath = join(workspace, `${artifactId}.sql`);
    const encryptedPath = join(workspace, `${artifactId}.mmwrbk`);
    await writeFile(sourcePath, plaintext, {mode: 0o600});
    const encrypted = await encryptBackupFile({inputPath: sourcePath, outputPath: encryptedPath, encodedKey, runId, artifactId});
    const bytes = await readFile(encryptedPath);
    const objectKey = `runs/${runId}/${artifactId}.mmwrbk`;
    objects.set(objectKey, {bytes, head: {formatVersion: "1", contentLength: bytes.length, encryptedSha256: encrypted.encrypted.sha256}});
    artifacts.push({artifactId, kind, objectKey, plaintextBytes: Buffer.byteLength(plaintext), plaintextSha256: digest(plaintext), encryptedBytes: encrypted.encrypted.bytes, encryptedSha256: encrypted.encrypted.sha256});
  }
  const manifest = createBackupManifest({
    runId,
    createdAt: new Date(),
    databaseMajorVersion: 17,
    databaseExportStartedAt: new Date(Date.now() - 1000),
    databaseExportCompletedAt: new Date(),
    storageInventoryVerified: true,
    storageBuckets: [],
    artifacts,
  });
  const manifestArtifactId = "manifest";
  const manifestSourcePath = join(workspace, "manifest.json");
  const manifestEncryptedPath = join(workspace, "manifest.mmwrbk");
  await writeFile(manifestSourcePath, JSON.stringify(manifest), {mode: 0o600});
  const encryptedManifest = await encryptBackupFile({inputPath: manifestSourcePath, outputPath: manifestEncryptedPath, encodedKey, runId, artifactId: manifestArtifactId});
  const manifestBytes = await readFile(manifestEncryptedPath);
  const manifestObjectKey = `runs/${runId}/${manifestArtifactId}.mmwrbk`;
  objects.set(manifestObjectKey, {bytes: manifestBytes, head: {formatVersion: "1", contentLength: manifestBytes.length, encryptedSha256: encryptedManifest.encrypted.sha256}});
  return {objects, encodedKey, names, backupRun: {runId, status: "succeeded", integrityVerified: true, manifestObjectKey}};
}

function queryDockerDatabase(containerName, sql) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("docker", ["exec", "--user", "postgres", containerName, "psql", "--no-psqlrc", "--no-align", "--tuples-only", "--set", "ON_ERROR_STOP=1", "--username", "supabase_admin", "--dbname", "postgres", "--command", sql], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
      env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR},
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
    child.once("error", () => rejectPromise(new Error("Disposable database verification could not start.")));
    child.once("close", (code) => code === 0 ? resolvePromise(output.trim()) : rejectPromise(new Error("Disposable database verification failed.")));
  });
}

test("local isolated Supabase restores all synthetic encrypted database components through the coordinator", {skip: !enabled}, async (t) => {
  assert.match(safeTargetRef, /^mmwrrestoretarget[a-z0-9]{3}$/);
  const containerName = `supabase_db_${safeTargetRef}`;
  const workspace = await mkdtemp(join(tmpdir(), "mmwr-database-restore-"));
  t.after(() => rm(workspace, {recursive: true, force: true}));
  const compatibilitySql = `SELECT jsonb_build_object(
    'databaseMajorVersion', current_setting('server_version_num')::integer / 10000,
    'authMigrations', COALESCE((SELECT jsonb_agg(migration.version ORDER BY migration.version) FROM auth.schema_migrations AS migration), '[]'::jsonb),
    'storageMigrations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', migration.id, 'hash', migration.hash, 'name', migration.name) ORDER BY migration.id) FROM storage.migrations AS migration), '[]'::jsonb)
  )::text;`;
  const platformCompatibility = JSON.parse(await queryDockerDatabase(containerName, compatibilitySql));
  const fixture = await createSyntheticEncryptedRun(workspace, safeTargetRef, platformCompatibility);
  const target = createDockerPsqlRestoreTarget({projectRef: safeTargetRef});
  const previousGate = process.env.MMWR_BACKUP_RESTORE_ENABLED;
  process.env.MMWR_BACKUP_RESTORE_ENABLED = "true";
  t.after(() => previousGate === undefined ? delete process.env.MMWR_BACKUP_RESTORE_ENABLED : process.env.MMWR_BACKUP_RESTORE_ENABLED = previousGate);

  const result = await restoreDatabaseBackupRun({
    backupRun: fixture.backupRun,
    objectStore: objectStore(fixture.objects),
    encodedKey: fixture.encodedKey,
    sourceProjectRef,
    targetProjectRef: safeTargetRef,
    targetEnvironment: "isolated",
    targetDatabase: target,
  });
  assert.equal(result.writesPerformed, true);
  assert.equal(result.appliedKinds.length, 8);

  const rowCounts = await queryDockerDatabase(containerName,
    `SELECT (SELECT count(*) FROM public.${fixture.names.public}) || ',' || (SELECT count(*) FROM auth.${fixture.names.auth}) || ',' || (SELECT count(*) FROM storage.${fixture.names.storage}) || ',' || (SELECT count(*) FROM supabase_migrations.${fixture.names.history});`);
  assert.equal(rowCounts, "1,1,1,1");
  const roleExists = await queryDockerDatabase(containerName,
    `SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${fixture.names.role}') THEN 't' ELSE 'f' END;`);
  assert.equal(roleExists, "t");
});
