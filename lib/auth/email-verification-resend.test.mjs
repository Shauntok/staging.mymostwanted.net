import assert from "node:assert/strict";
import {test} from "node:test";
import {resendVerificationEmail} from "./email-verification-resend.mjs";

const user={id:"8c4c6134-62a2-4e0a-a40a-e0df72c5ba32",email:"member@example.invalid"};
const activeProfile={accountState:"active",verifiedAt:null};

function dependencies(overrides={}){
  const calls=[];
  return {
    calls,
    verifyTurnstile:async(token,action)=>{calls.push(["captcha",token,action]);return "valid";},
    authenticate:async()=>{calls.push("authenticate");return {user,profile:activeProfile};},
    issueAndSend:async(userId,email)=>{calls.push(["send",userId,email]);return true;},
    ...overrides,
  };
}

test("fails closed on invalid or unavailable Turnstile before reading the account",async(t)=>{
  for(const [captcha,key] of [["invalid","captchaInvalid"],["unavailable","captchaUnavailable"]]){
    await t.test(captcha,async()=>{
      const deps=dependencies({verifyTurnstile:async(token,action)=>{deps.calls.push(["captcha",token,action]);return captcha;}});

      const result=await resendVerificationEmail("one-time-token",deps);

      assert.deepEqual(result,{key});
      assert.deepEqual(deps.calls,[["captcha","one-time-token","mmwr_email_verification_resend"]]);
    });
  }
  await t.test("provider throw",async()=>{
    const deps=dependencies({verifyTurnstile:async()=>{throw new Error("private Siteverify detail");}});
    const result=await resendVerificationEmail("one-time-token",deps);
    assert.deepEqual(result,{key:"captchaUnavailable"});
    assert.deepEqual(deps.calls,[]);
  });
});

test("does not inspect profiles or send when no authenticated user email exists",async(t)=>{
  for(const currentUser of [null,{id:user.id,email:null}]){
    await t.test(currentUser?"user without email":"no user",async()=>{
      const deps=dependencies({authenticate:async()=>{deps.calls.push("authenticate");return {user:currentUser,profile:null};}});

      const result=await resendVerificationEmail("one-time-token",deps);

      assert.deepEqual(result,{key:"signInFirst"});
      assert.deepEqual(deps.calls,[["captcha","one-time-token","mmwr_email_verification_resend"],"authenticate"]);
    });
  }
});

test("requires an active profile before issuing a verification token",async(t)=>{
  for(const profile of [null,{accountState:"suspended",verifiedAt:null}]){
    await t.test(profile?.accountState??"missing profile",async()=>{
      const deps=dependencies({authenticate:async()=>{deps.calls.push("authenticate");return {user,profile};}});

      const result=await resendVerificationEmail("one-time-token",deps);

      assert.deepEqual(result,{key:"serviceUnavailable"});
      assert.deepEqual(deps.calls,[["captcha","one-time-token","mmwr_email_verification_resend"],"authenticate"]);
    });
  }
});

test("does not issue another token for an already verified account",async()=>{
  const deps=dependencies({authenticate:async()=>{deps.calls.push("authenticate");return {user,profile:{...activeProfile,verifiedAt:"2026-01-01T00:00:00Z"}};}});

  const result=await resendVerificationEmail("one-time-token",deps);

  assert.deepEqual(result,{key:"emailAlreadyVerified",ok:true});
  assert.deepEqual(deps.calls,[["captcha","one-time-token","mmwr_email_verification_resend"],"authenticate"]);
});

test("sends only to the current authenticated user's email after CAPTCHA and profile checks",async()=>{
  const deps=dependencies();

  const result=await resendVerificationEmail("one-time-token",deps);

  assert.deepEqual(result,{key:"verificationSent",ok:true});
  assert.deepEqual(deps.calls,[
    ["captcha","one-time-token","mmwr_email_verification_resend"],
    "authenticate",
    ["send",user.id,user.email],
  ]);
});

test("maps token-creation limits and hides authentication or mail-provider errors",async(t)=>{
  await t.test("hourly limit",async()=>{
    const deps=dependencies({issueAndSend:async()=>false});
    const result=await resendVerificationEmail("one-time-token",deps);
    assert.deepEqual(result,{key:"verificationRateLimited"});
  });
  await t.test("authentication failure",async()=>{
    const deps=dependencies({authenticate:async()=>{throw new Error("private profile database detail");}});
    const result=await resendVerificationEmail("one-time-token",deps);
    assert.deepEqual(result,{key:"emailSendUnavailable"});
    assert.equal(JSON.stringify(result).includes("private profile database detail"),false);
  });
  await t.test("provider error is minimized",async()=>{
    const deps=dependencies({issueAndSend:async()=>{throw new Error("private SMTP provider detail");}});
    const result=await resendVerificationEmail("one-time-token",deps);
    assert.deepEqual(result,{key:"emailSendUnavailable"});
    assert.equal(JSON.stringify(result).includes("private SMTP provider detail"),false);
  });
});
