import {spawn} from "node:child_process";
import {createReadStream, createWriteStream} from "node:fs";
import {lstat, readFile, rm} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {isAbsolute, relative, resolve, sep} from "node:path";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";
import {fileURLToPath} from "node:url";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const PASSTHROUGH_ENV = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_CONFIG",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
  "XDG_RUNTIME_DIR",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "SystemRoot",
  "WINDIR",
];

function validateConnectionUrl(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048) {
    throw new Error("Backup database connection URL is missing or invalid.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Backup database connection URL is invalid.");
  }
  if (!(["postgres:", "postgresql:"].includes(url.protocol))
    || !url.hostname || !url.pathname || url.pathname === "/"
    || !url.username || url.password
    || [...url.searchParams.keys()].some((key) => /password|token|secret|key/i.test(key))) {
    throw new Error("Backup database URL must omit credentials and contain a PostgreSQL database target.");
  }
  return url.toString();
}

function commandEnvironment(password) {
  const environment = {};
  if (password !== undefined) environment.SUPABASE_DB_PASSWORD = password;
  for (const key of PASSTHROUGH_ENV) {
    if (typeof process.env[key] === "string") environment[key] = process.env[key];
  }
  return environment;
}

async function runDump({command, args, env, timeoutMs, spawnImpl, stdoutPath}) {
  try {
    await new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    const child = spawnImpl(command, args, {
      cwd: process.cwd(),
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", stdoutPath ? "pipe" : "ignore", "ignore"],
    });
    const stdoutPromise = stdoutPath
      ? pipeline(child.stdout, createWriteStream(stdoutPath, {flags: "wx", mode: 0o600}))
      : Promise.resolve();
    stdoutPromise.catch(() => child.kill("SIGTERM"));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
      killTimer.unref?.();
    }, timeoutMs);
    timer.unref?.();

    child.once("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(new Error("Supabase database export could not start."));
    });
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stdoutPromise.then(() => {
        if (code === 0) resolvePromise();
        else rejectPromise(new Error(signal ? "Supabase database export was interrupted." : "Supabase database export failed."));
      }).catch(() => rejectPromise(new Error("Supabase database export failed.")));
    });
    });
  } catch (error) {
    if (stdoutPath) await rm(stdoutPath, {force: true}).catch(() => {});
    throw error;
  }
}

function validatePgDumpTransport(value, databaseUrl) {
  if (value === undefined || value === null) return {mode: "host"};
  if (!value || value.mode !== "docker" || process.env.NODE_ENV === "production"
    || typeof value.containerName !== "string"
    || !/^supabase_db_[a-z0-9]{1,64}$/.test(value.containerName)) {
    throw new Error("Local Docker pg_dump transport is invalid or unavailable in production.");
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!loopbackHosts.has(new URL(databaseUrl).hostname.toLowerCase())) {
    throw new Error("Local Docker pg_dump transport requires a loopback database URL.");
  }
  return {mode: "docker", containerName: value.containerName};
}

function assertWithinWorkspace(workspace, target) {
  if (!isAbsolute(workspace) || !isAbsolute(target)) {
    throw new Error("Database export workspace paths must be absolute.");
  }
  const rel = relative(workspace, target);
  if (!rel || rel === "." || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("Database export output escaped its private workspace.");
  }
}

async function assertRegularOutput(workspace, path, {minimumBytes = 0} = {}) {
  assertWithinWorkspace(workspace, path);
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error("Supabase CLI did not create a regular database export file.");
  }
  if (info.size < minimumBytes) {
    throw new Error("Supabase CLI managed schema export is empty.");
  }
}

