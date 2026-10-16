import assert from "node:assert/strict";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Readable} from "node:stream";
import test from "node:test";
import {createSupabaseStorageTarget} from "./supabase-storage-target.mjs";

function makeSupabaseClient({calls = [], buckets = [], listedObjects = {}, bytes = new Map()} = {}) {
  return {
    calls,
    storage: {
      async listBuckets({limit, offset}) {
        calls.push(["listBuckets", limit, offset]);
        return {data: buckets.slice(offset, offset + limit), error: null};
      },
      async createBucket(id, options) {
        calls.push(["createBucket", id, options]);
        buckets.push({id, name: id, ...options});
        return {data: null, error: null};
      },
      from(bucket) {
        return {
          async list(folder, options) {
            calls.push(["list", bucket, folder, options]);
            const entries = listedObjects[`${bucket}/${folder}`] ?? [];
            const page = entries.slice(options.offset, options.offset + options.limit);
            return {data: page, error: null};
          },
          async upload(path, data, options) {
            calls.push(["upload", bucket, path, options, Buffer.from(data)]);
            bytes.set(`${bucket}/${path}`, Buffer.from(data));
            return {data: {path}, error: null};
          },
          async download(path) {
            calls.push(["download", bucket, path]);
            const object = bytes.get(`${bucket}/${path}`);
            return {data: object ? new Blob([object]) : null, error: object ? null : new Error("missing")};
          },
        };
      },
    },
  };
}

test("Supabase target adapter maps bucket policy and paginates nested object inventory", async () => {
  const folders = {
    "evidence/": [{name: "nested", id: null}],
    "evidence/nested": [{name: "one.bin", id: "1", metadata: {size: 4}, updated_at: "2026-10-05T00:00:00Z"}],
  };
  const client = makeSupabaseClient({
    buckets: [
      {id: "evidence", name: "evidence", public: false, file_size_limit: null, allowed_mime_types: null},
      {id: "private", name: "private", public: false, file_size_limit: 1024, allowed_mime_types: ["application/pdf"]},
    ],
    listedObjects: folders,
  });
  const target = createSupabaseStorageTarget({
    url: "http://127.0.0.1:54321",
    projectRef: "abcdefghijklmnopqrst",
    secretKey: "local-test-secret",
    createClientImpl: () => client,
    pageSize: 1,
  });

  assert.deepEqual(await target.listBuckets(), [
    {id: "evidence", name: "evidence", public: false, fileSizeLimit: null, allowedMimeTypes: null},
    {id: "private", name: "private", public: false, fileSizeLimit: 1024, allowedMimeTypes: ["application/pdf"]},
  ]);
  assert.deepEqual(await target.listObjects("evidence"), [{path: "nested/one.bin"}]);
  assert.equal(client.calls.filter(([name]) => name === "list").length, 4);
});

test("Supabase target adapter creates private policy, refuses upserts, and streams readback bytes", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mmwr-storage-target-"));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const filePath = join(directory, "fixture.bin");
  await writeFile(filePath, Buffer.from("synthetic bytes"));
  const client = makeSupabaseClient();
  const target = createSupabaseStorageTarget({
    url: "http://localhost:54321",
    projectRef: "abcdefghijklmnopqrst",
    secretKey: "local-test-secret",
    createClientImpl: () => client,
  });

  await target.createBucket({id: "private-evidence", name: "private-evidence", public: false, fileSizeLimit: 1024, allowedMimeTypes: ["image/webp"]});
  await target.uploadObject({
    bucket: "private-evidence", path: "post/preview.webp", filePath,
    mimeType: "image/webp", cacheControl: "300", upsert: false,
  });
  const response = await target.downloadObject({bucket: "private-evidence", path: "post/preview.webp"});
  assert.ok(response instanceof Readable);
  const chunks = [];
  for await (const chunk of response) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), "synthetic bytes");

  assert.deepEqual(client.calls.find(([name]) => name === "createBucket").slice(1), ["private-evidence", {
    public: false, fileSizeLimit: 1024, allowedMimeTypes: ["image/webp"],
  }]);
  const upload = client.calls.find(([name]) => name === "upload");
  assert.equal(upload[3].upsert, false);
  assert.equal(upload[3].contentType, "image/webp");
  assert.equal(upload[3].cacheControl, "300");
  assert.equal(JSON.stringify(target).includes("local-test-secret"), false);
});

test("Supabase target adapter refuses production HTTP, malformed buckets, and upload over the configured limit", async (t) => {
  assert.throws(() => createSupabaseStorageTarget({url: "http://supabase.example.com", secretKey: "secret"}), /HTTPS/);
  assert.throws(() => createSupabaseStorageTarget({url: "https://user:pass@supabase.example.com", secretKey: "secret"}), /HTTPS/);

  const directory = await mkdtemp(join(tmpdir(), "mmwr-storage-target-limit-"));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const filePath = join(directory, "too-large.bin");
  await writeFile(filePath, Buffer.alloc(32));
  const client = makeSupabaseClient();
  const target = createSupabaseStorageTarget({
    url: "http://localhost:54321",
    projectRef: "abcdefghijklmnopqrst",
    secretKey: "local-test-secret",
    createClientImpl: () => client,
    maxStorageObjectBytes: 16,
  });
  await assert.rejects(target.uploadObject({bucket: "b", path: "p.bin", filePath, upsert: false}), /byte limit/);
  assert.equal(client.calls.some(([name]) => name === "upload"), false);
});

test("local restore target rejects hosted and custom remote Supabase URLs before creating a client", () => {
  let clientCreated = false;
  const createClientImpl = () => {
    clientCreated = true;
    return makeSupabaseClient();
  };
  for (const url of [
    "https://abcdefghijklmnopqrst.supabase.co",
    "https://storage.example.net",
  ]) {
    assert.throws(() => createSupabaseStorageTarget({
      url,
      projectRef: "abcdefghijklmnopqrst",
      secretKey: "local-test-secret",
      createClientImpl,
    }), /loopback local Supabase/);
  }
  assert.equal(clientCreated, false);
});
