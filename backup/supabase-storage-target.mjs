import {createClient} from "@supabase/supabase-js";
import {lstat, readFile} from "node:fs/promises";
import {Readable} from "node:stream";
import {getMaxStorageObjectBytes} from "./limits.mjs";

const DEFAULT_PAGE_SIZE = 100;
const MAX_STORAGE_OBJECTS = 100000;

function parseTargetUrl(value) {
  if (typeof value !== "string") throw new Error("Storage restore Supabase URL is missing.");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Storage restore Supabase URL is invalid.");
  }
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/"
    || (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback && process.env.NODE_ENV !== "production"))) {
    throw new Error("Storage restore Supabase URL must use HTTPS, except local non-production development.");
  }
  return url;
}

function normalizeBucket(bucket) {
  const fileSizeLimit = bucket?.file_size_limit ?? bucket?.fileSizeLimit ?? null;
  const allowedMimeTypes = bucket?.allowed_mime_types ?? bucket?.allowedMimeTypes ?? null;
  if (!bucket || typeof bucket.id !== "string" || typeof bucket.name !== "string"
    || typeof bucket.public !== "boolean"
    || (fileSizeLimit !== null && (!Number.isSafeInteger(Number(fileSizeLimit)) || Number(fileSizeLimit) < 1))
    || (allowedMimeTypes !== null && (!Array.isArray(allowedMimeTypes)
      || allowedMimeTypes.some((value) => typeof value !== "string")))) {
    throw new Error("Supabase returned an invalid Storage bucket.");
  }
  return {
    id: bucket.id,
    name: bucket.name,
    public: bucket.public,
    fileSizeLimit: fileSizeLimit === null ? null : Number(fileSizeLimit),
    allowedMimeTypes: allowedMimeTypes === null ? null : [...allowedMimeTypes].sort(),
  };
}

function throwStorageError(error, message) {
  if (error) throw new Error(message);
}

/**
 * Creates a service-role Storage target. The secret stays closed over by the
 * adapter. Object listing is recursive and complete; each object write rejects
 * overwrite and is bounded before its file is read into memory.
 */
