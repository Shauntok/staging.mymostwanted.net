import test from "node:test";
import assert from "node:assert/strict";
import {serializePublicCreativeWork} from "./public-post-structured-data.mjs";

test("serializes only the visible public summary fields",()=>{
  const schema=JSON.parse(serializePublicCreativeWork({
    canonical:"https://mmwr.example/en/posts/123",
    headline:"Reviewed title",
    description:"Public five-line summary",
    locale:"en",
    fullBody:"registration-gated body",
    internalEvidence:"private object key",
    submitterEmail:"resident@example.test",
  }));
  assert.deepEqual(schema,{
    "@context":"https://schema.org",
    "@type":"CreativeWork",
    headline:"Reviewed title",
    description:"Public five-line summary",
    inLanguage:"en-MY",
    mainEntityOfPage:"https://mmwr.example/en/posts/123",
  });
});

test("escapes script-closing characters while preserving parsed public text",()=>{
  const json=serializePublicCreativeWork({
    canonical:"https://mmwr.example/zh-cn/posts/123",
    headline:"标题 </script><script>alert(1)</script>",
    description:"公开摘要",
    locale:"zh-CN",
  });
  assert.ok(json);
  assert.equal(json.includes("</script>"),false);
  assert.equal(JSON.parse(json).headline,"标题 </script><script>alert(1)</script>");
});

test("maps Malay pages to the Malaysia language tag",()=>{
  const schema=JSON.parse(serializePublicCreativeWork({
    canonical:"https://mmwr.example/ms/posts/123",
    headline:"Tajuk awam",
    description:"Ringkasan awam",
    locale:"ms",
  }));
  assert.equal(schema.inLanguage,"ms-MY");
});

test("rejects non-public canonical URL schemes, credentials, queries and fragments",()=>{
  for(const canonical of [
    "http://mmwr.example/posts/123",
    "https://user:mmwr.example/posts/123",
    "https://mmwr.example/posts/123?private=1",
    "https://mmwr.example/posts/123#full-content",
    "not a URL",
  ]){
    assert.equal(serializePublicCreativeWork({canonical,headline:"Title",description:"Summary",locale:"en"}),null);
  }
});

test("rejects invalid or empty public fields and locales",()=>{
  assert.equal(serializePublicCreativeWork({canonical:"https://mmwr.example/posts/123",headline:" ",description:"Summary",locale:"en"}),null);
  assert.equal(serializePublicCreativeWork({canonical:"https://mmwr.example/posts/123",headline:"Title",description:"Summary",locale:"fr"}),null);
});
