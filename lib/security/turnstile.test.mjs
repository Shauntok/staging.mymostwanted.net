import assert from "node:assert/strict";
import {afterEach,beforeEach,test} from "node:test";
import {verifyTurnstile} from "./turnstile-core.mjs";

const originalFetch=globalThis.fetch;
const originalSecret=process.env.TURNSTILE_SECRET_KEY;
const originalSite=process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(()=>{
  process.env.TURNSTILE_SECRET_KEY="test-secret-never-logged";
  process.env.NEXT_PUBLIC_SITE_URL="https://mmwr.example.my";
});

afterEach(()=>{
  globalThis.fetch=originalFetch;
  if(originalSecret===undefined)delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY=originalSecret;
  if(originalSite===undefined)delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL=originalSite;
});

function providerResponse(payload,status=200){
  return new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json"}});
}

test("fails closed without provider configuration and does not call Siteverify",async()=>{
  delete process.env.TURNSTILE_SECRET_KEY;
  let called=false;
  globalThis.fetch=async()=>{called=true;return providerResponse({success:true});};
  assert.equal(await verifyTurnstile("token","mmwr_report"),"unavailable");
  assert.equal(called,false);
});

test("rejects empty and oversized tokens before calling Siteverify",async()=>{
  let called=false;
  globalThis.fetch=async()=>{called=true;return providerResponse({success:true});};
  assert.equal(await verifyTurnstile("","mmwr_report"),"invalid");
  assert.equal(await verifyTurnstile("x".repeat(2049),"mmwr_report"),"invalid");
  assert.equal(called,false);
});

test("accepts localhost HTTP for local development",async()=>{
  process.env.NEXT_PUBLIC_SITE_URL="http://localhost:3000/zh-cn/account";
  globalThis.fetch=async()=>providerResponse({success:true,hostname:"localhost",action:"mmwr_report"});
  assert.equal(await verifyTurnstile("local-token","mmwr_report"),"valid");
});

test("rejects unsafe configured origins without contacting Cloudflare",async()=>{
  let called=false;
  globalThis.fetch=async()=>{called=true;return providerResponse({success:true});};
  for(const site of ["http://mmwr.example.my","https://user:pass@mmwr.example.my","not a URL"]){
    process.env.NEXT_PUBLIC_SITE_URL=site;
    assert.equal(await verifyTurnstile("token","mmwr_report"),"unavailable",site);
  }
  assert.equal(called,false);
});

test("sends a bounded no-store Siteverify request with an idempotency key",async()=>{
  let request;
  globalThis.fetch=async(url,options)=>{
    request={url,options};
    return providerResponse({success:true,hostname:"MMWR.EXAMPLE.MY",action:"mmwr_report"});
  };
  assert.equal(await verifyTurnstile("single-use-token","mmwr_report"),"valid");
  assert.equal(request.url,"https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.equal(request.options.method,"POST");
  assert.equal(request.options.cache,"no-store");
  assert.equal(request.options.headers["Content-Type"],"application/x-www-form-urlencoded");
  assert.equal(request.options.signal.aborted,false);
  const body=new URLSearchParams(request.options.body);
  assert.equal(body.get("secret"),"test-secret-never-logged");
  assert.equal(body.get("response"),"single-use-token");
  assert.match(body.get("idempotency_key"),/^[0-9a-f-]{36}$/i);
});

test("requires a successful response, matching hostname, and exact action",async(t)=>{
  const cases=[
    ["provider rejection",{success:false,hostname:"mmwr.example.my",action:"mmwr_report"}],
    ["hostname mismatch",{success:true,hostname:"attacker.example",action:"mmwr_report"}],
    ["action mismatch",{success:true,hostname:"mmwr.example.my",action:"mmwr_signup"}],
    ["missing hostname",{success:true,action:"mmwr_report"}],
  ];
  for(const [name,payload] of cases){
    await t.test(name,async()=>{
      globalThis.fetch=async()=>providerResponse(payload);
      assert.equal(await verifyTurnstile("token","mmwr_report"),"invalid");
    });
  }
});

test("treats provider transport, HTTP, and malformed JSON failures as unavailable",async(t)=>{
  const cases=[
    ["network failure",async()=>{throw new Error("offline");}],
    ["non-success HTTP",async()=>providerResponse({success:false},503)],
    ["malformed JSON",async()=>new Response("not-json",{status:200})],
    ["non-object JSON",async()=>new Response("null",{status:200})],
  ];
  for(const [name,fetcher] of cases){
    await t.test(name,async()=>{
      globalThis.fetch=fetcher;
      assert.equal(await verifyTurnstile("token","mmwr_report"),"unavailable");
    });
  }
});
