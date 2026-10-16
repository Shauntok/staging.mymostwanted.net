import {createHmac,timingSafeEqual} from "node:crypto";

export const ANALYTICS_CONSENT_COOKIE="mmwr_analytics_consent";
const maxAgeSeconds=31536000;

function getSecret(){
  const secret=process.env.ANALYTICS_VALID_READ_HMAC_SECRET;
  return secret&&Buffer.byteLength(secret,"utf8")>=32?secret:null;
}

export function createAnalyticsConsentAttestation(nowSeconds=Math.floor(Date.now()/1000)){
  const secret=getSecret();
  if(!secret)return null;
  const expiresAt=nowSeconds+maxAgeSeconds;
  const payload=`v1.${expiresAt}`;
  const signature=createHmac("sha256",secret).update("mmwr:analytics-consent:").update(payload).digest("base64url");
  return {value:`${payload}.${signature}`,maxAge:maxAgeSeconds};
}

export function hasValidAnalyticsConsentAttestation(cookieHeader:string|null,nowSeconds=Math.floor(Date.now()/1000)){
  const value=cookieHeader?.split(";").map(part=>part.trim()).find(part=>part.startsWith(`${ANALYTICS_CONSENT_COOKIE}=`))?.slice(ANALYTICS_CONSENT_COOKIE.length+1);
  if(!value)return false;
  const [version,expiresText,provided,...extra]=value.split(".");
  const expiresAt=Number(expiresText);
  const secret=getSecret();
  if(version!=="v1"||extra.length!==0||!provided||!Number.isSafeInteger(expiresAt)||expiresAt<=nowSeconds||expiresAt>nowSeconds+maxAgeSeconds+60||!secret)return false;
  const expected=createHmac("sha256",secret).update("mmwr:analytics-consent:").update(`${version}.${expiresText}`).digest();
  let actual:Buffer;
  try{actual=Buffer.from(provided,"base64url");}catch{return false;}
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

export function hasValidPageViewConsent(cookieHeader:string|null,nowSeconds=Math.floor(Date.now()/1000)){
  if(!hasValidAnalyticsConsentAttestation(cookieHeader,nowSeconds))return false;
  const preferences=cookieHeader?.split(";").map(part=>part.trim()).filter(part=>part.startsWith("mmwr_consent="))??[];
  if(preferences.length!==1)return false;
  try{
    const value=decodeURIComponent(preferences[0].slice("mmwr_consent=".length));
    const parsed=JSON.parse(value) as unknown;
    return Boolean(parsed&&typeof parsed==="object"&&(parsed as {analytics?:unknown}).analytics===true);
  }catch{return false;}
}
