import {spawn} from "node:child_process";
import {createReadStream} from "node:fs";
import {lstat} from "node:fs/promises";
import {isAbsolute, resolve, sep} from "node:path";
import {tmpdir} from "node:os";

const RESTORE_KINDS = new Set([
  "database_roles",
  "database_schema",
  "database_auth_schema",
  "database_storage_schema",
  "database_data",
  "database_auth_data",
  "database_storage_data",
  "migration_history",
]);
const DATA_KINDS = new Set(["database_data", "database_auth_data", "database_storage_data"]);
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024 * 1024;
const PRISTINE_QUERY = `SELECT CASE WHEN current_database() = 'postgres' AND NOT EXISTS (
  SELECT 1
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'private', 'supabase_migrations')
    AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      JOIN pg_extension e ON e.oid = d.refobjid
      WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'
    )
) AND NOT EXISTS (
  SELECT 1
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('auth', 'storage')
    AND c.relkind IN ('r', 'p')
    AND NOT ((n.nspname = 'auth' AND c.relname = 'schema_migrations')
      OR (n.nspname = 'storage' AND c.relname = 'migrations'))
    AND xpath_exists(
      '/table/row/has_rows[text() = ''true'']',
      query_to_xml(format('SELECT EXISTS (SELECT 1 FROM %I.%I LIMIT 1) AS has_rows', n.nspname, c.relname), false, true, '')
    )
) THEN 't' ELSE 'f' END;`;
const PLATFORM_COMPATIBILITY_QUERY = `SELECT jsonb_build_object(
  'databaseMajorVersion', current_setting('server_version_num')::integer / 10000,
  'authMigrations', COALESCE((SELECT jsonb_agg(migration.version ORDER BY migration.version) FROM auth.schema_migrations AS migration), '[]'::jsonb),
  'storageMigrations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', migration.id, 'hash', migration.hash, 'name', migration.name) ORDER BY migration.id) FROM storage.migrations AS migration), '[]'::jsonb)
)::text;`;
export const APPLICATION_STORAGE_REFERENCE_QUERY = `SELECT CASE WHEN NOT EXISTS (
  SELECT 1
  FROM private.evidence_metadata AS evidence
  WHERE NOT EXISTS (
      SELECT 1 FROM storage.objects AS object
      WHERE object.bucket_id = 'mmwr-evidence-quarantine'
        AND object.name = evidence.object_path
    )
    OR (evidence.thumbnail_object_path IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM storage.objects AS object
      WHERE object.bucket_id = 'mmwr-public-thumbnail-derivatives'
        AND object.name = evidence.thumbnail_object_path
    ))
    OR (evidence.uploaded_by IS NOT NULL AND (
      pg_catalog.left(evidence.object_path, pg_catalog.length(evidence.uploaded_by::text) + 1)
        <> (evidence.uploaded_by::text || '/')
      OR (evidence.thumbnail_object_path IS NOT NULL
        AND pg_catalog.left(evidence.thumbnail_object_path, pg_catalog.length(evidence.uploaded_by::text) + 1)
          <> (evidence.uploaded_by::text || '/'))
    ))
) THEN 't' ELSE 'f' END;`;

function validateConnectionUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Local database restore connection URL is invalid.");
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!(["postgres:", "postgresql:"].includes(url.protocol))
    || !loopbackHosts.has(url.hostname.toLowerCase())
    || !url.port || Number(url.port) < 1 || Number(url.port) > 65535
    || !["postgres", "supabase_admin"].includes(decodeURIComponent(url.username))
    || url.password || url.pathname !== "/postgres" || url.search || url.hash) {
    throw new Error("Local database restore requires a credential-free loopback URL for the postgres database.");
  }
  return url.toString();
}

function processEnvironment(password) {
  const result = {PGPASSWORD: password, PGCONNECT_TIMEOUT: "10"};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "SSL_CERT_FILE", "SSL_CERT_DIR"]) {
    if (typeof process.env[key] === "string") result[key] = process.env[key];
  }
  return result;
}

function classifyPsqlFailure(diagnostic) {
  const value = diagnostic.toLowerCase();
  if (/\balready exists\b/.test(value)) return "object_already_exists";
  if (/\bduplicate key\b/.test(value)) return "duplicate_key";
  if (/\bpermission denied\b/.test(value)) return "permission_denied";
  if (/\bdoes not exist\b|\bnot exist\b/.test(value)) return "missing_object";
  if (/\bforeign key\b/.test(value)) return "foreign_key_violation";
  return "sql_error";
}

