import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:http";
import {fileURLToPath} from "node:url";
import test from "node:test";

const workerPath = fileURLToPath(new URL("./run-scheduled.mjs", import.meta.url));
const ids = [
  "d3100000-0000-4000-8000-000000000001",
  "d3100000-0000-4000-8000-000000000002",
  "d3100000-0000-4000-8000-000000000003",
];
const secret = "synthetic-worker-key-do-not-print";
const providerDetail = "synthetic-provider-detail-do-not-print";
const failureText = "Account-deletion run failed. Check the protected account state and audit log.\n";
const rpc = (name) => `/rest/v1/rpc/${name}`;
const claimPath = rpc("claim_expired_account_deletions");
const checkpointPath = rpc("begin_account_deletion_auth_attempt");
const reviewPath = rpc("mark_account_deletion_review_required");
const authPath = (id) => `/auth/v1/admin/users/${id}`;

function json(response, data, status = 200) {
  response.writeHead(status, {"content-type": "application/json"});
  response.end(JSON.stringify(data));
}

/** A separate process exercises the installed SDK and the real CLI logging. */
async function runMock({rows = [{user_id: ids[0]}], handle, env = {}} = {}) {
  const requests = [];
  const handlerErrors = [];
  const server = createServer(async (request, response) => {
    try {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const record = {
        method: request.method, path: request.url,
        body: raw ? JSON.parse(raw) : null, key: request.headers.apikey,
      };
      requests.push(record);
      if (await handle?.(record, response, request)) return;
      if (record.path === claimPath) return json(response, rows);
      if (record.path === checkpointPath || record.path === reviewPath) return json(response, true);
      if (record.method === "DELETE") return json(response, {id: record.path.split("/").at(-1)});
      throw new Error("Unexpected synthetic route");
    } catch (error) {
      handlerErrors.push(error);
      if (!response.headersSent) json(response, {message: providerDetail}, 500);
      else response.destroy();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  // Inherit only runtime essentials, never real service credentials or flags.
  const childEnv = Object.fromEntries(
    ["SystemRoot", "WINDIR", "PATH", "TEMP", "TMP"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]),
  );
  Object.assign(childEnv, {
    SUPABASE_URL: url, SUPABASE_SECRET_KEY: secret,
    ACCOUNT_DELETION_CLEANUP_ENABLED: "true", ...env,
  });
  let stdout = "", stderr = "";
  const started = performance.now();
  const child = spawn(process.execPath, [workerPath], {env: childEnv, windowsHide: true, stdio: ["ignore", "pipe", "pipe"]});
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const deadline = setTimeout(() => child.kill(), 35_000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    assert.equal(handlerErrors.length, 0, handlerErrors[0]?.message);
    for (const sensitive of [secret, providerDetail, url, ...ids]) {
      assert.ok(!`${stdout}${stderr}`.includes(sensitive), "CLI must not disclose synthetic sensitive details");
    }
    return {code, stdout, stderr, requests, elapsed: performance.now() - started};
  } finally {
    clearTimeout(deadline);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function success(result, claimed, deleted, review) {
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, `Account-deletion run finished: ${claimed} claim records returned, ${deleted} accounts deleted, ${review} Auth outcomes sent to manual review.\n`);
}

function failure(result) {
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, failureText);
}

test("cleanup gate and missing configuration fail before any network request", async () => {
  for (const env of [
    {ACCOUNT_DELETION_CLEANUP_ENABLED: "false"},
    {ACCOUNT_DELETION_CLEANUP_ENABLED: ""},
    {SUPABASE_URL: ""}, {SUPABASE_SECRET_KEY: ""},
  ]) {
    const result = await runMock({env});
    failure(result);
    assert.equal(result.requests.length, 0);
  }
});

test("empty batch returns only aggregate zero counts", async () => {
  const result = await runMock({rows: []});
  success(result, 0, 0, 0);
  assert.deepEqual(result.requests.map(({method, path, body}) => ({method, path, body})), [
    {method: "POST", path: claimPath, body: {p_batch_size: 20}},
  ]);
});

test("a confirmed checkpoint precedes exactly one hard Auth delete", async () => {
  const result = await runMock();
  success(result, 1, 1, 0);
  assert.deepEqual(result.requests.map(({method, path, body}) => ({method, path, body})), [
    {method: "POST", path: claimPath, body: {p_batch_size: 20}},
    {method: "POST", path: checkpointPath, body: {p_user_id: ids[0]}},
    {method: "DELETE", path: authPath(ids[0]), body: {should_soft_delete: false}},
  ]);
  assert.ok(result.requests.every((request) => request.key === secret));
});

test("false or null checkpoint never sends an Auth deletion", async () => {
  for (const checkpoint of [false, null]) {
    const result = await runMock({handle(record, response) {
      if (record.path !== checkpointPath) return false;
      json(response, checkpoint); return true;
    }});
    success(result, 1, 0, 0);
    assert.equal(result.requests.length, 2);
  }
});

test("claim rejection or invalid shape stops before any checkpoint or Auth call", async () => {
  for (const claim of [{data: {message: providerDetail}, status: 403}, {data: true, status: 200}, {data: null, status: 200}]) {
    const result = await runMock({handle(record, response) {
      if (record.path !== claimPath) return false;
      json(response, claim.data, claim.status); return true;
    }});
    failure(result);
    assert.equal(result.requests.length, 1);
  }
});

test("invalid claim row stops before checkpoint and Auth", async () => {
  for (const row of [null, {}, {user_id: 123}]) {
    const result = await runMock({rows: [row]});
    failure(result);
    assert.equal(result.requests.length, 1);
  }
});

test("checkpoint HTTP rejection or lost response stops without Auth or retry", async () => {
  for (const loseResponse of [false, true]) {
    const result = await runMock({handle(record, response, request) {
      if (record.path !== checkpointPath) return false;
      if (loseResponse) request.socket.destroy();
      else json(response, {message: providerDetail}, 403);
      return true;
    }});
    failure(result);
    assert.equal(result.requests.length, 2);
  }
});

test("definite Auth refusal is reviewed as failed without disclosing provider detail", async () => {
  const result = await runMock({handle(record, response) {
    if (record.method !== "DELETE") return false;
    json(response, {message: providerDetail, code: "request_refused"}, 400); return true;
  }});
  success(result, 1, 0, 1);
  assert.deepEqual(result.requests.at(-1).body, {p_user_id: ids[0], p_reason: "auth_cleanup_failed"});
  assert.equal(result.requests.filter((request) => request.method === "DELETE").length, 1);
});

test("Auth socket loss is uncertain and never retried", async () => {
  const result = await runMock({handle(record, _response, request) {
    if (record.method !== "DELETE") return false;
    request.socket.destroy(); return true;
  }});
  success(result, 1, 0, 1);
  assert.equal(result.requests.at(-1).body.p_reason, "auth_cleanup_uncertain");
  assert.equal(result.requests.filter((request) => request.method === "DELETE").length, 1);
});

test("Auth infrastructure failure is uncertain and never retried", async () => {
  // Include a 5xx outside the SDK's retryable-status list; it is still uncertain.
  for (const status of [503, 505]) {
    const result = await runMock({handle(record, response) {
      if (record.method !== "DELETE") return false;
      json(response, {message: providerDetail}, status); return true;
    }});
    success(result, 1, 0, 1);
    assert.equal(result.requests.at(-1).body.p_reason, "auth_cleanup_uncertain");
    assert.equal(result.requests.filter((request) => request.method === "DELETE").length, 1);
  }
});

test("malformed Auth success response is uncertain and never retried", async () => {
  for (const status of [200, 400]) {
    const result = await runMock({handle(record, response) {
      if (record.method !== "DELETE") return false;
      response.writeHead(status, {"content-type": "application/json"});
      response.end(`{"detail":"${providerDetail}"`); return true;
    }});
    success(result, 1, 0, 1);
    assert.equal(result.requests.at(-1).body.p_reason, "auth_cleanup_uncertain");
    assert.equal(result.requests.filter((request) => request.method === "DELETE").length, 1);
  }
});

test("stalled Auth response body is aborted near 20 seconds and reviewed as uncertain", async () => {
  const result = await runMock({handle(record, response) {
    if (record.method !== "DELETE") return false;
    response.writeHead(200, {"content-type": "application/json"});
    response.write("{"); return true;
  }});
  success(result, 1, 0, 1);
  assert.ok(result.elapsed >= 19_000 && result.elapsed < 30_000, `elapsed ${result.elapsed}`);
  assert.equal(result.requests.at(-1).body.p_reason, "auth_cleanup_uncertain");
  assert.equal(result.requests.filter((request) => request.method === "DELETE").length, 1);
});

test("review rejection stops the batch after one Auth call", async () => {
  for (const rejectReview of [false, true]) {
    const result = await runMock({rows: ids.slice(0, 2).map((user_id) => ({user_id})), handle(record, response) {
      if (record.method === "DELETE") { json(response, {message: providerDetail}, 400); return true; }
      if (record.path === reviewPath) { json(response, rejectReview ? {message: providerDetail} : false, rejectReview ? 403 : 200); return true; }
      return false;
    }});
    failure(result);
    assert.equal(result.requests.length, 4);
    assert.equal(result.requests.filter((request) => request.method === "DELETE").length, 1);
  }
});

test("mixed batch keeps skips, successful deletes and manual review counts distinct", async () => {
  const result = await runMock({rows: ids.map((user_id) => ({user_id})), handle(record, response) {
    if (record.path === checkpointPath && record.body.p_user_id === ids[1]) { json(response, false); return true; }
    if (record.path === authPath(ids[2])) { json(response, {message: providerDetail}, 400); return true; }
    return false;
  }});
  success(result, 3, 1, 1);
  assert.deepEqual(result.requests.map((request) => request.path), [
    claimPath, checkpointPath, authPath(ids[0]), checkpointPath,
    checkpointPath, authPath(ids[2]), reviewPath,
  ]);
});
