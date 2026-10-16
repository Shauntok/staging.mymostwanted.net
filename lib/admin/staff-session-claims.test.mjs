import assert from "node:assert/strict";
import test from "node:test";
import {isEligibleStaffSessionClaims} from "./staff-session-claims.mjs";

const validClaims = {
  sub: "9e000000-0000-4000-8000-000000000001",
  session_id: "9e000000-0000-4000-8000-000000000011",
  aal: "aal2",
  amr: [{method: "mfa/totp", timestamp: 1_791_220_800}],
};

test("accepts only a structurally valid AAL2 session with TOTP proof", () => {
  assert.equal(isEligibleStaffSessionClaims(validClaims), true);
});

test("rejects claims without AAL2, valid UUIDs, or a recognized TOTP method", () => {
  const invalidClaims = [
    null,
    [],
    {...validClaims, aal: "aal1"},
    {...validClaims, sub: "not-a-uuid"},
    {...validClaims, session_id: "not-a-uuid"},
    {...validClaims, amr: []},
    {...validClaims, amr: [{method: "password"}]},
    {...validClaims, amr: "mfa/totp"},
  ];

  for (const claims of invalidClaims) assert.equal(isEligibleStaffSessionClaims(claims), false);
});
