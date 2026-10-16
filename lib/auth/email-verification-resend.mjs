const action="mmwr_email_verification_resend";

/**
 * @param {string} token
 * @param {import("./email-verification-resend.d.mts").ResendVerificationDependencies} dependencies
 */
export async function resendVerificationEmail(token,dependencies){
  let captcha;
  try{
    captcha=await dependencies.verifyTurnstile(token,action);
  }catch{
    return {key:"captchaUnavailable"};
  }
  if(captcha==="invalid")return {key:"captchaInvalid"};
  if(captcha!=="valid")return {key:"captchaUnavailable"};

  try{
    const account=await dependencies.authenticate();
    if(!account?.user?.id||!account.user.email)return {key:"signInFirst"};
    if(!account.profile||account.profile.accountState!=="active")return {key:"serviceUnavailable"};
    if(account.profile.verifiedAt)return {key:"emailAlreadyVerified",ok:true};

    const sent=await dependencies.issueAndSend(account.user.id,account.user.email);
    return sent?{key:"verificationSent",ok:true}:{key:"verificationRateLimited"};
  }catch{
    return {key:"emailSendUnavailable"};
  }
}
