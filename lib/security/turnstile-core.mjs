/** @typedef {"valid"|"invalid"|"unavailable"} TurnstileVerification */

/**
 * Verify a Turnstile token without exposing the provider secret to the client.
 * @param {string} token
 * @param {string} expectedAction
 * @returns {Promise<TurnstileVerification>}
 */
export async function verifyTurnstile(token,expectedAction){
  const secret=process.env.TURNSTILE_SECRET_KEY;
  const configuredSite=process.env.NEXT_PUBLIC_SITE_URL;
  if(!secret||!configuredSite)return "unavailable";
  if(token.length<1||token.length>2048)return "invalid";

  let expectedHostname;
  try{
    const site=new URL(configuredSite);
    if((site.protocol!=="https:"&&!(site.protocol==="http:"&&site.hostname==="localhost"))||site.username||site.password)return "unavailable";
    expectedHostname=site.hostname.toLowerCase();
  }catch{return "unavailable";}

  let response;
  try{
    response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{
      method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({secret,response:token,idempotency_key:crypto.randomUUID()}),
      cache:"no-store",signal:AbortSignal.timeout(8000),
    });
  }catch{return "unavailable";}
  if(!response.ok)return "unavailable";

  let result;
  try{result=await response.json();}catch{return "unavailable";}
  if(!result||typeof result!=="object")return "unavailable";
  const validation=result;
  if(validation.success!==true||typeof validation.hostname!=="string"||validation.hostname.toLowerCase()!==expectedHostname||validation.action!==expectedAction)return "invalid";
  return "valid";
}
