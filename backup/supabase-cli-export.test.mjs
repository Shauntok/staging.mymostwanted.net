import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PassThrough} from "node:stream";
import test from "node:test";
import {exportSupabaseDatabase} from "./supabase-cli-export.mjs";

test("database exports MMWR managed-schema customizations and platform migration compatibility", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "mmwr-cli-export-test-"));
  const originalGate = process.env.MMWR_BACKUP_ENABLED;
  process.env.MMWR_BACKUP_ENABLED = "true";
  t.after(async () => {
    if (originalGate === undefined) delete process.env.MMWR_BACKUP_ENABLED;
    else process.env.MMWR_BACKUP_ENABLED = originalGate;
    await rm(workspace, {recursive: true, force: true});
  });

  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({command, args, options});
    const fileIndex = args.indexOf("--file");
    const file = args[fileIndex + 1];
    const child = new EventEmitter();
    child.kill = () => {};
    child.stdout = new PassThrough();
    queueMicrotask(() => {
      if (fileIndex >= 0) {
        writeFile(file, `synthetic dump ${calls.length}`, {flag: "wx", mode: 0o600})
          .then(() => child.emit("close", 0, null))
          .catch((error) => child.emit("error", error));
      } else {
        const query = args[args.indexOf("--command") + 1] ?? "";
        const output = query.includes("databaseMajorVersion")
          ? '{"databaseMajorVersion":17,"authMigrations":["20260101000000"],"storageMigrations":[{"id":1,"hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","name":"initial"}]}\n'
          : query.includes("pg_trigger") ? "CREATE TRIGGER auth_email_change_resets_mmwr_verification AFTER UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION private.reset_submission_email_verification_on_email_change();\n"
            : query.includes("pg_policy") ? "CREATE POLICY mmwr_evidence_quarantine_upload_response_metadata ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (true);\n"
              : `synthetic dump ${calls.length}`;
        child.stdout.end(output);
        child.emit("close", 0, null);
      }
    });
    return child;
  };

  const databasePassword = "synthetic-local-password-for-test";
  const artifacts = await exportSupabaseDatabase({
    workspace,
    databaseUrl: "postgresql://postgres@127.0.0.1:54322/postgres",
    databasePassword,
    spawnImpl,
  });

  if (process.platform === "win32") {
    assert.equal(calls[0].command, process.execPath);
    assert.match(calls[0].args[0], /node_modules[\\/]supabase[\\/]dist[\\/]supabase\.js$/);
  } else {
    assert.equal(calls[0].command, "supabase");
  }

  assert.deepEqual(artifacts.map((artifact) => artifact.kind), [
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
  const psqlCalls = calls.filter(({command, args}) => command === "psql" || args.includes("psql"));
  const cliCalls = calls.filter(({command, args}) => command !== "psql" && !args.includes("psql"));
  assert.equal(psqlCalls.length, 3);
  assert.equal(cliCalls.length, 7);
  assert.equal(cliCalls.some(({args}) => args.includes("--schema")
    && ["auth", "storage"].includes(args[args.indexOf("--schema") + 1])
    && !args.includes("--data-only")), false);
  assert.ok(cliCalls.some(({args}) => args.includes("storage.objects")));
  assert.deepEqual(cliCalls[2].args.slice(cliCalls[2].args.indexOf("--data-only")), [
    "--data-only", "--use-copy", "--schema", "public,private",
  ]);
  assert.ok(psqlCalls.some(({args}) => args.join(" ").includes("pg_trigger")));
  assert.ok(psqlCalls.some(({args}) => args.join(" ").includes("pg_policy")));
  assert.ok(psqlCalls.some(({args}) => args.join(" ").includes("databaseMajorVersion")));
  assert.equal(calls.length, 10);
  assert.ok(calls.every(({args, options}) => !args.join(" ").includes(databasePassword)
    && (options.env.SUPABASE_DB_PASSWORD === databasePassword || psqlCalls.some(({options: psqlOptions}) => psqlOptions === options))));
  assert.ok(psqlCalls.every(({options}) => options.env.PGPASSWORD === databasePassword));
  assert.match(await readFile(artifacts.find((artifact) => artifact.kind === "database_auth_schema").path, "utf8"), /CREATE TRIGGER auth_email_change_resets_mmwr_verification/);
  assert.doesNotMatch(await readFile(artifacts.find((artifact) => artifact.kind === "database_auth_schema").path, "utf8"), /CREATE TABLE auth\./);
  assert.match(await readFile(artifacts.find((artifact) => artifact.kind === "database_storage_schema").path, "utf8"), /CREATE POLICY mmwr_evidence_quarantine_upload_response_metadata/);
  assert.doesNotMatch(await readFile(artifacts.find((artifact) => artifact.kind === "database_auth_data").path, "utf8"), /COPY auth\.schema_migrations/);
  assert.doesNotMatch(await readFile(artifacts.find((artifact) => artifact.kind === "database_storage_data").path, "utf8"), /COPY storage\.(buckets|objects|migrations)/);
  assert.deepEqual(JSON.parse(await readFile(artifacts.find((artifact) => artifact.kind === "database_platform_compatibility").path, "utf8")), {
    databaseMajorVersion: 17,
    authMigrations: ["20260101000000"],
    storageMigrations: [{id: 1, hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", name: "initial"}],
  });
  assert.match(await readFile(artifacts.find((artifact) => artifact.kind === "database_storage_data").path, "utf8"), /synthetic dump/);
});

test("database export rejects missing managed-schema customization SQL", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "mmwr-empty-schema-test-"));
  const originalGate = process.env.MMWR_BACKUP_ENABLED;
  process.env.MMWR_BACKUP_ENABLED = "true";
  t.after(async () => {
    if (originalGate === undefined) delete process.env.MMWR_BACKUP_ENABLED;
    else process.env.MMWR_BACKUP_ENABLED = originalGate;
    await rm(workspace, {recursive: true, force: true});
  });

  for (const emptySchema of ["auth", "storage"]) {
    const spawnImpl = (_command, args) => {
      const file = args[args.indexOf("--file") + 1];
      const query = args[args.indexOf("--command") + 1] ?? "";
      const isEmptyDefinition = query.includes(emptySchema === "auth" ? "pg_trigger" : "pg_policy");
      const child = new EventEmitter();
      child.kill = () => {};
      child.stdout = new PassThrough();
      queueMicrotask(() => {
        if (args.includes("--file")) {
          writeFile(file, isEmptyDefinition ? "" : "synthetic dump", {flag: "wx", mode: 0o600})
            .then(() => child.emit("close", 0, null))
            .catch((error) => child.emit("error", error));
        } else {
          const query = args[args.indexOf("--command") + 1] ?? "";
          child.stdout.end(isEmptyDefinition ? "" : query.includes("databaseMajorVersion")
            ? '{"databaseMajorVersion":17,"authMigrations":[],"storageMigrations":[]}\n'
            : "synthetic customization\n");
          child.emit("close", 0, null);
        }
      });
      return child;
    };

    await assert.rejects(exportSupabaseDatabase({
      workspace,
      databaseUrl: "postgresql://postgres@127.0.0.1:54322/postgres",
      databasePassword: "synthetic-local-password-for-test",
      cliPath: "supabase",
      spawnImpl,
    }), /managed schema export is empty/);
  }
});

