import assert from "node:assert/strict";
import test from "node:test";
import {getSitemapShardCount,getSitemapShardIds,getSitemapShardRange} from "./sitemap-pagination.mjs";

test("sitemap shards account for independent post and tag page limits",()=>{
  assert.equal(getSitemapShardCount(0,0),1);
  assert.equal(getSitemapShardCount(1_001,1),3);
  assert.equal(getSitemapShardCount(5_001,1),11);
  assert.equal(getSitemapShardCount(0,1_001),3);
  assert.equal(getSitemapShardCount(null,null),null);
  assert.equal(getSitemapShardCount(0,null),null);
  assert.equal(getSitemapShardCount(-1,0),null);
  assert.equal(getSitemapShardCount(Number.MAX_SAFE_INTEGER+1,0),null);
});

test("sitemap shard IDs are unavailable when either public row count is unknown",()=>{
  assert.equal(getSitemapShardIds(null,0),null);
  assert.deepEqual(getSitemapShardIds(0,0),[{id:0}]);
});

test("each sitemap shard uses bounded non-overlapping post and tag ranges below the API row cap",()=>{
  assert.deepEqual(getSitemapShardRange(0),{
    postOffset:0,postLimit:500,tagOffset:0,tagLimit:500,
  });
  assert.deepEqual(getSitemapShardRange(1),{
    postOffset:500,postLimit:500,tagOffset:500,tagLimit:500,
  });
  assert.deepEqual(getSitemapShardRange(2),{
    postOffset:1_000,postLimit:500,tagOffset:1_000,tagLimit:500,
  });
  assert.equal(getSitemapShardRange(-1),null);
  assert.equal(getSitemapShardRange(Number.MAX_SAFE_INTEGER),null);
});

test("shard ids include every bounded public sitemap page",()=>{
  const ids=getSitemapShardIds(1_200,1_100);
  assert.deepEqual(ids,[{id:0},{id:1},{id:2}]);
});
