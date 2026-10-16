import "server-only";

import {timingSafeEqual} from "node:crypto";

const MIN_TOKEN_BYTES=32;

export function isCriticalSecurityEmailEnabled(){
  const token=process.env.CRITICAL_SECURITY_EMAIL_TOKEN;
  const port=Number(process.env.SMTP_PORT);
  return process.env.CRITICAL_SECURITY_EMAIL_ENABLED==="true"
    && typeof token==="string"
    && Buffer.byteLength(token,"utf8")>=MIN_TOKEN_BYTES
    && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY)
    && Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD&&process.env.SMTP_FROM)
    && Number.isInteger(port)&&port>=1&&port<=65535;
}

export function isCriticalSecurityEmailRequest(request:Request){
  const expected=process.env.CRITICAL_SECURITY_EMAIL_TOKEN;
  const authorization=request.headers.get("authorization");
  if(!isCriticalSecurityEmailEnabled()||!expected||!authorization?.startsWith("Bearer "))return false;
  const supplied=Buffer.from(authorization.slice(7),"utf8");
  const configured=Buffer.from(expected,"utf8");
  return supplied.length===configured.length&&timingSafeEqual(supplied,configured);
}
