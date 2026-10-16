import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {lstat} from "node:fs/promises";
import {isAbsolute, resolve} from "node:path";

const MAX_STORAGE_BUCKETS = 1000;
const MAX_STORAGE_OBJECTS = 100000;

function requireProjectRef(value, name) {
  if (typeof value !== "string" || !/^[a-z0-9]{20}$/.test(value)) {
    throw new Error(`Storage restore ${name} project reference is invalid.`);
  }
  return value;
}

function validateBucket(bucket) {
  if (!bucket || typeof bucket.id !== "string" || !/^[A-Za-z0-9._-]{1,63}$/.test(bucket.id)
    || typeof bucket.name !== "string" || !bucket.name || bucket.name.length > 63
    || typeof bucket.public !== "boolean"
    || (bucket.fileSizeLimit !== null && (!Number.isSafeInteger(bucket.fileSizeLimit) || bucket.fileSizeLimit < 1))
    || (bucket.allowedMimeTypes !== null && (!Array.isArray(bucket.allowedMimeTypes)
      || bucket.allowedMimeTypes.some((value) => typeof value !== "string" || value.length > 127)))) {
    throw new Error("Storage restore manifest contains an invalid bucket configuration.");
  }
  return {
    id: bucket.id,
    name: bucket.name,
    public: bucket.public,
    fileSizeLimit: bucket.fileSizeLimit,
    allowedMimeTypes: bucket.allowedMimeTypes === null ? null : [...bucket.allowedMimeTypes].sort(),
  };
}

function validateObject(object, bucketNames) {
  if (!object || typeof object.bucket !== "string" || !bucketNames.has(object.bucket)
    || typeof object.path !== "string" || object.path.length < 1 || object.path.length > 1024
    || /[\u0000-\u001f\u007f]/.test(object.path) || object.path.startsWith("/")
    || object.path.includes("\\") || object.path.split("/").some((part) => part === ".." || part === ".")
    || !Number.isSafeInteger(object.plaintextBytes) || object.plaintextBytes < 0
    || typeof object.plaintextSha256 !== "string" || !/^[a-f0-9]{64}$/.test(object.plaintextSha256)
    || typeof object.filePath !== "string" || !isAbsolute(object.filePath)) {
    throw new Error("Storage restore manifest contains an invalid object mapping.");
  }
  if (object.mimeType !== null && object.mimeType !== undefined
    && (typeof object.mimeType !== "string" || object.mimeType.length > 127)) {
    throw new Error("Storage restore manifest contains invalid object metadata.");
  }
  if (object.cacheControl !== null && object.cacheControl !== undefined
    && (typeof object.cacheControl !== "string" || object.cacheControl.length > 127)) {
    throw new Error("Storage restore manifest contains invalid object metadata.");
  }
  return {...object, filePath: resolve(object.filePath)};
}

async function hashFile(filePath, expectedBytes) {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== expectedBytes) {
    throw new Error("Storage restore artifact size does not match its verified manifest.");
  }
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    bytes += chunk.length;
    if (bytes > expectedBytes) throw new Error("Storage restore artifact exceeds its verified size.");
    hash.update(chunk);
  }
  return {bytes, sha256: hash.digest("hex")};
}

async function hashDownloadedObject(value, expectedBytes) {
  if (value === null || value === undefined) throw new Error("Storage restore object readback failed.");
  const stream = Buffer.isBuffer(value) || value instanceof Uint8Array
    ? [value]
    : value && typeof value[Symbol.asyncIterator] === "function" ? value : null;
  if (!stream) throw new Error("Storage restore object readback returned invalid bytes.");
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of stream) {
    if (!(Buffer.isBuffer(chunk) || chunk instanceof Uint8Array)) {
      throw new Error("Storage restore object readback returned invalid bytes.");
    }
    bytes += chunk.byteLength;
    if (bytes > expectedBytes) throw new Error("Storage restore object readback exceeded its verified size.");
    hash.update(chunk);
  }
  return {bytes, sha256: hash.digest("hex")};
}

function sameBucketConfiguration(left, right) {
  return left.id === right.id && left.name === right.name && left.public === right.public
    && left.fileSizeLimit === right.fileSizeLimit
    && JSON.stringify(left.allowedMimeTypes) === JSON.stringify(right.allowedMimeTypes);
}

/**
 * Restores verified, already-decrypted Storage objects to an explicitly isolated
 * target. All artifacts and target buckets are preflighted before the first write.
 * The adapter must paginate inventory results completely and must never upsert.
 */
