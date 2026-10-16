import "server-only";

import {createHash,createHmac} from "node:crypto";
import {isIP} from "node:net";

export type TrustedClientIpHeader="x-vercel-forwarded-for"|"cf-connecting-ip"|"x-mmwr-client-ip";

function getSupportedHeader(value:string):TrustedClientIpHeader|null{
  if(value==="x-vercel-forwarded-for"||value==="cf-connecting-ip"||value==="x-mmwr-client-ip")return value;
  return null;
}

export function getOwnerIpBlockConfig(){
  const secret=process.env.MMWR_IP_BLOCK_HMAC_SECRET??"";
  const header=getSupportedHeader(process.env.MMWR_IP_BLOCK_TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase()??"");
  return {
    enabled:process.env.MMWR_IP_BLOCK_ENABLED==="true",
    // This checks that required settings are present; it cannot prove that the
    // configured ingress overwrites the header or prevents origin bypass.
    configured:Buffer.byteLength(secret,"utf8")>=32&&Boolean(header)&&Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY),
    header,
  };
}

export function canonicalizeIpAddress(value:string):string|null{
  const address=value.trim();
  if(isIP(address)===4){
    const octets=address.split(".").map(Number);
    if(octets.some(octet=>!Number.isInteger(octet)||octet<0||octet>255))return null;
    return octets.join(".");
  }
  if(isIP(address)!==6)return null;
  try{
    const hostname=new URL(`http://[${address}]/`).hostname;
    const canonical=hostname.slice(1,-1).toLowerCase();
    // WHATWG URL serialization writes embedded IPv4 tails as hex words, but
    // PostgreSQL inet/host prints mapped and compatible IPv4 forms in dotted
    // decimal. Convert those forms to PostgreSQL's canonical spelling before
    // using the address as HMAC input.
    const halves=canonical.split("::");
    const left=halves[0]?halves[0].split(":"):[];
    const right=halves.length===2&&halves[1]?halves[1].split(":"):[];
    const words=halves.length===1
      ?left.map(word=>Number.parseInt(word,16))
      :[...left,...Array(8-left.length-right.length).fill("0"),...right].map(word=>Number.parseInt(word,16));
    const firstFiveZero=words.slice(0,5).every(word=>word===0);
    const firstSixZero=words.slice(0,6).every(word=>word===0);
    const ipv4=`${words[6]>>8}.${words[6]&255}.${words[7]>>8}.${words[7]&255}`;
    if(firstFiveZero&&words[5]===0xffff)return `::ffff:${ipv4}`;
    if(firstSixZero&&(words[6]!==0||words[7]!==0)&&(words[6]!==0||words[7]!==1))return `::${ipv4}`;
    return canonical;
  }catch{return null;}
}

export function getOwnerIpBlockFingerprint(address:string):string|null{
  const secret=process.env.MMWR_IP_BLOCK_HMAC_SECRET;
  const canonical=canonicalizeIpAddress(address);
  if(!secret||Buffer.byteLength(secret,"utf8")<32||!canonical)return null;
  return createHmac("sha256",secret).update("mmwr:owner-ip-block:v1:").update(canonical).digest("hex");
}

export function createOwnerIpBlockNonSelfProof(input:{actorId:string;fingerprint:string;reason:string;expiresAtMs:number}){
  const secret=process.env.MMWR_IP_BLOCK_HMAC_SECRET;
  const actorId=input.actorId.toLowerCase();
  const issuedAtMs=Date.now();
  if(!secret||Buffer.byteLength(secret,"utf8")<32
    ||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(actorId)
    ||!/^[0-9a-f]{64}$/.test(input.fingerprint)
    ||!Number.isSafeInteger(input.expiresAtMs)||input.expiresAtMs<=issuedAtMs
    ||input.reason.length<1||input.reason.length>500)return null;
  const reasonDigest=createHash("sha256").update(input.reason,"utf8").digest("hex");
  const payload=`mmwr:owner-ip-block:nonself:v1:${actorId}:${input.fingerprint}:${input.expiresAtMs}:${reasonDigest}:${issuedAtMs}`;
  const signature=createHmac("sha256",secret).update(payload,"utf8").digest("hex");
  return {issuedAt:new Date(issuedAtMs).toISOString(),signature};
}

export function getTrustedClientIpAddress(headers:Headers):string|null{
  const {header,configured}=getOwnerIpBlockConfig();
  if(!configured||!header)return null;
  const address=headers.get(header)?.trim();
  // The selected ingress header must contain exactly one host address. Never
  // guess which member of a caller-influenced proxy chain is authoritative.
  if(!address||address.includes(","))return null;
  return canonicalizeIpAddress(address);
}

export function getTrustedIpBlockFingerprint(headers:Headers):string|null{
  const address=getTrustedClientIpAddress(headers);
  return address?getOwnerIpBlockFingerprint(address):null;
}