function runPsql({psqlPath, args, env, spawnImpl, captureStdout = false, stdinFilePath, timeoutMs}) {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let output = "";
    let diagnostic = "";
    let child;
    try {
      child = spawnImpl(psqlPath, args, {
        env,
        shell: false,
        windowsHide: true,
        stdio: [stdinFilePath ? "pipe" : "ignore", captureStdout ? "pipe" : "ignore", "pipe"],
      });
    } catch {
      rejectPromise(new Error("Local database restore could not start psql."));
      return;
    }
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
      killTimer.unref?.();
      finish(new Error("Local database restore psql command timed out."));
    }, timeoutMs);
    timer.unref?.();
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectPromise(error);
      else resolvePromise(value);
    }
    if (captureStdout) {
      child.stdout.on("data", (chunk) => {
        output += chunk.toString("utf8");
        if (output.length > 1024 * 1024) finish(new Error("Local database restore preflight output was invalid."));
      });
    }
    child.stderr?.on("data", (chunk) => {
      if (diagnostic.length < 4096) diagnostic += chunk.toString("utf8").slice(0, 4096 - diagnostic.length);
    });
    if (stdinFilePath) {
      const source = createReadStream(stdinFilePath);
      source.once("error", () => finish(new Error("Verified SQL component could not be streamed to psql.")));
      child.stdin.once("error", () => finish(new Error("Verified SQL component could not be streamed to psql.")));
      source.pipe(child.stdin);
    }
    child.once("error", () => finish(new Error("Local database restore could not start psql.")));
    child.once("close", (code, signal) => {
      if (code === 0 && !signal) finish(undefined, output);
      else finish(new Error(`Local database restore psql command failed (${classifyPsqlFailure(diagnostic)}).`));
    });
  });
}

function isPrivateRestorePath(filePath) {
  if (typeof filePath !== "string" || !isAbsolute(filePath)) return false;
  const resolved = resolve(filePath);
  const relativePath = resolved.slice(resolve(tmpdir()).length + 1);
  const [workspace, ...parts] = relativePath.split(sep);
  return workspace.startsWith("mmwr-database-restore-") && parts.length === 1 && parts[0].endsWith(".sql");
}

function parsePlatformCompatibility(output) {
  try {
    const value = JSON.parse(output);
    if (!value || !Number.isSafeInteger(value.databaseMajorVersion)
      || !Array.isArray(value.authMigrations) || !Array.isArray(value.storageMigrations)) throw new Error();
    return value;
  } catch {
    throw new Error("Local target Supabase migration metadata could not be verified.");
  }
}

function assertPlatformCompatibility(actualOutput, expected) {
  const actual = parsePlatformCompatibility(actualOutput);
  if (actual.databaseMajorVersion !== expected.databaseMajorVersion
    || JSON.stringify(actual.authMigrations) !== JSON.stringify(expected.authMigrations)
    || JSON.stringify(actual.storageMigrations) !== JSON.stringify(expected.storageMigrations)) {
    throw new Error("Isolated target Supabase platform migration state is incompatible with the backup.");
  }
}

/**
 * Creates a loopback-only psql target. This intentionally cannot connect to
 * Supabase hosted, Staging, or Production database endpoints.
 */
export function createLocalPsqlRestoreTarget({
  connectionUrl,
  databasePassword,
  projectRef,
  psqlPath = process.env.PSQL_PATH || "psql",
  spawnImpl = spawn,
  timeoutMs = 30 * 60 * 1000,
} = {}) {
  const safeConnectionUrl = validateConnectionUrl(connectionUrl);
  if (typeof databasePassword !== "string" || databasePassword.length < 1 || databasePassword.length > 512
    || typeof projectRef !== "string" || !/^[a-z0-9]{20}$/.test(projectRef)
    || typeof psqlPath !== "string" || !psqlPath.trim()
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 2 * 60 * 60 * 1000) {
    throw new Error("Local database restore configuration is invalid.");
  }
  const env = processEnvironment(databasePassword);

  return Object.freeze({
    projectRef,
    async preflight() {
      const output = await runPsql({
        psqlPath,
        args: ["--no-psqlrc", "--no-align", "--tuples-only", "--set", "ON_ERROR_STOP=1", "--dbname", safeConnectionUrl, "--command", PRISTINE_QUERY],
        env,
        spawnImpl,
        captureStdout: true,
        timeoutMs: Math.min(timeoutMs, 30_000),
      });
      if (output.trim() !== "t") throw new Error("Database restore requires a pristine isolated Supabase database.");
      return {projectRef, environment: "isolated", pristine: true};
    },
    async verifyPlatformCompatibility(expected) {
      const output = await runPsql({
        psqlPath,
        args: ["--no-psqlrc", "--no-align", "--tuples-only", "--set", "ON_ERROR_STOP=1", "--dbname", safeConnectionUrl, "--command", PLATFORM_COMPATIBILITY_QUERY],
        env,
        spawnImpl,
        captureStdout: true,
        timeoutMs: Math.min(timeoutMs, 30_000),
      });
      assertPlatformCompatibility(output.trim(), expected);
    },
    async verifyApplicationStorageReferences() {
      const output = await runPsql({
        psqlPath,
        args: ["--no-psqlrc", "--no-align", "--tuples-only", "--set", "ON_ERROR_STOP=1", "--dbname", safeConnectionUrl, "--command", APPLICATION_STORAGE_REFERENCE_QUERY],
        env,
        spawnImpl,
        captureStdout: true,
        timeoutMs: Math.min(timeoutMs, 30_000),
      });
      if (output.trim() !== "t") throw new Error("Restored application Storage references could not be verified.");
      return true;
    },
    async applyArtifact({kind, filePath}) {
      if (!RESTORE_KINDS.has(kind) || !isPrivateRestorePath(filePath)) {
        throw new Error("Database restore accepts only verified SQL components in its private restore workspace.");
      }
      const info = await lstat(filePath).catch(() => null);
      if (!info?.isFile() || info.isSymbolicLink() || info.size > MAX_ARTIFACT_BYTES) {
        throw new Error("Database restore SQL component is invalid.");
      }
      const args = ["--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--single-transaction"];
      if (DATA_KINDS.has(kind)) args.push("--command", "SET session_replication_role = replica");
      args.push("--file", filePath, "--dbname", safeConnectionUrl);
      await runPsql({psqlPath, args, env, spawnImpl, timeoutMs});
    },
  });
}

