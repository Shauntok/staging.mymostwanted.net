import assert from "node:assert/strict";
import test from "node:test";

const policy = await import("./route-policy.mjs").catch(() => null);

test("localized private routes are excluded from analytics and public routes keep coarse categories", () => {
  assert.equal(typeof policy?.analyticsRouteForPathname, "function");

  const route = policy.analyticsRouteForPathname;
  for (const path of [
    "/zh-cn/account",
    "/en/account/reset-password",
    "/ms/admin",
    "/zh-cn/auth/callback",
    "/en/submit",
    "/ms/submissions/status",
    "/zh-cn/report/123e4567-e89b-12d3-a456-426614174000",
    "/api/analytics/page-view",
  ]) assert.equal(route(path), null, `${path} must be excluded`);

  assert.equal(route("/"), "home");
  assert.equal(route("/zh-cn"), "home");
  assert.equal(route("/zh-cn/areas"), "areas");
  assert.equal(route("/en/hot/"), "hot");
  assert.equal(route("/ms/posts/123e4567-e89b-12d3-a456-426614174000"), "posts");
  assert.equal(route("/zh-cn/privacy"), "legal");
  assert.equal(route("/en/clarifications"), "other_public");
});
