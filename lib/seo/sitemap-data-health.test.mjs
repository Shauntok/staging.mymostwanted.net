import assert from "node:assert/strict";
import test from "node:test";
import {areSitemapChildAreaResultsAvailable,isSitemapPublicQueryAvailable} from "./sitemap-data-health.mjs";

test("empty public query results differ from unavailable query results",()=>{
  assert.equal(isSitemapPublicQueryAvailable({status:"ready"}),true);
  assert.equal(isSitemapPublicQueryAvailable({status:"empty"}),true);
  assert.equal(isSitemapPublicQueryAvailable({status:"unavailable"}),false);
  assert.equal(isSitemapPublicQueryAvailable(null),false);
});

test("all required public child-area lookups must succeed before publishing the directory",()=>{
  assert.equal(areSitemapChildAreaResultsAvailable([]),true);
  assert.equal(areSitemapChildAreaResultsAvailable([{status:"ready"},{status:"ready"}]),true);
  assert.equal(areSitemapChildAreaResultsAvailable([{status:"ready"},{status:"unavailable"}]),false);
  assert.equal(areSitemapChildAreaResultsAvailable(null),false);
});
