import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";

const configPath=fileURLToPath(new URL("./home-config.ts",import.meta.url));
const publicPostsPath=fileURLToPath(new URL("./public-posts.ts",import.meta.url));
const homeContentPath=fileURLToPath(new URL("../components/home/HomeContent.tsx",import.meta.url));
const homePagePath=fileURLToPath(new URL("../components/home/HomePage.tsx",import.meta.url));

test("homepage lists query and render within their shared configured quotas",async()=>{
  const [config,publicPosts,homeContent,homePage]=await Promise.all([
    readFile(configPath,"utf8"),
    readFile(publicPostsPath,"utf8"),
    readFile(homeContentPath,"utf8"),
    readFile(homePagePath,"utf8"),
  ]);

  assert.match(config,/export const HOME_LATEST_COUNT\s*=\s*8\s*;/);
  assert.match(config,/export const HOME_HOT_COUNT\s*=\s*8\s*;/);
  assert.match(config,/export const HOME_TAG_COUNT\s*=\s*12\s*;/);
  assert.match(homeContent,/getLatestPublicPosts\(1,HOME_LATEST_COUNT\)/);
  assert.match(homeContent,/getHotRankedPublicPosts\(1,HOME_HOT_COUNT\)/);
  assert.match(homePage,/latestPosts\.slice\(0,HOME_LATEST_COUNT\)/);
  assert.match(homePage,/hotPosts\.slice\(0,HOME_HOT_COUNT\)/);
  assert.match(homePage,/tagSpotlight\.slice\(0,HOME_TAG_COUNT\)/);
  assert.match(publicPosts,/rpc\("public_home_tag_spotlight",\{p_limit:HOME_TAG_COUNT\}\)/);
  assert.doesNotMatch(publicPosts,/rpc\("public_home_tag_spotlight",\{p_limit:12\}\)/);
});
