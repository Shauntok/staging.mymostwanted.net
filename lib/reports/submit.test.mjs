import assert from "node:assert/strict";
import {test} from "node:test";
import {submitReportRequest} from "./submit.mjs";

const userId="8c4c6134-62a2-4e0a-a40a-e0df72c5ba32";
const attackerId="1ec9b947-7a31-4d23-b6b5-30fbfa2eb1b0";
const reference="baf4b950-45c1-4a38-9857-ae5a499a92f5";

function feedbackRequest(overrides={}){
  return new Request("https://mmwr.example.my/api/reports",{
    method:"POST",
    headers:{origin:"https://mmwr.example.my","content-type":"application/json"},
    body:JSON.stringify({
      kind:"feedback",
      postId:null,
      reason:"suggestion",
      message:"  Please improve keyboard navigation.  ",
      locale:"zh-CN",
      turnstileToken:"valid-token",
      submitterId:attackerId,
      ...overrides,
    }),
  });
}

function dependencies(overrides={}){
  const calls=[];
  let inserted=null;
  const value={
    siteUrl:"https://mmwr.example.my/base",
    authenticate:async()=>{calls.push("authenticate");return {user:{id:userId},accountState:"active"};},
    verifyTurnstile:async(token,action)=>{calls.push(["turnstile",token,action]);return "valid";},
    createReport:async(input)=>{calls.push("write");inserted=input;return {data:reference,error:null};},
    calls,
    get inserted(){return inserted;},
    ...overrides,
  };
  return value;
}

test("does not verify captcha or write when there is no authenticated user",async()=>{
  const deps=dependencies({authenticate:async()=>{deps.calls.push("authenticate");return {user:null,accountState:null};}});

  const result=await submitReportRequest(feedbackRequest(),deps);

  assert.equal(result.status,401);
  assert.deepEqual(result.body,{error:"sign_in_required"});
  assert.deepEqual(deps.calls,["authenticate"]);
  assert.equal(deps.inserted,null);
});

test("rejects an inactive account before captcha verification or report creation",async()=>{
  const deps=dependencies({authenticate:async()=>{deps.calls.push("authenticate");return {user:{id:userId},accountState:"suspended"};}});

  const result=await submitReportRequest(feedbackRequest(),deps);

  assert.equal(result.status,403);
  assert.deepEqual(result.body,{error:"account_restricted"});
  assert.deepEqual(deps.calls,["authenticate"]);
  assert.equal(deps.inserted,null);
});

test("does not create a report when Turnstile is invalid or unavailable",async(t)=>{
  for(const [verification,status,error] of [["invalid",400,"captcha_invalid"],["unavailable",503,"captcha_unavailable"]]){
    await t.test(verification,async()=>{
      const deps=dependencies({verifyTurnstile:async(token,action)=>{deps.calls.push(["turnstile",token,action]);return verification;}});

      const result=await submitReportRequest(feedbackRequest(),deps);

      assert.equal(result.status,status);
      assert.deepEqual(result.body,{error});
      assert.deepEqual(deps.calls,["authenticate",["turnstile","valid-token","mmwr_report"]]);
      assert.equal(deps.inserted,null);
    });
  }
});

test("writes only after verification and uses the authenticated user instead of a body identity",async()=>{
  const deps=dependencies();

  const result=await submitReportRequest(feedbackRequest(),deps);

  assert.equal(result.status,200);
  assert.deepEqual(deps.calls,["authenticate",["turnstile","valid-token","mmwr_report"],"write"]);
  assert.deepEqual(deps.inserted,{
    p_submitter_id:userId,
    p_kind:"feedback",
    p_post_id:null,
    p_reason:"suggestion",
    p_message:"Please improve keyboard navigation.",
  });
  assert.equal(result.body.reference,reference);
});

test("creates a post report only with a valid post ID and server-derived submitter",async()=>{
  const deps=dependencies();

  const result=await submitReportRequest(feedbackRequest({kind:"report",postId:attackerId,reason:"privacy"}),deps);

  assert.equal(result.status,200);
  assert.deepEqual(deps.inserted,{
    p_submitter_id:userId,
    p_kind:"report",
    p_post_id:attackerId,
    p_reason:"privacy",
    p_message:"Please improve keyboard navigation.",
  });
});

test("rejects a report without a valid post ID before authentication or CAPTCHA",async()=>{
  const deps=dependencies();

  const result=await submitReportRequest(feedbackRequest({kind:"report",postId:null,reason:"privacy"}),deps);

  assert.equal(result.status,400);
  assert.deepEqual(result.body,{error:"invalid_request"});
  assert.deepEqual(deps.calls,[]);
  assert.equal(deps.inserted,null);
});

test("returns a Telegram draft with only the public site and reference, never the feedback text",async()=>{
  const deps=dependencies();

  const result=await submitReportRequest(feedbackRequest(),deps);
  const draftUrl=new URL(result.body.telegramUrl);

  assert.equal(result.status,200);
  assert.equal(draftUrl.origin,"https://t.me");
  assert.equal(draftUrl.searchParams.get("url"),"https://mmwr.example.my/");
  assert.match(draftUrl.searchParams.get("text"),new RegExp(reference));
  assert.doesNotMatch(draftUrl.searchParams.get("text"),/keyboard navigation/i);
  assert.equal(result.body.telegramText.includes("keyboard navigation"),false);
});

test("maps the rolling-hour database limit to HTTP 429",async()=>{
  const deps=dependencies({createReport:async()=>({data:null,error:{code:"P0001",message:"report_rate_limited"}})});

  const result=await submitReportRequest(feedbackRequest(),deps);

  assert.equal(result.status,429);
  assert.deepEqual(result.body,{error:"rate_limited"});
});

test("fails closed when authentication is unavailable without invoking CAPTCHA or report creation",async()=>{
  const deps=dependencies({authenticate:async()=>{throw new Error("private auth provider detail");}});

  const result=await submitReportRequest(feedbackRequest(),deps);

  assert.equal(result.status,503);
  assert.deepEqual(result.body,{error:"submission_unavailable"});
  assert.deepEqual(deps.calls,[]);
  assert.equal(deps.inserted,null);
});

test("hides report writer errors and does not expose provider details",async()=>{
  const deps=dependencies({createReport:async()=>{throw new Error("private database detail");}});

  const result=await submitReportRequest(feedbackRequest(),deps);

  assert.equal(result.status,503);
  assert.deepEqual(result.body,{error:"submission_unavailable"});
  assert.equal(JSON.stringify(result.body).includes("private database detail"),false);
});

test("fails closed before captcha or writing when the trusted site URL is absent",async()=>{
  const deps=dependencies({siteUrl:""});

  const result=await submitReportRequest(feedbackRequest(),deps);

  assert.equal(result.status,503);
  assert.deepEqual(result.body,{error:"captcha_unavailable"});
  assert.deepEqual(deps.calls,["authenticate"]);
  assert.equal(deps.inserted,null);
});
