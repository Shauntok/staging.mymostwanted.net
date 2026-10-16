import assert from "node:assert/strict";
import test from "node:test";
import {isCompleteSitemapPage} from "./sitemap-page-completeness.mjs";

test("sitemap page completeness matches the count-derived range size",()=>{
  assert.equal(isCompleteSitemapPage([],0,0,500),true);
  assert.equal(isCompleteSitemapPage(Array(500),501,0,500),true);
  assert.equal(isCompleteSitemapPage(["last"],501,500,500),true);
  assert.equal(isCompleteSitemapPage([],501,500,500),false);
  assert.equal(isCompleteSitemapPage(Array(499),500,0,500),false);
});

test("sitemap page completeness rejects invalid counts and ranges",()=>{
  assert.equal(isCompleteSitemapPage([],null,0,500),false);
  assert.equal(isCompleteSitemapPage([],1,-1,500),false);
  assert.equal(isCompleteSitemapPage([],1,0,0),false);
});