export function createSupabaseStorageTarget({
  url = process.env.SUPABASE_URL,
  secretKey = process.env.SUPABASE_SECRET_KEY,
  projectRef,
  createClientImpl = createClient,
  pageSize = DEFAULT_PAGE_SIZE,
  maxStorageObjectBytes = getMaxStorageObjectBytes(),
} = {}) {
  const targetUrl = parseTargetUrl(url);
  const validatedProjectRef = typeof projectRef === "string" && /^[a-z0-9]{20}$/.test(projectRef)
    ? projectRef : null;
  if (!validatedProjectRef) throw new Error("Storage restore project reference is invalid.");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(targetUrl.hostname)) {
    throw new Error("Local Storage restore target must use a loopback local Supabase URL.");
  }
  if (typeof secretKey !== "string" || secretKey.length < 1) {
    throw new Error("Storage restore Supabase Secret Key is missing.");
  }
  if (typeof createClientImpl !== "function") throw new Error("Storage restore Supabase client factory is invalid.");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error("Storage restore page size is invalid.");
  }
  if (!Number.isSafeInteger(maxStorageObjectBytes) || maxStorageObjectBytes < 1
    || maxStorageObjectBytes > 1024 * 1024 * 1024) {
    throw new Error("Storage restore object byte limit is invalid.");
  }

  const supabase = createClientImpl(targetUrl.origin, secretKey, {
    auth: {autoRefreshToken: false, persistSession: false, detectSessionInUrl: false},
  });

  return Object.freeze({
    projectRef: validatedProjectRef,
    async listBuckets() {
      const buckets = [];
      for (let offset = 0; ; offset += pageSize) {
        let result;
        try {
          result = await supabase.storage.listBuckets({limit: pageSize, offset, sortColumn: "id"});
        } catch {
          throw new Error("Supabase Storage bucket listing failed.");
        }
        throwStorageError(result?.error, "Supabase Storage bucket listing failed.");
        if (!Array.isArray(result?.data)) throw new Error("Supabase returned an invalid Storage bucket listing.");
        buckets.push(...result.data.map(normalizeBucket));
        if (result.data.length < pageSize) return buckets;
      }
    },

    async listObjects(bucket) {
      if (typeof bucket !== "string" || !bucket) throw new Error("Storage restore bucket ID is invalid.");
      const objects = [];
      const queue = [{path: "", offset: 0}];
      const seenPaths = new Set();
      for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
        const folder = queue[queueIndex];
        while (true) {
          let result;
          try {
            result = await supabase.storage.from(bucket).list(folder.path, {
              limit: pageSize,
              offset: folder.offset,
              sortBy: {column: "name", order: "asc"},
            });
          } catch {
            throw new Error("Supabase Storage object listing failed.");
          }
          throwStorageError(result?.error, "Supabase Storage object listing failed.");
          if (!Array.isArray(result?.data)) throw new Error("Supabase returned an invalid Storage object listing.");
          for (const entry of result.data) {
            if (!entry || typeof entry.name !== "string" || !entry.name || entry.name === "."
              || entry.name === ".." || entry.name.includes("/")) {
              throw new Error("Supabase returned an invalid Storage object path.");
            }
            const path = folder.path ? `${folder.path}/${entry.name}` : entry.name;
            if (entry.id === null) {
              if (seenPaths.has(`${path}/`)) throw new Error("Supabase Storage returned a duplicate folder.");
              if (queue.length >= MAX_STORAGE_OBJECTS) throw new Error("Supabase Storage inventory exceeds supported limits.");
              seenPaths.add(`${path}/`);
              queue.push({path, offset: 0});
              continue;
            }
            const size = typeof entry.metadata?.size === "number" ? entry.metadata.size
              : typeof entry.metadata?.size === "string" && /^[0-9]{1,18}$/.test(entry.metadata.size)
                ? Number(entry.metadata.size) : NaN;
            if (!Number.isSafeInteger(size) || size < 0 || seenPaths.has(path)) {
              throw new Error("Supabase returned incomplete or duplicate Storage object metadata.");
            }
            if (objects.length >= MAX_STORAGE_OBJECTS) throw new Error("Supabase Storage inventory exceeds supported limits.");
            seenPaths.add(path);
            objects.push({path});
          }
          folder.offset += result.data.length;
          if (result.data.length < pageSize) break;
        }
      }
      return objects;
    },

    async createBucket(bucket) {
      const config = normalizeBucket(bucket);
      let result;
      try {
        result = await supabase.storage.createBucket(config.id, {
          public: config.public,
          fileSizeLimit: config.fileSizeLimit,
          allowedMimeTypes: config.allowedMimeTypes,
        });
      } catch {
        throw new Error("Supabase Storage bucket creation failed.");
      }
      throwStorageError(result?.error, "Supabase Storage bucket creation failed.");
    },

    async uploadObject({bucket, path, filePath, mimeType = null, cacheControl = null, upsert}) {
      if (upsert !== false) throw new Error("Supabase Storage restore must not overwrite existing objects.");
      const stat = await lstat(filePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxStorageObjectBytes) {
        throw new Error("Supabase Storage restore object exceeds the configured byte limit.");
      }
      const bytes = await readFile(filePath);
      let result;
      try {
        result = await supabase.storage.from(bucket).upload(path, bytes, {
          upsert: false,
          ...(mimeType ? {contentType: mimeType} : {}),
          ...(cacheControl ? {cacheControl} : {}),
        });
      } catch {
        throw new Error("Supabase Storage object upload failed.");
      }
      throwStorageError(result?.error, "Supabase Storage object upload failed.");
    },

    async downloadObject({bucket, path}) {
      let result;
      try {
        result = await supabase.storage.from(bucket).download(path);
      } catch {
        throw new Error("Supabase Storage object readback failed.");
      }
      throwStorageError(result?.error, "Supabase Storage object readback failed.");
      if (!result?.data || typeof result.data.stream !== "function") {
        throw new Error("Supabase Storage returned an invalid object readback.");
      }
      return Readable.fromWeb(result.data.stream());
    },
  });
}
