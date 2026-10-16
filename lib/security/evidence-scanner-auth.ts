import "server-only";

import {timingSafeEqual} from "node:crypto";

const MIN_SCANNER_TOKEN_BYTES=32;
export const evidenceScannerResponseHeaders={
  "Cache-Control":"no-store, private",
  "X-Content-Type-Options":"nosniff",
  "X-Robots-Tag":"noindex, nofollow, noarchive",
};

export function isEvidenceScannerEnabled(){
  const token=process.env.EVIDENCE_SCANNER_TOKEN;
  return process.env.EVIDENCE_SCANNER_ENABLED==="true"
    && typeof token==="string"
    && Buffer.byteLength(token,"utf8")>=MIN_SCANNER_TOKEN_BYTES;
}

export function isEvidenceScannerRequest(request:Request){
  const expected=process.env.EVIDENCE_SCANNER_TOKEN;
  const authorization=request.headers.get("authorization");
  if(!isEvidenceScannerEnabled()||!expected||!authorization?.startsWith("Bearer "))return false;
  const supplied=Buffer.from(authorization.slice(7),"utf8");
  const configured=Buffer.from(expected,"utf8");
  return supplied.length===configured.length&&timingSafeEqual(supplied,configured);
}

export function scannerDisabledResponse(){
  return Response.json({error:"Scanner unavailable."},{status:503,headers:evidenceScannerResponseHeaders});
}

export function scannerUnauthorizedResponse(){
  return Response.json({error:"Unauthorized."},{status:401,headers:evidenceScannerResponseHeaders});
}
