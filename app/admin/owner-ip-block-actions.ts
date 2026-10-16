"use server";

import {headers} from "next/headers";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {canonicalizeIpAddress,createOwnerIpBlockNonSelfProof,getOwnerIpBlockConfig,getOwnerIpBlockFingerprint,getTrustedClientIpAddress} from "@/lib/security/owner-ip-blocks";
import type {TrustedClientIpHeader} from "@/lib/security/owner-ip-blocks";

type IpBlockRow={block_id:string;fingerprint_suffix:string;reason:string;actor_username:string|null;created_at:string;expires_at:string};
type IpBlockAuditRow={event_id:number;block_id:string;action:"created"|"lifted"|"expired";reason:string;actor_username:string|null;occurred_at:string;expires_at:string};

async function getOwnerClient(trustedPostgrestAddress?:{header:TrustedClientIpHeader;address:string}){
  const supabase=await createSupabaseServerClient({trustedPostgrestAddress});
  const {data:claims,error:claimsError}=await supabase.auth.getClaims();
  const amr=claims?.claims?.amr;
  const actorId=typeof claims?.claims?.sub==="string"?claims.claims.sub.toLowerCase():"";
  const hasTotp=Array.isArray(amr)&&amr.some(entry=>typeof entry==="object"&&entry!==null&&"method" in entry&&(entry.method==="totp"||entry.method==="mfa/totp"));
  if(claimsError||claims?.claims?.aal!=="aal2"||!hasTotp||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(actorId))throw new Error("Owner MFA required");
  const {data:owner,error}=await supabase.rpc("has_staff_role",{p_role:"owner"});
  if(error||owner!==true)throw new Error("Owner access required");
  return {supabase,actorId};
}

export async function listOwnerIpBlocks(){
  try{
    const {supabase}=await getOwnerClient();
    const [{data:active,error:activeError},{data:audit,error:auditError}]=await Promise.all([
      supabase.rpc("owner_list_ip_blocks"),
      supabase.rpc("owner_list_ip_block_audit",{p_limit:50}),
    ]);
    if(activeError||auditError||!Array.isArray(active)||!Array.isArray(audit))return {ok:false as const,rows:[] as IpBlockRow[],audit:[] as IpBlockAuditRow[]};
    return {ok:true as const,rows:active as IpBlockRow[],audit:audit as IpBlockAuditRow[]};
  }catch{return {ok:false as const,rows:[] as IpBlockRow[],audit:[] as IpBlockAuditRow[]};}
}

export async function addOwnerIpBlock(input:{address:string;expiresAt:string;reason:string}){
  try{
    const config=getOwnerIpBlockConfig();
    const canonical=canonicalizeIpAddress(input.address);
    const expiresAt=new Date(input.expiresAt);
    const reason=input.reason.trim();
    if(!canonical)return {ok:false as const,invalidAddress:true as const};
    if(!config.configured||!Number.isFinite(expiresAt.getTime())||expiresAt.getTime()<=Date.now()||reason.length<1||reason.length>500)return {ok:false as const};
    const fingerprint=getOwnerIpBlockFingerprint(canonical);
    if(!fingerprint)return {ok:false as const};
    const requestHeaders=await headers();
    const currentAddress=getTrustedClientIpAddress(requestHeaders);
    if(!currentAddress||!config.header)return {ok:false as const,sourceUnavailable:true as const};
    const currentFingerprint=getOwnerIpBlockFingerprint(currentAddress);
    if(!currentFingerprint)return {ok:false as const,sourceUnavailable:true as const};
    if(currentFingerprint===fingerprint)return {ok:false as const,selfBlock:true as const};
    const {supabase,actorId}=await getOwnerClient({header:config.header,address:currentAddress});
    const nonSelfProof=createOwnerIpBlockNonSelfProof({actorId,fingerprint,reason,expiresAtMs:expiresAt.getTime()});
    if(!nonSelfProof)return {ok:false as const};
    const {data,error}=await supabase.rpc("owner_add_ip_block",{p_fingerprint:fingerprint,p_reason:reason,p_expires_at:expiresAt.toISOString(),p_non_self_proof:nonSelfProof.signature,p_proof_issued_at:nonSelfProof.issuedAt});
    if(error||typeof data!=="string"||!data)return {ok:false as const};
    return {ok:true as const,blockId:data};
  }catch{return {ok:false as const};}
}

export async function liftOwnerIpBlock(input:{blockId:string;reason:string}){
  try{
    const reason=input.reason.trim();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.blockId)||reason.length<1||reason.length>500)return {ok:false as const};
    const {supabase}=await getOwnerClient();
    const {data,error}=await supabase.rpc("owner_lift_ip_block",{p_block_id:input.blockId,p_reason:reason});
    if(error||data!==true)return {ok:false as const};
    return {ok:true as const};
  }catch{return {ok:false as const};}
}
