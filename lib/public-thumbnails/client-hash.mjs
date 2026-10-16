import {createHmac} from "node:crypto";
import {isIP} from "node:net";

const trustedHeaders=new Set(["x-vercel-forwarded-for","cf-connecting-ip","x-mmwr-client-ip"]);

export function getPublicThumbnailClientHash(headers,{
  secret=process.env.SEARCH_RATE_LIMIT_HMAC_SECRET,
  trustedHeader=process.env.SEARCH_TRUSTED_CLIENT_IP_HEADER,
}={}){
  const header=trustedHeader?.trim().toLowerCase();
  if(!header||!trustedHeaders.has(header)||!secret||Buffer.byteLength(secret,"utf8")<32)return null;
  const address=headers.get(header)?.split(",",1)[0]?.trim();
  if(!address||isIP(address)===0)return null;
  return createHmac("sha256",secret)
    .update("mmwr:public-thumbnail-rate-limit:")
    .update(address)
    .digest("hex");
}