/**
 * Creates a Docker-local target bound to the Supabase CLI database container
 * whose name is derived from this project's local project_id. SQL is streamed
 * through stdin so no host path needs to be mounted into the container.
 */
export function createDockerPsqlRestoreTarget({
  projectRef,
  containerName = `supabase_db_${projectRef}`,
  dockerPath = "docker",
  spawnImpl = spawn,
  timeoutMs = 30 * 60 * 1000,
} = {}) {
  if (typeof projectRef !== "string" || !/^[a-z0-9]{20}$/.test(projectRef)
    || containerName !== `supabase_db_${projectRef}`
    || typeof dockerPath !== "string" || !dockerPath.trim()
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 2 * 60 * 60 * 1000) {
    throw new Error("Docker database restore target must match the isolated Supabase project reference.");
  }
  const environment = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP"]) {
    if (typeof process.env[key] === "string") environment[key] = process.env[key];
  }
  const dockerPsql = ["exec", "--interactive", "--user", "postgres", containerName, "psql"];
  const connectionArgs = ["--username", "supabase_admin", "--dbname", "postgres"];

  return Object.freeze({
    projectRef,
    async preflight() {
      const output = await runPsql({
        psqlPath: dockerPath,
        args: [...dockerPsql, "--no-psqlrc", "--no-align", "--tuples-only", "--set", "ON_ERROR_STOP=1", ...connectionArgs, "--command", PRISTINE_QUERY],
        env: environment,
        spawnImpl,
        captureStdout: true,
        timeoutMs: Math.min(timeoutMs, 30_000),
      });
      if (output.trim() !== "t") throw new Error("Database restore requires a pristine isolated Supabase database.");
      return {projectRef, environment: "isolated", pristine: true};
    },
    async verifyPlatformCompatibility(expected) {
      const output = await runPsql({
        psqlPath: dockerPath,
        args: [...dockerPsql, "--no-psqlrc", "--no-align", "--tuples-only", "--set", "ON_ERROR_STOP=1", ...connectionArgs, "--command", PLATFORM_COMPATIBILITY_QUERY],
        env: environment,
        spawnImpl,
        captureStdout: true,
        timeoutMs: Math.min(timeoutMs, 30_000),
      });
      assertPlatformCompatibility(output.trim(), expected);
    },
    async verifyApplicationStorageReferences() {
      const output = await runPsql({
        psqlPath: dockerPath,
        args: [...dockerPsql, "--no-psqlrc", "--no-align", "--tuples-only", "--set", "ON_ERROR_STOP=1", ...connectionArgs, "--command", APPLICATION_STORAGE_REFERENCE_QUERY],
        env: environment,
        spawnImpl,
        captureStdout: true,
        timeoutMs: Math.min(timeoutMs, 30_000),
      });
      if (output.trim() !== "t") throw new Error("Restored application Storage references could not be verified.");
      return true;
    },
    async applyArtifact({kind, filePath}) {
      if (!RESTORE_KINDS.has(kind) || !isPrivateRestorePath(filePath)) {
        throw new Error("Database restore accepts only verified SQL components in its private restore workspace.");
      }
      const info = await lstat(filePath).catch(() => null);
      if (!info?.isFile() || info.isSymbolicLink() || info.size > MAX_ARTIFACT_BYTES) {
        throw new Error("Database restore SQL component is invalid.");
      }
      const args = [...dockerPsql, "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--single-transaction", ...connectionArgs];
      if (DATA_KINDS.has(kind)) args.push("--command", "SET session_replication_role = replica");
      args.push("--file", "-");
      await runPsql({psqlPath: dockerPath, args, env: environment, spawnImpl, stdinFilePath: filePath, timeoutMs});
    },
  });
}
