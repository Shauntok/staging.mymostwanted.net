import {createClient} from "@supabase/supabase-js";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {runFullBackup} from "./worker.mjs";
import {createBackupObjectStore} from "./r2.mjs";
import {createSupabaseStorageSource} from "./supabase-storage-source.mjs";
import {createBackupStatusWriter} from "./status.mjs";

function required(env, key) {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Backup configuration ${key} is missing.`);
  }
  return value;
}

/** One scheduled run. A scheduler should invoke this process and retry only
 * after checking the durable run ledger for an unfinished/terminal run. */
export async function runScheduledBackup() {
  const env = process.env;
  if (env.MMWR_BACKUP_ENABLED !== "true") {
    throw new Error("Backup operations are disabled by configuration.");
  }
  const supabaseUrl = required(env, "SUPABASE_URL");
  const supabaseSecretKey = required(env, "SUPABASE_SECRET_KEY");
  const statusClient = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {autoRefreshToken: false, persistSession: false, detectSessionInUrl: false},
    global: {headers: {"x-application-name": "mmwr-backup-worker"}},
  });
  const persistStatus = createBackupStatusWriter({client: statusClient, triggerKind: "scheduled"});

  return runFullBackup({
    prepareSources: async () => {
      const objectStore = createBackupObjectStore(env);
      try {
        const source = createSupabaseStorageSource({
          url: supabaseUrl,
          secretKey: supabaseSecretKey,
          databaseUrl: env.SUPABASE_DB_URL,
          databasePassword: env.SUPABASE_DB_PASSWORD,
        });
        return {source, objectStore};
      } catch (error) {
        objectStore.close();
        throw error;
      }
    },
    encodedKey: env.MMWR_BACKUP_ENCRYPTION_KEY,
    databaseMajorVersion: Number(env.MMWR_DATABASE_MAJOR_VERSION),
    triggerKind: "scheduled",
    onStatus: persistStatus,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runScheduledBackup().then(() => {
    process.stdout.write("Scheduled backup run completed.\n");
  }).catch(() => {
    process.stderr.write("Scheduled backup run failed. Check the protected run ledger for its fixed failure status.\n");
    process.exitCode = 1;
  });
}
