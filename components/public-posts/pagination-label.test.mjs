import assert from "node:assert/strict";
import test from "node:test";
import {getPaginationNavigationLabel, shouldRenderPublicPagination} from "./pagination-label.mjs";

test("public pagination landmark names are clear in all supported locales", () => {
  assert.equal(getPaginationNavigationLabel("zh-CN"), "帖子分页导航");
  assert.equal(getPaginationNavigationLabel("en"), "Post pagination");
  assert.equal(getPaginationNavigationLabel("ms"), "Navigasi halaman hantaran");
});

test("public pagination is rendered only when a result set has a reachable previous or next page", () => {
  const canRender = (overrides = {}) => shouldRenderPublicPagination({
    status: "ready",
    hasResults: true,
    hasBasePath: true,
    page: 1,
    hasNextPage: false,
    ...overrides,
  });

  assert.equal(canRender(), false);
  assert.equal(canRender({hasNextPage: true}), true);
  assert.equal(canRender({page: 2}), true);
  assert.equal(canRender({status: "empty", page: 2}), false);
  assert.equal(canRender({status: "unavailable", hasNextPage: true}), false);
  assert.equal(canRender({hasResults: false, hasNextPage: true}), false);
  assert.equal(canRender({hasBasePath: false, hasNextPage: true}), false);
});
