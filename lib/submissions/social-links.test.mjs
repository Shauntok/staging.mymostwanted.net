import assert from "node:assert/strict";
import {test} from "node:test";
import {isAllowedSubmissionSocialUrl} from "./social-links.mjs";

test("accepts exact allowlisted hosts and their subdomains",()=>{
  const allowed=[
    ["facebook","https://facebook.com/example"],
    ["facebook","https://www.facebook.com/example"],
    ["facebook","https://fb.com/example"],
    ["instagram","https://instagram.com/example"],
    ["instagram","https://m.instagram.com/example"],
    ["tiktok","https://www.tiktok.com/@example"],
    ["telegram","https://t.me/example"],
    ["telegram","https://www.telegram.me/example"],
  ];
  for(const [platform,url] of allowed)assert.equal(isAllowedSubmissionSocialUrl(platform,url),true,url);
});

test("rejects deceptive hosts, trailing-dot hosts, and platform mismatches",()=>{
  const rejected=[
    ["facebook","https://facebook.com.attacker.example/example"],
    ["facebook","https://evilfacebook.com/example"],
    ["facebook","https://facebook.com./example"],
    ["instagram","https://instagram.com.attacker.example/example"],
    ["telegram","https://telegram.com/example"],
    ["tiktok","https://instagram.com/example"],
  ];
  for(const [platform,url] of rejected)assert.equal(isAllowedSubmissionSocialUrl(platform,url),false,url);
});

test("requires HTTPS without credentials or an explicit port",()=>{
  const rejected=[
    ["facebook","http://facebook.com/example"],
    ["facebook","https://user@facebook.com/example"],
    ["facebook","https://user:password@facebook.com/example"],
    ["facebook","https://facebook.com:443/example"],
  ];
  for(const [platform,url] of rejected)assert.equal(isAllowedSubmissionSocialUrl(platform,url),false,url);
});

test("rejects userinfo, encoded authority characters, and malformed DNS labels",()=>{
  const rejected=[
    "https://attacker@www.facebook.com/profile",
    "https://attacker%40www.facebook.com/profile",
    "https://.www.facebook.com/profile",
    "https://www..facebook.com/profile",
    "https://-www.facebook.com/profile",
    "https://www-.facebook.com/profile",
  ];
  for(const url of rejected)assert.equal(isAllowedSubmissionSocialUrl("facebook",url),false,url);
});

test("rejects query strings and fragments to match publication rules",()=>{
  assert.equal(isAllowedSubmissionSocialUrl("facebook","https://facebook.com/example?ref=profile"),false);
  assert.equal(isAllowedSubmissionSocialUrl("facebook","https://facebook.com/example#contact"),false);
});

test("rejects malformed, untrimmed, whitespace-bearing, and overlong URLs",()=>{
  const rejected=["not a URL"," https://facebook.com/example","https://facebook.com/example ","https://facebook.com/a b","https://facebook.com/\nexample","https://facebook.com/"+"a".repeat(500)];
  for(const url of rejected)assert.equal(isAllowedSubmissionSocialUrl("facebook",url),false,url);
  assert.equal(isAllowedSubmissionSocialUrl("facebook",null),false);
  assert.equal(isAllowedSubmissionSocialUrl("unknown","https://facebook.com/example"),false);
});