const AUTH_CUSTOMIZATION_SQL = `
SELECT COALESCE(string_agg(definition, E'\\n' ORDER BY object_order), '')
FROM (
  SELECT pg_catalog.pg_get_triggerdef(trigger.oid, true) || ';' AS definition,
         'trigger:' || namespace.nspname || ':' || relation.relname || ':' || trigger.tgname AS object_order
  FROM pg_catalog.pg_trigger AS trigger
  JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger.tgrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_proc AS trigger_function ON trigger_function.oid = trigger.tgfoid
  JOIN pg_catalog.pg_namespace AS function_namespace ON function_namespace.oid = trigger_function.pronamespace
  WHERE namespace.nspname = 'auth'
    AND NOT trigger.tgisinternal
    AND function_namespace.nspname NOT IN ('auth', 'storage')
) AS mmwr_owned_auth_triggers;
`;

const STORAGE_CUSTOMIZATION_SQL = `
SELECT COALESCE(string_agg(definition, E'\\n' ORDER BY object_order), '')
FROM (
  SELECT pg_catalog.format(
    'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
    policy.polname,
    namespace.nspname,
    relation.relname,
    CASE WHEN policy.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
    CASE policy.polcmd WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' END,
    (SELECT pg_catalog.string_agg(CASE WHEN role.role_oid = 0 THEN 'PUBLIC' ELSE pg_catalog.quote_ident(pg_roles.rolname) END, ', ' ORDER BY CASE WHEN role.role_oid = 0 THEN '' ELSE pg_roles.rolname END)
     FROM pg_catalog.unnest(policy.polroles) AS role(role_oid)
     LEFT JOIN pg_catalog.pg_roles ON pg_roles.oid = role.role_oid),
    CASE WHEN policy.polqual IS NULL THEN '' ELSE ' USING (' || pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) || ')' END,
    CASE WHEN policy.polwithcheck IS NULL THEN '' ELSE ' WITH CHECK (' || pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) || ')' END
  ) AS definition,
  'policy:' || namespace.nspname || ':' || relation.relname || ':' || policy.polname AS object_order
  FROM pg_catalog.pg_policy AS policy
  JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'storage'
    AND pg_catalog.left(policy.polname, 5) = 'mmwr_'
) AS mmwr_owned_storage_policies;
`;

const PLATFORM_COMPATIBILITY_SQL = `
SELECT pg_catalog.jsonb_build_object(
  'databaseMajorVersion', pg_catalog.current_setting('server_version_num')::integer / 10000,
  'authMigrations', COALESCE((
    SELECT pg_catalog.jsonb_agg(migration.version ORDER BY migration.version)
    FROM auth.schema_migrations AS migration
  ), '[]'::jsonb),
  'storageMigrations', COALESCE((
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('id', migration.id, 'hash', migration.hash, 'name', migration.name)
      ORDER BY migration.id
    )
    FROM storage.migrations AS migration
  ), '[]'::jsonb)
)::text;
`;

async function exportPsqlQuery({workspace, outputPath, sql, databaseUrl, databasePassword, pgDumpTransport, psqlPath, dockerPath, timeoutMs, spawnImpl}) {
  assertWithinWorkspace(workspace, outputPath);
  const transportEnvironment = pgDumpTransport.mode === 'host'
    ? {...commandEnvironment(databasePassword), PGPASSWORD: databasePassword}
    : commandEnvironment();
  const args = pgDumpTransport.mode === 'host'
    ? ['--no-psqlrc', '--no-align', '--tuples-only', '--quiet', '--set', 'ON_ERROR_STOP=1', '--dbname', databaseUrl, '--command', sql]
    : ['exec', '--interactive', '--user', 'postgres', pgDumpTransport.containerName, 'psql', '--no-psqlrc', '--no-align', '--tuples-only', '--quiet', '--set', 'ON_ERROR_STOP=1', '--username', 'supabase_admin', '--dbname', 'postgres', '--command', sql];
  await runDump({
    command: pgDumpTransport.mode === 'host' ? psqlPath : dockerPath,
    args,
    env: transportEnvironment,
    timeoutMs,
    spawnImpl,
    stdoutPath: outputPath,
  });
  await assertRegularOutput(workspace, outputPath, {minimumBytes: 1});
}

