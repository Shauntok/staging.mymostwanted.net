import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PassThrough} from "node:stream";
import test from "node:test";
import {createDockerPsqlRestoreTarget, createLocalPsqlRestoreTarget} from "./supabase-psql-target.mjs";

const targetProjectRef = "bcdefghijklmnopqrstu";
const connectionUrl = "postgresql://postgres@127.0.0.1:54322/postgres";

function fakePsql(calls, {queryOutput = "t\n", exitCode = 0, stderrOutput = "secret-safe suppressed diagnostic"} = {}) {
  return (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    calls.push({command, args, options});
    process.nextTick(() => {
      if (args.includes("--command")) child.stdout.end(queryOutput);
      else child.stdout.end();
      child.stderr.end(stderrOutput);
      child.emit("close", exitCode, null);
    });
    return child;
  };
}

test("preflights a pristine loopback Supabase database and keeps its password only in the child environment", async () => {
  const calls = [];
  const target = createLocalPsqlRestoreTarget({connectionUrl, databasePassword: "local-only-password", projectRef: targetProjectRef, spawnImpl: fakePsql(calls)});
  assert.deepEqual(await target.preflight(), {projectRef: targetProjectRef, environment: "isolated", pristine: true});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(calls[0].options.env.PGPASSWORD, "local-only-password");
  assert.equal(calls[0].options.env.SUPABASE_DB_PASSWORD, undefined);
  assert.equal(calls[0].args.join(" ").includes("local-only-password"), false);
  assert.equal(calls[0].args.includes("--no-psqlrc"), true);
});

test("the pristine-target query rejects rows in managed schemas while allowing only migration ledgers", async () => {
  const calls = [];
  const target = createLocalPsqlRestoreTarget({connectionUrl, databasePassword: "local-only-password", projectRef: targetProjectRef, spawnImpl: fakePsql(calls)});
  await target.preflight();
  const query = calls[0].args[calls[0].args.indexOf("--command") + 1];
  assert.match(query, /n\.nspname IN \('auth', 'storage'\)/);
  assert.match(query, /query_to_xml\(format\('SELECT EXISTS \(SELECT 1 FROM %I\.%I LIMIT 1\) AS has_rows'/);
  assert.match(query, /n\.nspname = 'auth' AND c\.relname = 'schema_migrations'/);
  assert.match(query, /n\.nspname = 'storage' AND c\.relname = 'migrations'/);
  assert.match(query, /xpath_exists\(\s*'\/table\/row\/has_rows\[text\(\) = ''true''\]'/s);
});

test("the local target validates evidence and thumbnail Storage references without returning their paths", async () => {
  const calls = [];
  const target = createLocalPsqlRestoreTarget({connectionUrl, databasePassword: "local-only-password", projectRef: targetProjectRef, spawnImpl: fakePsql(calls)});
  assert.equal(await target.verifyApplicationStorageReferences(), true);
  const query = calls[0].args[calls[0].args.indexOf("--command") + 1];
  assert.match(query, /private\.evidence_metadata/);
  assert.match(query, /mmwr-evidence-quarantine/);
  assert.match(query, /mmwr-public-thumbnail-derivatives/);
  assert.match(query, /evidence\.object_path/);
  assert.match(query, /evidence\.thumbnail_object_path/);
  assert.equal(calls[0].options.env.PGPASSWORD, "local-only-password");
  assert.equal(query.includes("84000000-"), false);
});

test("the local target fails closed when any restored evidence or thumbnail object reference is missing", async () => {
  const target = createLocalPsqlRestoreTarget({
    connectionUrl,
    databasePassword: "local-only-password",
    projectRef: targetProjectRef,
    spawnImpl: fakePsql([], {queryOutput: "f\n"}),
  });
  await assert.rejects(target.verifyApplicationStorageReferences(), /references could not be verified/);
});

test("refuses remote, credential-bearing or non-postgres targets before starting psql", () => {
  const spawnImpl = () => assert.fail("psql must not start for an unsafe target");
  for (const unsafeUrl of [
    "postgresql://postgres@db.example.com:5432/postgres",
    "postgresql://postgres:password@127.0.0.1:54322/postgres",
    "postgresql://postgres@127.0.0.1:54322/template1",
    "postgresql://postgres@192.168.1.10:54322/postgres",
  ]) {
    assert.throws(() => createLocalPsqlRestoreTarget({connectionUrl: unsafeUrl, databasePassword: "local-only-password", projectRef: targetProjectRef, spawnImpl}), /loopback|connection URL/i);
  }
});

test("refuses a target that contains application tables before any restore write", async () => {
  const calls = [];
  const target = createLocalPsqlRestoreTarget({connectionUrl, databasePassword: "local-only-password", projectRef: targetProjectRef, spawnImpl: fakePsql(calls, {queryOutput: "f\n"})});
  await assert.rejects(target.preflight(), /pristine isolated Supabase database/);
  assert.equal(calls.length, 1);
});

test("applies one verified SQL artifact in a transaction and disables triggers for COPY data", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "mmwr-database-restore-"));
  t.after(() => rm(workspace, {recursive: true, force: true}));
  const schemaPath = join(workspace, "schema.sql");
  const dataPath = join(workspace, "data.sql");
  await writeFile(schemaPath, "CREATE TABLE public.example (id integer);");
  await writeFile(dataPath, "COPY public.example (id) FROM stdin;\n1\n\\.\n");
  const calls = [];
  const target = createLocalPsqlRestoreTarget({connectionUrl, databasePassword: "local-only-password", projectRef: targetProjectRef, spawnImpl: fakePsql(calls)});
  await target.applyArtifact({kind: "database_schema", filePath: schemaPath});
  await target.applyArtifact({kind: "database_data", filePath: dataPath});
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.command, "psql");
    assert.equal(call.options.shell, false);
    assert.equal(call.args.includes("--single-transaction"), true);
    assert.equal(call.args.includes("--set"), true);
    assert.equal(call.args.includes("ON_ERROR_STOP=1"), true);
  }
  assert.equal(calls[0].args.includes("SET session_replication_role = replica"), false);
  assert.equal(calls[1].args.includes("SET session_replication_role = replica"), true);
});

