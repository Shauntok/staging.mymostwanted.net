import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {restoreStorageArtifacts} from "./restore-storage.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");

async function makeFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "mmwr-storage-restore-"));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const objects = [
    {bucket: "private-evidence", path: "reports/item.bin", bytes: Buffer.from("evidence bytes"), mimeType: "application/octet-stream", cacheControl: "private, no-store"},
    {bucket: "public-images", path: "posts/preview.webp", bytes: Buffer.from("webp bytes"), mimeType: "image/webp", cacheControl: "3600"},
  ];
  const artifacts = await Promise.all(objects.map(async (object, index) => {
    const filePath = join(directory, `artifact-${index}.plain`);
    await writeFile(filePath, object.bytes);
    return {
      bucket: object.bucket,
      path: object.path,
      filePath,
      mimeType: object.mimeType,
      cacheControl: object.cacheControl,
      plaintextBytes: object.bytes.length,
      plaintextSha256: digest(object.bytes),
    };
  }));
  const buckets = [
    {id: "private-evidence", name: "private-evidence", public: false, fileSizeLimit: null, allowedMimeTypes: null},
    {id: "public-images", name: "public-images", public: true, fileSizeLimit: 1048576, allowedMimeTypes: ["image/webp"]},
  ];
  return {directory, objects, artifacts, buckets};
}

function makeTargetAdapter({buckets = [], objects = new Map(), calls = []} = {}) {
  const currentBuckets = new Map(buckets.map((bucket) => [bucket.id, structuredClone(bucket)]));
  return {
    calls,
    projectRef: identity.targetProjectRef,
    async listBuckets() {
      calls.push("listBuckets");
      return [...currentBuckets.values()];
    },
    async listObjects(bucket) {
      calls.push(`listObjects:${bucket}`);
      return [...objects.keys()].filter((key) => key.startsWith(`${bucket}/`)).map((key) => {
        const path = key.slice(bucket.length + 1);
        return {path};
      });
    },
    async createBucket(config) {
      calls.push(`createBucket:${config.id}`);
      currentBuckets.set(config.id, structuredClone(config));
    },
    async uploadObject({bucket, path, filePath, upsert}) {
      calls.push(`uploadObject:${bucket}/${path}`);
      assert.equal(upsert, false);
      const {readFile} = await import("node:fs/promises");
      objects.set(`${bucket}/${path}`, await readFile(filePath));
    },
    async downloadObject({bucket, path}) {
      calls.push(`downloadObject:${bucket}/${path}`);
      return objects.get(`${bucket}/${path}`);
    },
  };
}

const identity = {
  sourceProjectRef: "abcdefghijklmnopqrst",
  targetProjectRef: "bcdefghijklmnopqrstu",
  targetEnvironment: "isolated",
};

test("isolated Storage restore creates configured buckets, uploads without overwrite, and verifies bytes", async (t) => {
  const fixture = await makeFixture(t);
  const target = makeTargetAdapter();

  const result = await restoreStorageArtifacts({
    ...identity,
    storageBuckets: fixture.buckets,
    storageObjects: fixture.artifacts,
    targetStorage: target,
  });

  assert.equal(result.restoredBuckets, 2);
  assert.equal(result.restoredObjects, 2);
  assert.equal(result.writesPerformed, true);
  assert.ok(target.calls.includes("createBucket:private-evidence"));
  assert.ok(target.calls.includes("createBucket:public-images"));
  assert.ok(target.calls.includes("downloadObject:private-evidence/reports/item.bin"));
});

test("Storage restore validates the whole artifact set and isolation before any writes", async (t) => {
  const fixture = await makeFixture(t);
  const target = makeTargetAdapter();
  const damaged = [...fixture.artifacts, {...fixture.artifacts[0], path: "late/bad.bin", plaintextSha256: "0".repeat(64)}];

  await assert.rejects(restoreStorageArtifacts({
    ...identity, storageBuckets: fixture.buckets, storageObjects: damaged, targetStorage: target,
  }), /checksum/);
  assert.equal(target.calls.some((call) => call.startsWith("createBucket:") || call.startsWith("uploadObject:")), false);
  await assert.rejects(restoreStorageArtifacts({
    ...identity, targetProjectRef: identity.sourceProjectRef,
    storageBuckets: fixture.buckets, storageObjects: fixture.artifacts, targetStorage: target,
  }), /differ from its source/);
  await assert.rejects(restoreStorageArtifacts({
    ...identity, targetEnvironment: "production",
    storageBuckets: fixture.buckets, storageObjects: fixture.artifacts, targetStorage: target,
  }), /isolated environment/);
});

test("Storage restore rejects an adapter bound to a different project before inventory or writes", async (t) => {
  const fixture = await makeFixture(t);
  const target = makeTargetAdapter();
  target.projectRef = "cdefghijklmnopqrstuv";
  await assert.rejects(restoreStorageArtifacts({
    ...identity, storageBuckets: fixture.buckets, storageObjects: fixture.artifacts, targetStorage: target,
  }), /adapter project reference/);
  assert.deepEqual(target.calls, []);
});

test("Storage restore refuses non-empty or conflicting destination buckets before writing", async (t) => {
  const fixture = await makeFixture(t);
  const occupied = makeTargetAdapter({
    buckets: [fixture.buckets[0]],
    objects: new Map([["private-evidence/old.bin", Buffer.from("keep")]]),
  });
  await assert.rejects(restoreStorageArtifacts({
    ...identity, storageBuckets: fixture.buckets, storageObjects: fixture.artifacts, targetStorage: occupied,
  }), /empty isolated target/);
  assert.equal(occupied.calls.some((call) => call.startsWith("createBucket:") || call.startsWith("uploadObject:")), false);

  const conflict = makeTargetAdapter({buckets: [{...fixture.buckets[0], public: true}]});
  await assert.rejects(restoreStorageArtifacts({
    ...identity, storageBuckets: fixture.buckets, storageObjects: fixture.artifacts, targetStorage: conflict,
  }), /bucket configuration/);
  assert.equal(conflict.calls.some((call) => call.startsWith("createBucket:") || call.startsWith("uploadObject:")), false);
});

test("Storage restore rejects corrupted files and unsafe paths before target writes", async (t) => {
  const fixture = await makeFixture(t);
  const target = makeTargetAdapter();
  await writeFile(fixture.artifacts[0].filePath, "changed bytes");
  await assert.rejects(restoreStorageArtifacts({
    ...identity, storageBuckets: fixture.buckets, storageObjects: fixture.artifacts, targetStorage: target,
  }), /size|checksum/);
  assert.equal(target.calls.some((call) => call.startsWith("createBucket:") || call.startsWith("uploadObject:")), false);

  const safeFixture = await makeFixture(t);
  const unsafe = [{...safeFixture.artifacts[0], path: "../escape"}, safeFixture.artifacts[1]];
  await assert.rejects(restoreStorageArtifacts({
    ...identity, storageBuckets: safeFixture.buckets, storageObjects: unsafe, targetStorage: target,
  }), /invalid object mapping/);
});
