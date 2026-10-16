import {createClient} from "@supabase/supabase-js";
import {randomUUID} from "node:crypto";
import {Readable} from "node:stream";
import {exportSupabaseDatabase} from "./supabase-cli-export.mjs";
import {getMaxStorageObjectBytes} from "./limits.mjs";

const PAGE_SIZE = 100;
const SIGNED_URL_SECONDS = 300;

function getUrl(value) {
  if (typeof value !== "string") throw new Error("Backup Supabase URL is missing.");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Backup Supabase URL is invalid.");
  }
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash
    || (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback && process.env.NODE_ENV !== "production"))) {
    throw new Error("Backup Supabase URL must use HTTPS, except local non-production development.");
  }
  return url;
}

/**
 * Creates a privileged Storage source for the isolated backup worker.
 * Its service key remains closed over by this module and is never returned.
 */
export function createSupabaseStorageSource({
  url = process.env.SUPABASE_URL,
  secretKey = process.env.SUPABASE_SECRET_KEY,
  databaseUrl = process.env.SUPABASE_DB_URL,
  databasePassword = process.env.SUPABASE_DB_PASSWORD,
} = {}) {
  if (process.env.MMWR_BACKUP_ENABLED !== "true") {
    throw new Error("Backup operations are disabled by configuration.");
  }
  const supabaseUrl = getUrl(url);
  const maxStorageObjectBytes = getMaxStorageObjectBytes();
  if (typeof secretKey !== "string" || secretKey.length < 32) {
    throw new Error("Backup Supabase server credential is missing or invalid.");
  }

  const supabase = createClient(supabaseUrl.origin + supabaseUrl.pathname.replace(/\/$/, ""), secretKey, {
    auth: {autoRefreshToken: false, persistSession: false, detectSessionInUrl: false},
    global: {headers: {"x-application-name": "mmwr-backup-worker"}},
  });
  const cursors = new Map();

  async function beginInventory() {
    const bucketConfigurations = await listStorageBuckets();
    return {bucketConfigurations, bucketIndex: 0, queue: [], queueIndex: 0};
  }

  async function listStorageBuckets() {
    const buckets = [];
    const limit = 100;
    for (let offset = 0; ; offset += limit) {
      const {data, error} = await supabase.storage.listBuckets({
        limit,
        offset,
        sortColumn: "id",
        sortOrder: "asc",
      });
      if (error || !Array.isArray(data)) throw new Error("Backup Storage bucket inventory could not be read.");
      for (const bucket of data) {
        if (!bucket || typeof bucket.id !== "string" || !bucket.id
          || typeof bucket.name !== "string" || bucket.name.length < 1 || bucket.name.length > 63
          || typeof bucket.public !== "boolean"
          || (bucket.file_size_limit !== undefined && bucket.file_size_limit !== null
            && (!Number.isSafeInteger(bucket.file_size_limit) || bucket.file_size_limit < 1))
          || (bucket.allowed_mime_types !== undefined && bucket.allowed_mime_types !== null
            && (!Array.isArray(bucket.allowed_mime_types)
              || bucket.allowed_mime_types.some((value) => typeof value !== "string" || value.length > 127)))) {
          throw new Error("Backup Storage returned an invalid bucket entry.");
        }
        buckets.push({
          id: bucket.id,
          name: bucket.name,
          public: bucket.public,
          fileSizeLimit: bucket.file_size_limit ?? null,
          allowedMimeTypes: bucket.allowed_mime_types ?? null,
        });
      }
      if (data.length < limit) return buckets;
    }
  }

  async function listStorageObjects(cursor = null) {
    let state;
    if (cursor === null) {
      state = await beginInventory();
    } else {
      if (typeof cursor !== "string" || !cursors.has(cursor)) {
        throw new Error("Backup Storage inventory cursor is invalid or expired.");
      }
      state = cursors.get(cursor);
      cursors.delete(cursor);
    }

    const objects = [];
    while (objects.length < PAGE_SIZE) {
      if (state.bucketIndex >= state.bucketConfigurations.length) break;
      const bucket = state.bucketConfigurations[state.bucketIndex].name;
      if (state.queue.length === 0) {
        state.queue.push({path: "", offset: 0});
        state.queueIndex = 0;
      }
      if (state.queueIndex >= state.queue.length) {
        state.bucketIndex += 1;
        state.queue = [];
        state.queueIndex = 0;
        continue;
      }

      const folder = state.queue[state.queueIndex];
      const {data, error} = await supabase.storage.from(bucket).list(folder.path, {
        limit: PAGE_SIZE,
        offset: folder.offset,
        sortBy: {column: "name", order: "asc"},
      });
      if (error || !Array.isArray(data)) {
        throw new Error("Backup Storage object listing failed.");
      }

      for (const entry of data) {
        if (!entry || typeof entry.name !== "string" || !entry.name
          || entry.name === "." || entry.name === ".." || entry.name.includes("/")) {
          throw new Error("Backup Storage returned an invalid object entry.");
        }
        const path = folder.path ? `${folder.path}/${entry.name}` : entry.name;
        if (entry.id === null) {
          state.queue.push({path, offset: 0});
          continue;
        }

        const sizeValue = entry.metadata?.size;
        const size = typeof sizeValue === "number" ? sizeValue
          : typeof sizeValue === "string" && /^[0-9]{1,18}$/.test(sizeValue) ? Number(sizeValue) : NaN;
        const updatedAt = typeof entry.updated_at === "string" ? entry.updated_at : "";
        if (!Number.isSafeInteger(size) || size < 0 || !Number.isFinite(Date.parse(updatedAt))) {
          throw new Error("Backup Storage returned incomplete file metadata.");
        }
        objects.push({
          bucket,
          path,
          size,
          updatedAt: new Date(updatedAt).toISOString(),
          ...(typeof entry.metadata?.mimetype === "string" ? {mimeType: entry.metadata.mimetype} : {}),
          ...(typeof entry.metadata?.cacheControl === "string" ? {cacheControl: entry.metadata.cacheControl} : {}),
        });
      }

      folder.offset += data.length;
      if (data.length < PAGE_SIZE) state.queueIndex += 1;
    }

    if (state.bucketIndex >= state.bucketConfigurations.length) return {objects, nextCursor: null};
    const nextCursor = randomUUID();
    cursors.set(nextCursor, state);
    return {objects, nextCursor};
  }

  async function downloadStorageObject(object) {
    const {data, error} = await supabase.storage.from(object.bucket)
      .createSignedUrl(object.path, SIGNED_URL_SECONDS, {download: true});
    const signedUrl = data?.signedUrl ?? data?.signedURL;
    if (error || typeof signedUrl !== "string") {
      throw new Error("Backup Storage object could not be prepared for download.");
    }

    let downloadUrl;
    try {
      downloadUrl = new URL(signedUrl);
    } catch {
      throw new Error("Backup Storage returned an invalid download URL.");
    }
    if (downloadUrl.origin !== supabaseUrl.origin || downloadUrl.username || downloadUrl.password) {
      throw new Error("Backup Storage download URL did not match the configured project origin.");
    }

    const response = await fetch(downloadUrl, {cache: "no-store", redirect: "error"});
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      throw new Error("Backup Storage object download failed.");
    }
    const contentLength = response.headers.get("content-length");
    if (contentLength !== null
      && (!/^(0|[1-9]\d*)$/.test(contentLength)
        || Number(contentLength) !== object.size
        || Number(contentLength) > maxStorageObjectBytes)) {
      await response.body.cancel().catch(() => {});
      throw new Error("Backup Storage object length did not match its bounded inventory.");
    }
    return Readable.fromWeb(response.body);
  }

  async function isStorageObjectUnchanged(object) {
    const {data, error} = await supabase.storage.from(object.bucket).info(object.path);
    if (error || !data) return false;
    const size = Number(data.size);
    const updatedAt = typeof data.lastModified === "string" ? Date.parse(data.lastModified) : NaN;
    return Number.isSafeInteger(size) && size === object.size
      && Number.isFinite(updatedAt) && updatedAt === Date.parse(object.updatedAt);
  }

  return Object.freeze({
    exportDatabase({workspace}) {
      return exportSupabaseDatabase({workspace, databaseUrl, databasePassword});
    },
    listStorageObjects,
    listStorageBuckets,
    downloadStorageObject,
    isStorageObjectUnchanged,
    close() {
      cursors.clear();
    },
  });
}