test("suppresses psql diagnostics and refuses arbitrary paths or failed SQL without retry", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "mmwr-database-restore-"));
  t.after(() => rm(workspace, {recursive: true, force: true}));
  const filePath = join(workspace, "roles.sql");
  await writeFile(filePath, "SELECT 1;");
  const calls = [];
  const target = createLocalPsqlRestoreTarget({connectionUrl, databasePassword: "local-only-password", projectRef: targetProjectRef, spawnImpl: fakePsql(calls, {exitCode: 1})});
  await assert.rejects(target.applyArtifact({kind: "database_roles", filePath}), /psql command failed/);
  assert.equal(calls.length, 1);
  await assert.rejects(target.applyArtifact({kind: "database_roles", filePath: "C:\\sensitive.sql"}), /private restore workspace/);
});

test("returns only a fixed safe SQL failure category without exposing psql diagnostics", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "mmwr-database-restore-"));
  t.after(() => rm(workspace, {recursive: true, force: true}));
  const filePath = join(workspace, "auth.sql");
  await writeFile(filePath, "CREATE TABLE auth.users (id integer);");
  const calls = [];
  const target = createLocalPsqlRestoreTarget({
    connectionUrl,
    databasePassword: "local-only-password",
    projectRef: targetProjectRef,
    spawnImpl: fakePsql(calls, {
      exitCode: 1,
      stderrOutput: "ERROR: relation auth.users already exists; DETAIL: private-row-value",
    }),
  });
  await assert.rejects(target.applyArtifact({kind: "database_auth_schema", filePath}), (error) => {
    assert.match(error.message, /object_already_exists/);
    assert.doesNotMatch(error.message, /auth\.users|private-row-value/);
    return true;
  });
});