async function validatePlatformCompatibilityExport(path) {
  let value;
  try {
    value = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error("Supabase platform migration compatibility export is invalid.");
  }
  if (!value || !Number.isSafeInteger(value.databaseMajorVersion) || value.databaseMajorVersion < 13
    || value.databaseMajorVersion > 99 || !Array.isArray(value.authMigrations)
    || value.authMigrations.some((version) => typeof version !== "string" || !/^\d{2,20}$/.test(version))
    || !Array.isArray(value.storageMigrations)
    || value.storageMigrations.some((migration) => !migration || !Number.isSafeInteger(migration.id) || migration.id < 0
      || typeof migration.hash !== "string" || !/^[a-f0-9]{40,64}$/i.test(migration.hash)
      || typeof migration.name !== "string" || !/^[a-z0-9_-]{1,200}$/i.test(migration.name))) {
    throw new Error("Supabase platform migration compatibility export is invalid.");
  }
}

async function combineFiles(workspace, inputs, outputPath) {
  assertWithinWorkspace(workspace, outputPath);
  for (const input of inputs) await assertRegularOutput(workspace, input);
  async function* contents() {
    for (const path of inputs) {
      for await (const chunk of createReadStream(path)) yield chunk;
    }
  }
  await pipeline(Readable.from(contents()), createWriteStream(outputPath, {flags: "wx", mode: 0o600}));
  await assertRegularOutput(workspace, outputPath);
}

/**
 * Creates the eight database components consumed by the full-backup worker.
 * The database password is supplied to Supabase CLI only through the child
 * environment, never in process arguments, URLs, output, or diagnostics.
 */