export async function restoreStorageArtifacts({
  sourceProjectRef,
  targetProjectRef,
  targetEnvironment,
  storageBuckets,
  storageObjects,
  targetStorage,
}) {
  const sourceRef = requireProjectRef(sourceProjectRef, "source");
  const targetRef = requireProjectRef(targetProjectRef, "target");
  if (sourceRef === targetRef) throw new Error("An isolated restore target must differ from its source project.");
  if (targetEnvironment !== "isolated") {
    throw new Error("Storage restore may only target an explicitly isolated environment.");
  }
  if (!targetStorage || ["listBuckets", "listObjects", "createBucket", "uploadObject", "downloadObject"]
    .some((method) => typeof targetStorage[method] !== "function")) {
    throw new Error("Storage restore target adapter is incomplete.");
  }
  if (requireProjectRef(targetStorage.projectRef, "adapter") !== targetRef) {
    throw new Error("Storage restore adapter project reference must match the isolated target project reference.");
  }
  if (!Array.isArray(storageBuckets) || storageBuckets.length > MAX_STORAGE_BUCKETS
    || !Array.isArray(storageObjects) || storageObjects.length > MAX_STORAGE_OBJECTS) {
    throw new Error("Storage restore inventory exceeds supported limits.");
  }

  const buckets = storageBuckets.map(validateBucket);
  if (new Set(buckets.map((bucket) => bucket.id)).size !== buckets.length
    || new Set(buckets.map((bucket) => bucket.name)).size !== buckets.length) {
    throw new Error("Storage restore manifest contains duplicate bucket mappings.");
  }
  const bucketByName = new Map(buckets.map((bucket) => [bucket.name, bucket]));
  const objects = storageObjects.map((object) => validateObject(object, new Set(bucketByName.keys())));
  const objectMappings = new Set();
  for (const object of objects) {
    const key = `${object.bucket}\u0000${object.path}`;
    if (objectMappings.has(key)) throw new Error("Storage restore manifest contains duplicate object mappings.");
    objectMappings.add(key);
  }

  for (const object of objects) {
    const digest = await hashFile(object.filePath, object.plaintextBytes);
    if (digest.bytes !== object.plaintextBytes || digest.sha256 !== object.plaintextSha256) {
      throw new Error("Storage restore artifact checksum does not match its verified manifest.");
    }
  }

  let existingBuckets;
  try {
    existingBuckets = await targetStorage.listBuckets();
  } catch {
    throw new Error("Storage restore could not inspect the isolated target buckets.");
  }
  if (!Array.isArray(existingBuckets)) throw new Error("Storage restore target returned an invalid bucket inventory.");
  const existingById = new Map();
  for (const bucket of existingBuckets) {
    const normalized = validateBucket(bucket);
    if (existingById.has(normalized.id)) throw new Error("Storage restore target returned duplicate buckets.");
    existingById.set(normalized.id, normalized);
  }

  const expectedBucketIds = new Set(buckets.map((bucket) => bucket.id));
  if ([...existingById.keys()].some((bucketId) => !expectedBucketIds.has(bucketId))) {
    throw new Error("Storage restore target bucket inventory does not match the manifest.");
  }
  for (const bucket of buckets) {
    const existing = existingById.get(bucket.id);
    if (existing && !sameBucketConfiguration(existing, bucket)) {
      throw new Error("Storage restore target bucket configuration does not match the manifest.");
    }
    if (existing) {
      let targetObjects;
      try {
        targetObjects = await targetStorage.listObjects(bucket.id);
      } catch {
        throw new Error("Storage restore could not inspect an isolated target bucket.");
      }
      if (!Array.isArray(targetObjects) || targetObjects.length > 0) {
        throw new Error("Storage restore requires empty isolated target buckets.");
      }
    }
  }

  let restoredBuckets = 0;
  let restoredObjects = 0;
  let uploadedObjects = 0;
  let writesStarted = false;
  try {
    for (const bucket of buckets) {
      if (!existingById.has(bucket.id)) {
        writesStarted = true;
        await targetStorage.createBucket(bucket);
        restoredBuckets += 1;
      }
    }
    for (const object of objects) {
      const bucket = bucketByName.get(object.bucket);
      writesStarted = true;
      await targetStorage.uploadObject({
        bucket: bucket.id,
        path: object.path,
        filePath: object.filePath,
        mimeType: object.mimeType ?? null,
        cacheControl: object.cacheControl ?? null,
        upsert: false,
      });
      uploadedObjects += 1;
      const bytes = await targetStorage.downloadObject({bucket: bucket.id, path: object.path});
      const digest = await hashDownloadedObject(bytes, object.plaintextBytes);
      if (digest.bytes !== object.plaintextBytes || digest.sha256 !== object.plaintextSha256) {
        throw new Error("Storage restore readback checksum mismatch.");
      }
      restoredObjects += 1;
    }
  } catch {
    if (writesStarted) {
      throw new Error(`Storage restore stopped after creating ${restoredBuckets} buckets and uploading ${uploadedObjects} objects; the isolated target may be partial and requires review.`);
    }
    throw new Error("Storage restore failed before writing to the isolated target.");
  }

  return Object.freeze({restoredBuckets, restoredObjects, writesPerformed: writesStarted});
}
