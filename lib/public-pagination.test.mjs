import assert from "node:assert/strict";
import test from "node:test";
import {isSupportedPublicPage, PUBLIC_OFFSET_MAX_PAGE} from "./public-pagination.mjs";

test("public offset pages stay within the supported window", () => {
  assert.equal(isSupportedPublicPage(1, 12), true);
  assert.equal(isSupportedPublicPage(PUBLIC_OFFSET_MAX_PAGE, 12), true);
  assert.equal(isSupportedPublicPage(PUBLIC_OFFSET_MAX_PAGE + 1, 12), false);
  assert.equal(isSupportedPublicPage(0, 12), false);
  assert.equal(isSupportedPublicPage(1.5, 12), false);
});

test("public offset page size is bounded", () => {
  assert.equal(isSupportedPublicPage(2, 1), true);
  assert.equal(isSupportedPublicPage(2, 13), false);
  assert.equal(isSupportedPublicPage(2, Number.NaN), false);
});
