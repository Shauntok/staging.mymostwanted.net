import assert from "node:assert/strict";
import {test} from "node:test";
import {publicShareSiteOrigin} from "./share-origin.mjs";

test("reduces a configured public HTTPS URL to its origin",()=>{
  assert.equal(publicShareSiteOrigin("https://www.mmwr.my:8443/zh-cn/report?draft=1#form"),"https://www.mmwr.my:8443/");
});

test("rejects insecure or credential-bearing URLs",async(t)=>{
  for(const [name,url] of [
    ["HTTP", "http://www.mmwr.my"],
    ["embedded credentials", "https://user:password@www.mmwr.my"],
    ["malformed URL", "not a URL"],
  ]){
    await t.test(name,()=>assert.equal(publicShareSiteOrigin(url),null));
  }
});

test("rejects IP literals and single-label hosts",async(t)=>{
  for(const [name,url] of [
    ["IPv4", "https://203.0.113.8"],
    ["IPv6", "https://[2001:db8::8]"],
    ["localhost", "https://localhost:8443"],
    ["single-label hostname", "https://intranet"],
  ]){
    await t.test(name,()=>assert.equal(publicShareSiteOrigin(url),null));
  }
});

test("rejects local, reserved, and private host suffixes",async(t)=>{
  for(const host of ["site.local","site.localdomain","site.internal","site.lan","site.test","site.invalid","site.example","example.com","docs.example.com","example.net","docs.example.net","example.org","docs.example.org","site.home.arpa","site.arpa","site.onion"]){
    await t.test(host,()=>assert.equal(publicShareSiteOrigin(`https://${host}`),null));
  }
});
