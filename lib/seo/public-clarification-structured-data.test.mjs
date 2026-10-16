import test from "node:test";
import assert from "node:assert/strict";

const serializerModule=await import("./public-clarification-structured-data.mjs").catch(()=>null);
const {serializePublicClarificationArticle}=serializerModule??{};

test("serializes only visible clarification fields with localized Article metadata",()=>{
  assert.equal(typeof serializePublicClarificationArticle,"function","public clarification Article serializer is required");

  const json=serializePublicClarificationArticle({
    canonical:"https://mmwr.example/zh-cn/clarifications/123",
    headline:"审核后的澄清标题 </script><script>alert(1)</script>",
    description:"公开摘要\n仅供说明",
    datePublished:"2026-10-06T09:00:00+08:00",
    locale:"zh-CN",
    citation:"https://mmwr.example/posts/456",
    internalEvidence:"private://evidence/secret.pdf",
    staffNote:"Not for public page",
  });

  assert.ok(json);
  assert.equal(json.includes("</script>"),false);
  assert.deepEqual(JSON.parse(json),{
    "@context":"https://schema.org",
    "@type":"Article",
    headline:"审核后的澄清标题 </script><script>alert(1)</script>",
    description:"公开摘要 仅供说明",
    datePublished:"2026-10-06T09:00:00+08:00",
    inLanguage:"zh-CN",
    mainEntityOfPage:"https://mmwr.example/zh-cn/clarifications/123",
    citation:"https://mmwr.example/posts/456",
  });
});

test("omits invalid optional URLs and publication dates",()=>{
  assert.equal(typeof serializePublicClarificationArticle,"function","public clarification Article serializer is required");
  const json=serializePublicClarificationArticle({
    canonical:"http://mmwr.example/clarifications/123?preview=1",
    headline:"Clarification",
    description:"Public summary",
    datePublished:"not a date",
    locale:"en",
    citation:"javascript:alert(1)",
  });

  assert.ok(json);
  assert.deepEqual(JSON.parse(json),{
    "@context":"https://schema.org",
    "@type":"Article",
    headline:"Clarification",
    description:"Public summary",
    inLanguage:"en-MY",
  });
});

test("does not attach a third-party citation to an MMWR clarification",()=>{
  assert.equal(typeof serializePublicClarificationArticle,"function","public clarification Article serializer is required");
  const json=serializePublicClarificationArticle({
    canonical:"https://mmwr.example/en/clarifications/123",
    headline:"Clarification",
    description:"Public summary",
    locale:"en",
    citation:"https://unrelated.example/posts/456",
  });

  assert.ok(json);
  assert.equal(JSON.parse(json).citation,undefined);
});

test("omits schema when the public article content or locale is invalid",()=>{
  assert.equal(typeof serializePublicClarificationArticle,"function","public clarification Article serializer is required");
  for(const input of [
    {canonical:null,headline:" ",description:"Summary",locale:"en"},
    {canonical:null,headline:"Title",description:"\u0000",locale:"en"},
    {canonical:null,headline:"Title",description:"Summary",locale:"fr"},
  ]){
    assert.equal(serializePublicClarificationArticle(input),null);
  }
});
