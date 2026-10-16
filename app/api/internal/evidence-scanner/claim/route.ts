import {createSupabaseServiceClient} from "@/lib/supabase/service";
import {evidenceScannerResponseHeaders,isEvidenceScannerEnabled,isEvidenceScannerRequest,scannerDisabledResponse,scannerUnauthorizedResponse} from "@/lib/security/evidence-scanner-auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:Request){
  if(!isEvidenceScannerEnabled())return scannerDisabledResponse();
  if(!isEvidenceScannerRequest(request))return scannerUnauthorizedResponse();

  try{
    const supabase=createSupabaseServiceClient();
    const {data,error}=await supabase.rpc("mmwr_claim_evidence_scan_job");
    if(error)throw error;
    const job=Array.isArray(data)?data[0]:null;
    if(!job)return Response.json({job:null},{headers:evidenceScannerResponseHeaders});
    if(typeof job.object_path!=="string"||typeof job.job_id!=="string"||typeof job.lease_token!=="string"){
      return Response.json({error:"Scanner unavailable."},{status:503,headers:evidenceScannerResponseHeaders});
    }

    const {data:signed,error:signedError}=await supabase.storage
      .from("mmwr-evidence-quarantine")
      .createSignedUrl(job.object_path,120);
    if(signedError||!signed?.signedUrl){
      await supabase.rpc("mmwr_finish_evidence_scan_job",{
        p_job_id:job.job_id,p_lease_token:job.lease_token,p_outcome:"error",p_reason_code:"storage_unavailable",
        p_sha256:null,p_engine_version:null,p_signature_version:null,
      });
      return Response.json({error:"Scanner unavailable."},{status:503,headers:evidenceScannerResponseHeaders});
    }

    let publicThumbnailEligible=false;
    if(process.env.MMWR_PUBLIC_THUMBNAILS_ENABLED==="true"
      &&job.mime_type&&["image/jpeg","image/png","image/webp"].includes(job.mime_type)){
      const {data:target,error:thumbnailError}=await supabase.rpc("mmwr_get_scanner_thumbnail_target",{
        p_job_id:job.job_id,p_lease_token:job.lease_token,
      });
      publicThumbnailEligible=!thumbnailError&&typeof target==="string"&&target.length>0;
    }

    return Response.json({job:{
      id:job.job_id,evidenceId:job.evidence_id,leaseToken:job.lease_token,mimeType:job.mime_type,
      signedUrl:signed.signedUrl,expiresInSeconds:120,publicThumbnailEligible,
    }},{headers:evidenceScannerResponseHeaders});
  }catch{
    return Response.json({error:"Scanner unavailable."},{status:503,headers:evidenceScannerResponseHeaders});
  }
}
