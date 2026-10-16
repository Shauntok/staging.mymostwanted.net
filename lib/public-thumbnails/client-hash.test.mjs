import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import test from "node:test";
import {getPublicThumbnailClientHash} from "./client-hash.mjs";

const secret="a sufficiently long test-only hmac secret value";

test("thumbnail rate-limit keys hash only a configured trusted proxy address",()=>{
  const headers=new Headers({"x-vercel-forwarded-for":"203.0.113.8, 10.0.0.1"});
  const hash=getPublicThumbnailClientHash(headers,{secret,trustedHeader:"x-vercel-forwarded-for"});
  assert.match(hash,/^[a-f0-9]{64}$/);
  assert.equal(getPublicThumbnailClientHash(headers,{secret,trustedHeader:"x-forwarded-for"}),null);
  assert.equal(getPublicThumbnailClientHash(new Headers(),{secret,trustedHeader:"x-vercel-forwarded-for"}),null);
  assert.equal(getPublicThumbnailClientHash(headers,{secret:"short",trustedHeader:"x-vercel-forwarded-for"}),null);
});

test("thumbnail HMAC is stable and domain-separated",()=>{
  const headers=new Headers({"cf-connecting-ip":"2001:db8::8"});
  const options={secret,trustedHeader:"cf-connecting-ip"};
  assert.equal(getPublicThumbnailClientHash(headers,options),getPublicThumbnailClientHash(headers,options));
  const searchHash=createHmac("sha256",secret).update("mmwr:public-search-rate-limit:").update("2001:db8::8").digest("hex");
  assert.notEqual(getPublicThumbnailClientHash(headers,options),searchHash);
});
