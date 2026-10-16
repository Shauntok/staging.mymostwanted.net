function normalizedSiteKey(turnstileSiteKey){
  return typeof turnstileSiteKey==="string"?turnstileSiteKey.trim()||null:null;
}

export function verificationAuthFormProps(turnstileSiteKey){
  return {
    mode:"verify",
    turnstileSiteKey:normalizedSiteKey(turnstileSiteKey),
  };
}

export function accountAuthFormProps({accountState,passwordUpdated,staffSessionExpired,redirectTo,turnstileSiteKey}){
  const siteKey=normalizedSiteKey(turnstileSiteKey);
  if(accountState?.kind==="profile"){
    return {
      mode:"resend",
      signedIn:true,
      verified:Boolean(accountState.verified),
      staffSessionExpired:Boolean(staffSessionExpired),
      turnstileSiteKey:siteKey,
    };
  }
  return {
    mode:"signin",
    passwordUpdated:Boolean(passwordUpdated),
    staffSessionExpired:Boolean(staffSessionExpired),
    redirectTo:typeof redirectTo==="string"?redirectTo:"/",
    turnstileSiteKey:siteKey,
  };
}
