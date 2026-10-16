import assert from "node:assert/strict";
import {test} from "node:test";

const {accountAuthFormProps,verificationAuthFormProps}=await import("./account-auth-form-props.mjs").catch(()=>({}));

test("passes the configured CAPTCHA site key to signed-in email-resend forms",()=>{
  assert.equal(typeof accountAuthFormProps,"function");
  assert.deepEqual(accountAuthFormProps({
    accountState:{kind:"profile",verified:false},
    passwordUpdated:false,
    staffSessionExpired:false,
    redirectTo:"/",
    turnstileSiteKey:" site-key ",
  }),{
    mode:"resend",
    signedIn:true,
    verified:false,
    staffSessionExpired:false,
    turnstileSiteKey:"site-key",
  });
});

test("keeps password recovery, banned-account and anonymous sign-in forms on the login route",()=>{
  assert.equal(typeof accountAuthFormProps,"function");
  for(const accountState of [null,{kind:"banned"}]){
    assert.deepEqual(accountAuthFormProps({
      accountState,
      passwordUpdated:true,
      staffSessionExpired:true,
      redirectTo:"/posts/00000000-0000-4000-8000-000000000001",
      turnstileSiteKey:"site-key",
    }),{
      mode:"signin",
      passwordUpdated:true,
      staffSessionExpired:true,
      redirectTo:"/posts/00000000-0000-4000-8000-000000000001",
      turnstileSiteKey:"site-key",
    });
  }
});

test("passes the configured CAPTCHA site key to the email-verification page resend form",()=>{
  assert.equal(typeof verificationAuthFormProps,"function");
  assert.deepEqual(verificationAuthFormProps(" verify-site-key "),{
    mode:"verify",
    turnstileSiteKey:"verify-site-key",
  });
  assert.deepEqual(verificationAuthFormProps("  "),{
    mode:"verify",
    turnstileSiteKey:null,
  });
});