function fakeDocker(calls) {
  return (command, args, options) => {
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    const input = [];
    child.stdin.on("data", (chunk) => input.push(Buffer.from(chunk)));
    calls.push({command, args, options, input});
    child.stdin.on("end", () => process.nextTick(() => child.emit("close", 0, null)));
    if (args.includes("--command")) {
      process.nextTick(() => {
        const query = args.at(-1);
        child.stdout.end(query.includes("jsonb_build_object")
          ? '{"databaseMajorVersion":17,"authMigrations":["20260101000000"],"storageMigrations":[{"id":1,"hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","name":"initial"}]}\n'
          : "t\n");
        child.emit("close", 0, null);
      });
    }
    return child;
  };
}

test("binds Docker psql to the exact local Supabase database container and preflights it read-only", async () => {
  const calls = [];
  const target = createDockerPsqlRestoreTarget({projectRef: targetProjectRef, spawnImpl: fakeDocker(calls)});
  assert.deepEqual(await target.preflight(), {projectRef: targetProjectRef, environment: "isolated", pristine: true});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "docker");
  assert.deepEqual(calls[0].args.slice(0, 5), ["exec", "--interactive", "--user", "postgres", `supabase_db_${targetProjectRef}`]);
  assert.equal(calls[0].args[calls[0].args.indexOf("--username") + 1], "supabase_admin");
  assert.equal(calls[0].args.includes("--single-transaction"), false);
});

test("the Docker target runs the bounded application Storage-reference check against its bound project", async () => {
  const calls = [];
  const target = createDockerPsqlRestoreTarget({projectRef: targetProjectRef, spawnImpl: fakeDocker(calls)});
  assert.equal(await target.verifyApplicationStorageReferences(), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.slice(0, 5), ["exec", "--interactive", "--user", "postgres", `supabase_db_${targetProjectRef}`]);
  const query = calls[0].args[calls[0].args.indexOf("--command") + 1];
  assert.match(query, /thumbnail_object_path/);
  assert.match(query, /uploaded_by/);
});

test("refuses Auth or Storage platform migration mismatch before database artifacts are applied", async () => {
  const calls = [];
  const target = createDockerPsqlRestoreTarget({projectRef: targetProjectRef, spawnImpl: fakeDocker(calls)});
  await assert.rejects(target.verifyPlatformCompatibility({
    databaseMajorVersion: 17,
    authMigrations: ["20260101000000"],
    storageMigrations: [{id: 1, hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", name: "initial"}],
  }), /platform migration state is incompatible/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.includes("--single-transaction"), false);
});

test("streams verified SQL through Docker stdin without exposing host paths or database passwords", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "mmwr-database-restore-"));
  t.after(() => rm(workspace, {recursive: true, force: true}));
  const sql = "CREATE TABLE public.restore_probe (id integer);";
  const filePath = join(workspace, "schema.sql");
  await writeFile(filePath, sql);
  const calls = [];
  const target = createDockerPsqlRestoreTarget({projectRef: targetProjectRef, spawnImpl: fakeDocker(calls)});
  await target.applyArtifact({kind: "database_schema", filePath});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.stdio[0], "pipe");
  assert.equal(calls[0].args.includes(filePath), false);
  assert.equal(calls[0].args.at(-2), "--file");
  assert.equal(calls[0].args.at(-1), "-");
  assert.equal(Buffer.concat(calls[0].input).toString("utf8"), sql);
  assert.equal(calls[0].args.some((value) => value.includes("PASSWORD")), false);
});

test("refuses Docker target names that do not match the isolated project reference", () => {
  assert.throws(() => createDockerPsqlRestoreTarget({projectRef: targetProjectRef, containerName: "supabase_db_mmwr"}), /must match/);
});
