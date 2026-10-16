import assert from "node:assert/strict";
import test from "node:test";
import {buildSitemapIndexXml,buildSitemapXml,parseSitemapShardId} from "./sitemap-document.mjs";

test("sitemap index lists every current shard using the live route format",()=>{
  const xml=buildSitemapIndexXml(new URL("https://mmwr.example"),[{id:0},{id:1}]);
  assert.match(xml,/https:\/\/mmwr\.example\/sitemap\/0/);
  assert.match(xml,/https:\/\/mmwr\.example\/sitemap\/1/);
  assert.match(xml,/<sitemapindex[^>]+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
});

test("sitemap XML preserves alternates and escapes URL characters",()=>{
  const xml=buildSitemapXml([{
    url:"https://mmwr.example/zh-cn/areas?state=Kuala Lumpur&district=abc",
    lastModified:new Date("2026-10-05T00:00:00.000Z"),
    alternates:{languages:{"en-MY":"https://mmwr.example/en/areas?state=Kuala Lumpur&district=abc","x-default":"https://mmwr.example/en/areas?state=Kuala Lumpur&district=abc"}},
  }]);
  assert.match(xml,/state=Kuala%20Lumpur&amp;district=abc/);
  assert.match(xml,/hreflang="en-MY"/);
  assert.match(xml,/lastmod>2026-10-05T00:00:00\.000Z/);
});

test("sitemap shard route ids accept only bounded non-negative integers",()=>{
  assert.equal(parseSitemapShardId("0"),0);
  assert.equal(parseSitemapShardId("125"),125);
  for(const value of ["-1","1.xml","1/2","1.5","9007199254740992",""])assert.equal(parseSitemapShardId(value),null);
});
