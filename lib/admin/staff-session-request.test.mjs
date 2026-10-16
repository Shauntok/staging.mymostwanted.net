import assert from "node:assert/strict";
import test from "node:test";
import {getStaffSessionRequestError} from "./staff-session-request.mjs";

const validRequest = {
  origin: "https://mmwr.example",
  expectedOrigin: "https://mmwr.example",
  search: "",
  hasBody: false,
  hasContentType: false,
  contentLength: null,
};

test("allows only same-origin bodyless heartbeat requests without query parameters", () => {
  assert.equal(getStaffSessionRequestError(validRequest), null);
  assert.equal(getStaffSessionRequestError({...validRequest, contentLength: "0"}), null);
});

test("rejects cross-origin or non-empty-origin heartbeat requests", () => {
  for (const origin of [null, "", "https://attacker.example"]) {
    assert.equal(getStaffSessionRequestError({...validRequest, origin}), "origin_rejected");
  }
});

test("rejects queries, bodies, content types, and non-zero content lengths", () => {
  const invalidRequests = [
    {...validRequest, search: "?redirect=https://attacker.example"},
    {...validRequest, hasBody: true},
    {...validRequest, hasContentType: true},
    {...validRequest, contentLength: "1"},
    {...validRequest, contentLength: "00"},
  ];
  for (const request of invalidRequests) assert.equal(getStaffSessionRequestError(request), "body_not_allowed");
});