export async function exportSupabaseDatabase({
  workspace,
  databaseUrl = process.env.SUPABASE_DB_URL,
  databasePassword = process.env.SUPABASE_DB_PASSWORD,
  cliPath = process.env.SUPABASE_CLI_PATH || "supabase",
  psqlPath = process.env.PSQL_PATH || "psql",
  dockerPath = process.env.DOCKER_PATH || "docker",
  pgDumpTransport: requestedPgDumpTransport,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnImpl = spawn,
} = {}) {
  if (process.env.MMWR_BACKUP_ENABLED !== "true") {
    throw new Error("Backup operations are disabled by configuration.");
  }
  if (typeof workspace !== "string" || !isAbsolute(workspace)) {
    throw new Error("Backup database export requires an absolute private workspace.");
  }
  const workspaceInfo = await lstat(workspace);
  if (!workspaceInfo.isDirectory() || workspaceInfo.isSymbolicLink()) {
    throw new Error("Backup database export workspace must be a real directory.");
  }
  const safeDatabaseUrl = validateConnectionUrl(databaseUrl);
  const pgDumpTransport = validatePgDumpTransport(requestedPgDumpTransport, safeDatabaseUrl);
  const minimumPasswordLength = pgDumpTransport.mode === "docker" ? 1 : 12;
  if (typeof databasePassword !== "string" || databasePassword.length < minimumPasswordLength || databasePassword.length > 512) {
    throw new Error("Backup database password is missing or invalid.");
  }
  if (typeof cliPath !== "string" || !cliPath.trim()
    || typeof psqlPath !== "string" || !psqlPath.trim()
    || typeof dockerPath !== "string" || !dockerPath.trim()
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 2 * 60 * 60 * 1000) {
    throw new Error("Supabase CLI export configuration is invalid.");
  }

  // On Windows, the npm-installed `supabase` entry point is a shell shim and
  // cannot be spawned with shell:false. Run the packaged CLI script through
  // the current Node executable instead. An explicit SUPABASE_CLI_PATH still
  // takes precedence for deployments that provide a native CLI binary.
  const usePackagedWindowsCli = process.platform === "win32"
    && !process.env.SUPABASE_CLI_PATH && cliPath === "supabase";
  const cliCommand = usePackagedWindowsCli ? process.execPath : cliPath;
  const cliArgsPrefix = usePackagedWindowsCli
    ? [fileURLToPath(new URL("../node_modules/supabase/dist/supabase.js", import.meta.url))]
    : [];

  const token = randomUUID();
  const paths = {
    database_roles: resolve(workspace, `${token}.roles.sql`),
    database_schema: resolve(workspace, `${token}.schema.sql`),
    database_data: resolve(workspace, `${token}.data.sql`),
    database_auth_data: resolve(workspace, `${token}.auth-data.sql`),
    database_auth_schema: resolve(workspace, `${token}.auth-customizations.sql`),
    database_storage_data: resolve(workspace, `${token}.storage-data.sql`),
    database_storage_schema: resolve(workspace, `${token}.storage-customizations.sql`),
    migration_schema: resolve(workspace, `${token}.migration-schema.sql`),
    migration_data: resolve(workspace, `${token}.migration-data.sql`),
    migration_history: resolve(workspace, `${token}.migration-history.sql`),
    database_platform_compatibility: resolve(workspace, `${token}.platform-compatibility.json`),
  };
  const commandEnvironmentValue = commandEnvironment(databasePassword);
  const baseArgs = ["db", "dump", "--db-url", safeDatabaseUrl];
  const steps = [
    ["--file", paths.database_roles, "--role-only"],
    ["--file", paths.database_schema],
    ["--file", paths.database_data, "--data-only", "--use-copy", "--schema", "public,private"],
    ["--file", paths.database_auth_data, "--schema", "auth", "--data-only", "--use-copy", "--exclude", "auth.schema_migrations"],
    ["--file", paths.database_storage_data, "--schema", "storage", "--data-only", "--use-copy", "--exclude", "storage.buckets", "--exclude", "storage.objects", "--exclude", "storage.migrations"],
    ["--file", paths.migration_schema, "--schema", "supabase_migrations"],
    ["--file", paths.migration_data, "--schema", "supabase_migrations", "--data-only", "--use-copy"],
  ];

  for (const step of steps) {
    await runDump({
      command: cliCommand,
      args: [...cliArgsPrefix, ...baseArgs, ...step],
      env: commandEnvironmentValue,
      timeoutMs,
      spawnImpl,
    });
  }

  await exportPsqlQuery({workspace, outputPath: paths.database_auth_schema, sql: AUTH_CUSTOMIZATION_SQL, databaseUrl: safeDatabaseUrl, databasePassword, pgDumpTransport, psqlPath, dockerPath, timeoutMs, spawnImpl});
  await exportPsqlQuery({workspace, outputPath: paths.database_storage_schema, sql: STORAGE_CUSTOMIZATION_SQL, databaseUrl: safeDatabaseUrl, databasePassword, pgDumpTransport, psqlPath, dockerPath, timeoutMs, spawnImpl});
  await exportPsqlQuery({workspace, outputPath: paths.database_platform_compatibility, sql: PLATFORM_COMPATIBILITY_SQL, databaseUrl: safeDatabaseUrl, databasePassword, pgDumpTransport, psqlPath, dockerPath, timeoutMs, spawnImpl});
  await validatePlatformCompatibilityExport(paths.database_platform_compatibility);

  for (const name of [
    "database_roles",
    "database_schema",
    "database_data",
    "database_auth_data",
    "database_storage_data",
    "migration_schema",
    "migration_data",
    "database_auth_schema",
    "database_storage_schema",
    "database_platform_compatibility",
  ]) {
    await assertRegularOutput(workspace, paths[name], {
      minimumBytes: ["database_auth_schema", "database_storage_schema", "database_platform_compatibility"].includes(name) ? 1 : 0,
    });
  }
  await combineFiles(workspace, [paths.migration_schema, paths.migration_data], paths.migration_history);

  return [
    {kind: "database_roles", path: paths.database_roles},
    {kind: "database_schema", path: paths.database_schema},
    {kind: "database_data", path: paths.database_data},
    {kind: "database_auth_schema", path: paths.database_auth_schema},
    {kind: "database_auth_data", path: paths.database_auth_data},
    {kind: "database_storage_schema", path: paths.database_storage_schema},
    {kind: "database_storage_data", path: paths.database_storage_data},
    {kind: "migration_history", path: paths.migration_history},
    {kind: "database_platform_compatibility", path: paths.database_platform_compatibility},
  ];
}
