import test from "node:test";
import assert from "node:assert/strict";
import {buildPublicShareTargets,isPublicHttpsOrigin,isPublicShareHostname} from "./public-share-targets.mjs";

test("public HTTPS origin validation rejects local and private destinations",()=>{
  assert.equal(isPublicHttpsOrigin("https://mmwr.example/"),true);
  assert.equal(isPublicHttpsOrigin("http://mmwr.example/"),false);
  assert.equal(isPublicHttpsOrigin("https://localhost/"),false);
  assert.equal(isPublicHttpsOrigin("https://192.168.1.10/"),false);
  assert.equal(isPublicHttpsOrigin("https://user:mmwr.example@mmwr.example/"),false);
  assert.equal(isPublicShareHostname("example.test"),false);
});

test("share targets encode one canonical public URL and contain no attribution parameters",()=>{
  const publicUrl="https://mmwr.example/zh-cn/posts/00000000-0000-4000-8000-000000000001";
  const targets=buildPublicShareTargets(publicUrl,"公开标题 · 吉隆坡");
  assert.deepEqual(targets.map(target=>target.id),["whatsapp","telegram","facebook","x","snapchat"]);
  for(const target of targets){
    const outbound=new URL(target.href);
    const values=[...outbound.searchParams.values()];
    assert.ok(values.some(value=>value===publicUrl));
    assert.equal([...outbound.searchParams.keys()].some(key=>/^(utm_|ref|campaign|source)/i.test(key)),false);
  }
  const snapchat=new URL(targets.at(-1).href);
  assert.equal(snapchat.origin,"https://www.snapchat.com");
  assert.equal(snapchat.pathname,"/share");
  assert.equal(snapchat.searchParams.get("link"),publicUrl);
});

test("share targets fail closed for non-public URLs",()=>{
  assert.deepEqual(buildPublicShareTargets("http://mmwr.example/post","text"),[]);
  assert.deepEqual(buildPublicShareTargets("https://localhost/post","text"),[]);
  assert.deepEqual(buildPublicShareTargets("https://mmwr.example/post?preview=1","text"),[]);
  assert.deepEqual(buildPublicShareTargets("https://mmwr.example/post#private","text"),[]);
});

test("share text is capped before entering external composer URLs",()=>{
  const [target]=buildPublicShareTargets("https://mmwr.example/posts/example","x".repeat(2000));
  assert.equal(new URL(target.href).searchParams.get("text")?.length,1200);
});
