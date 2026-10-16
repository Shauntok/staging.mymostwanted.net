import assert from "node:assert/strict";
import test from "node:test";
import {createPublicThumbnailHandler} from "./delivery.mjs";

const postId="10000000-0000-4000-8000-000000000001";
const webp=Buffer.from("RIFF0000WEBPsynthetic");
const params=(id=postId,position="0")=>({params:Promise.resolve({postId:id,position})});

function handler(overrides={}){
  const calls={resolve:[],download:[]};
  const instance=createPublicThumbnailHandler({
    isEnabled:()=>true,
    checkRateLimit:async()=>({configured:true,allowed:true,retryAfterSeconds:0}),
    resolvePath:async(id,slot)=>{calls.resolve.push([id,slot]);return "user/job/lease.webp";},
    download:async(path)=>{calls.download.push(path);return {bytes:webp,size:webp.length};},
    ...overrides,
  });
  return {instance,calls};
}

test("public thumbnail route returns only bounded WebP with no-store safety headers",async()=>{
  const {instance,calls}=handler();
  const response=await instance(new Request("https://mmwr.example.test/thumb"),params());

  assert.equal(response.status,200);
  assert.equal(response.headers.get("content-type"),"image/webp");
  assert.equal(response.headers.get("cache-control"),"private, no-store, max-age=0");
  assert.equal(response.headers.get("x-content-type-options"),"nosniff");
  assert.equal(response.headers.get("content-security-policy"),"default-src 'none'; sandbox");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),webp);
  assert.deepEqual(calls.resolve,[[postId,0]]);
  assert.deepEqual(calls.download,["user/job/lease.webp"]);
});

test("hide or visibility revocation blocks the next request without a stale response cache",async()=>{
  let eligible=true;
  const {instance,calls}=handler({
    resolvePath:async()=>eligible?"user/job/lease.webp":null,
  });

  const before=await instance(new Request("https://mmwr.example.test/thumb"),params());
  eligible=false;
  const after=await instance(new Request("https://mmwr.example.test/thumb"),params());

  assert.equal(before.status,200);
  assert.equal(after.status,404);
  assert.equal(after.headers.get("cache-control"),"private, no-store, max-age=0");
  assert.equal(calls.download.length,1);
});

test("invalid identifiers and slots never resolve or download an object",async()=>{
  const {instance,calls}=handler();
  for(const [id,slot] of [["not-a-uuid","0"],[postId,"3"],[postId,"-1"],[postId,"00"]]){
    const response=await instance(new Request("https://mmwr.example.test/thumb"),params(id,slot));
    assert.equal(response.status,404);
  }
  assert.equal(calls.resolve.length,0);
  assert.equal(calls.download.length,0);
});

test("rate limiting runs before eligibility lookup and Storage access",async()=>{
  let checks=0;
  const {instance,calls}=handler({
    checkRateLimit:async()=>{checks+=1;return {configured:true,allowed:false,retryAfterSeconds:17};},
  });
  const response=await instance(new Request("https://mmwr.example.test/thumb"),params());
  assert.equal(response.status,429);
  assert.equal(response.headers.get("retry-after"),"17");
  assert.equal(checks,1);
  assert.equal(calls.resolve.length,0);
  assert.equal(calls.download.length,0);
});

test("rate-limit configuration and backend failures fail closed",async t=>{
  for(const [name,checkRateLimit,status] of [
    ["missing trusted client address",async()=>({configured:false}),503],
    ["database error",async()=>{throw new Error("hidden detail");},503],
  ]){
    await t.test(name,async()=>{
      const {instance,calls}=handler({checkRateLimit});
      const response=await instance(new Request("https://mmwr.example.test/thumb"),params());
      assert.equal(response.status,status);
      assert.equal(calls.resolve.length,0);
      assert.equal(calls.download.length,0);
    });
  }
});

test("missing, oversized, truncated, or non-WebP derivatives fail closed",async t=>{
  for(const [name,file] of [
    ["missing",null],
    ["oversized",{bytes:webp,size:512*1024+1}],
    ["truncated",{bytes:webp,size:webp.length+1}],
    ["wrong format",{bytes:Buffer.from("not an image"),size:12}],
  ]){
    await t.test(name,async()=>{
      const {instance}=handler({download:async()=>file});
      const response=await instance(new Request("https://mmwr.example.test/thumb"),params());
      assert.equal(response.status,404);
      assert.equal(response.headers.get("content-type"),null);
    });
  }
});

test("disabled gate, eligibility lookup failure, and Storage failure do not disclose an image",async t=>{
  for(const [name,overrides,status] of [
    ["disabled",{isEnabled:()=>false},404],
    ["database unavailable",{resolvePath:async()=>{throw new Error("hidden detail");}},503],
    ["Storage unavailable",{download:async()=>{throw new Error("hidden detail");}},503],
  ]){
    await t.test(name,async()=>{
      const {instance}=handler(overrides);
      const response=await instance(new Request("https://mmwr.example.test/thumb"),params());
      assert.equal(response.status,status);
      assert.equal(response.headers.get("content-type"),null);
      assert.equal(await response.text(),"");
    });
  }
});