test("local Docker exports managed migration signatures without passing secrets in argv", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "mmwr-docker-cli-export-test-"));
  const originalGate = process.env.MMWR_BACKUP_ENABLED;
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.MMWR_BACKUP_ENABLED = "true";
  process.env.NODE_ENV = "test";
  t.after(async () => {
    if (originalGate === undefined) delete process.env.MMWR_BACKUP_ENABLED;
    else process.env.MMWR_BACKUP_ENABLED = originalGate;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    await rm(workspace, {recursive: true, force: true});
  });

  const calls = [];
  const spawnImpl = (command, args, options) => {
    const child = new EventEmitter();
    child.kill = () => {};
    child.stdout = new PassThrough();
    calls.push({command, args, options});
    queueMicrotask(() => {
      const outputPathIndex = args.indexOf("--file");
      if (outputPathIndex >= 0) {
        writeFile(args[outputPathIndex + 1], `synthetic dump ${calls.length}`, {flag: "wx", mode: 0o600})
          .then(() => child.emit("close", 0, null))
          .catch((error) => child.emit("error", error));
        return;
      }
      const query = args[args.indexOf("--command") + 1] ?? "";
      child.stdout.end(query.includes("databaseMajorVersion")
        ? '{"databaseMajorVersion":17,"authMigrations":["20260101000000"],"storageMigrations":[]}\n'
        : query.includes("pg_trigger") ? "CREATE TRIGGER auth_custom AFTER UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION private.custom();\n"
          : query.includes("pg_policy") ? "CREATE POLICY mmwr_storage_policy ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (true);\n"
            : "synthetic query\n");
      child.emit("close", 0, null);
    });
    return child;
  };
  const databasePassword = "local-pw";
  await assert.rejects(exportSupabaseDatabase({
    workspace,
    databaseUrl: "postgresql://postgres@db.example.test:5432/postgres",
    databasePassword,
    cliPath: "supabase",
    pgDumpTransport: {mode: "docker", containerName: "supabase_db_mmwr"},
    spawnImpl,
  }), /requires a loopback database URL/);
  assert.equal(calls.length, 0);
  const artifacts = await exportSupabaseDatabase({
    workspace,
    databaseUrl: "postgresql://postgres@127.0.0.1:54322/postgres",
    databasePassword,
    cliPath: "supabase",
    pgDumpTransport: {mode: "docker", containerName: "supabase_db_mmwr"},
    dockerPath: "docker",
    spawnImpl,
  });

  const psqlCalls = calls.filter(({command, args}) => command === "docker" && args.includes("psql"));
  assert.equal(psqlCalls.length, 3);
  for (const {args, options} of psqlCalls) {
    assert.ok(args.includes("supabase_db_mmwr"));
    assert.equal(args.join(" ").includes(databasePassword), false);
    assert.equal(options.env.PGPASSWORD, undefined);
    assert.equal(options.env.SUPABASE_DB_PASSWORD, undefined);
    assert.deepEqual(options.stdio, ["ignore", "pipe", "ignore"]);
  }
  const authData = await readFile(artifacts.find((artifact) => artifact.kind === "database_auth_data").path, "utf8");
  const storageData = await readFile(artifacts.find((artifact) => artifact.kind === "database_storage_data").path, "utf8");
  assert.doesNotMatch(authData, /COPY auth\.schema_migrations/);
  assert.doesNotMatch(storageData, /COPY storage\.(buckets|objects|migrations)/);
});
