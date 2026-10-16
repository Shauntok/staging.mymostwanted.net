"use server";

import {createSupabaseServerClient} from "@/lib/supabase/server";
import {createSupabaseServiceClient} from "@/lib/supabase/service";

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidPatternLoose=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const evidencePathPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf|mp3|m4a|wav|doc|docx)$/i;
const evidenceMimeByExtension:Record<string,string[]>={
  jpg:["image/jpeg"],jpeg:["image/jpeg"],png:["image/png"],webp:["image/webp"],pdf:["application/pdf"],
  mp3:["audio/mpeg"],m4a:["audio/mp4"],wav:["audio/wav","audio/x-wav"],doc:["application/msword"],
  docx:["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
};

export type StaffEvidenceItem={id:string;mimeType:string;createdAt:string};
export type StaffEvidenceListing={ok:boolean;enabled:boolean;items:StaffEvidenceItem[]};

function previewEnabled(){return process.env.STAFF_EVIDENCE_PREVIEW_ENABLED==="true";}

async function getAuthenticatedStaffClient(){
  const supabase=await createSupabaseServerClient();
  const {data,error}=await supabase.auth.getClaims();
  const amr=data?.claims?.amr;
  const hasTotp=Array.isArray(amr)&&amr.some(entry=>typeof entry==="object"&&entry!==null&&"method" in entry&&(entry.method==="totp"||entry.method==="mfa/totp"));
  if(error||data?.claims?.aal!=="aal2"||!hasTotp)return null;
  return supabase;
}

export async function getStaffSubmissionEvidence(submissionId:string):Promise<StaffEvidenceListing>{
  if(!previewEnabled())return {ok:true,enabled:false,items:[]};
  if(typeof submissionId!=="string"||!uuidPatternLoose.test(submissionId))return {ok:false,enabled:false,items:[]};
  try{
    const supabase=await getAuthenticatedStaffClient();
    if(!supabase)return {ok:false,enabled:false,items:[]};
    const {data,error}=await supabase.rpc("list_staff_submission_evidence",{p_submission_id:submissionId});
    if(error||typeof data!=="object"||data===null)return {ok:false,enabled:false,items:[]};
    const result=data as {enabled?:unknown;items?:unknown};
    if(typeof result.enabled!=="boolean"||!Array.isArray(result.items))return {ok:false,enabled:false,items:[]};
    const items:StaffEvidenceItem[]=result.items.flatMap((entry:unknown)=>{
      if(typeof entry!=="object"||entry===null)return [];
      const item=entry as Record<string,unknown>;
      if(typeof item.id!=="string"||!uuidPattern.test(item.id)||typeof item.mime_type!=="string"||item.mime_type.length>100||typeof item.created_at!=="string"||!Number.isFinite(Date.parse(item.created_at)))return [];
      return [{id:item.id,mimeType:item.mime_type,createdAt:item.created_at}];
    }).slice(0,5);
    return {ok:true,enabled:result.enabled,items};
  }catch{return {ok:false,enabled:false,items:[]};}
}

export async function createStaffEvidencePreviewUrl(evidenceId:string):Promise<{ok:boolean;url?:string}>{
  if(!previewEnabled()||typeof evidenceId!=="string"||!uuidPattern.test(evidenceId))return {ok:false};
  try{
    const staffClient=await getAuthenticatedStaffClient();
    if(!staffClient)return {ok:false};
    const {data:grant,error:grantError}=await staffClient.rpc("issue_staff_evidence_access_grant",{p_evidence_id:evidenceId});
    if(grantError||typeof grant!=="string"||!/^[0-9a-f]{64}$/.test(grant))return {ok:false};

    const serviceClient=createSupabaseServiceClient();
    const {data:objects,error:consumeError}=await serviceClient.rpc("consume_staff_evidence_access_grant",{p_token:grant});
    if(consumeError||!Array.isArray(objects)||objects.length!==1)return {ok:false};
    const object=objects[0] as {object_path?:unknown;mime_type?:unknown};
    if(typeof object.object_path!=="string"||object.object_path.length>160||!evidencePathPattern.test(object.object_path)||typeof object.mime_type!=="string")return {ok:false};
    const extension=object.object_path.slice(object.object_path.lastIndexOf(".")+1).toLowerCase();
    if(!evidenceMimeByExtension[extension]?.includes(object.mime_type.toLowerCase()))return {ok:false};
    const {data:signed,error:signedError}=await serviceClient.storage.from("mmwr-evidence-quarantine").createSignedUrl(object.object_path,60);
    if(signedError||!signed?.signedUrl)return {ok:false};
    return {ok:true,url:signed.signedUrl};
  }catch{return {ok:false};}
}
