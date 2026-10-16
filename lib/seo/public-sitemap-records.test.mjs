import assert from "node:assert/strict";
import test from "node:test";
import {parsePublicSitemapRecords} from "./public-sitemap-records.mjs";

const validRecord={
  post_id:"00000000-0000-4000-8000-000000000001",
  last_listed_at:"2026-10-06T00:00:00.000Z",
  content_type:"story",
};

test("public sitemap record pages preserve valid public metadata and normalize UUIDs",()=>{
  assert.deepEqual(parsePublicSitemapRecords([validRecord],null),[{
    post_id:validRecord.post_id,
    last_listed_at:validRecord.last_listed_at,
    content_type:"story",
  }]);
});

test("public sitemap record pages distinguish query failure from an empty page",()=>{
  assert.equal(parsePublicSitemapRecords(null,new Error("unavailable")),null);
  assert.equal(parsePublicSitemapRecords(null,null),null);
  assert.deepEqual(parsePublicSitemapRecords([],null),[]);
});

test("one malformed row fails the complete public sitemap page closed",()=>{
  assert.equal(parsePublicSitemapRecords([validRecord,{...validRecord,post_id:"private"}],null),null);
  assert.equal(parsePublicSitemapRecords([{...validRecord,last_listed_at:"not-a-date"}],null),null);
  assert.equal(parsePublicSitemapRecords([{...validRecord,content_type:"internal"}],null),null);
});
