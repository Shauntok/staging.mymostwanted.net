import {createSupabaseServiceClient} from "@/lib/supabase/service";
import {evidenceScannerResponseHeaders,isEvidenceScannerEnabled,isEvidenceScannerRequest,scannerDisabledResponse,scannerUnauthorizedResponse} from "@/lib/security/evidence-scanner-auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const outcomes=new Set(["clean","infected","unsupported","error"]);
const reasonCodes=new Set([
  "scan_clean","malware_detected","unsupported_file_type","invalid_file_signature",
  "storage_unavailable","scanner_unavailable","scanner_error","retry_limit_reached",
]);
const sha256Pattern=/^[0-9a-f]{64}$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const expectedFields=["jobId","leaseToken","outcome","reasonCode","sha256","engineVersion","signatureVersion"];

function hasValidOutcomeReason(outcome:unknown,reasonCode:unknown,sha256:unknown){
  if(outcome==="clean")return reasonCode==="scan_clean"&&typeof sha256==="string"&&sha256Pattern.test(sha256);
  if(outcome==="infected")return reasonCode==="malware_detected"&&typeof sha256==="string"&&sha256Pattern.test(sha256);
  if(outcome==="unsupported")return reasonCode==="unsupported_file_type"||reasonCode==="invalid_file_signature";
  if(outcome==="error")return reasonCode==="storage_unavailable"||reasonCode==="scanner_unavailable"||reasonCode==="scanner_error"||reasonCode==="retry_limit_reached";
  return false;
}

export async function POST(request:Request){
  if(!isEvidenceScannerEnabled())return scannerDisabledResponse();
  if(!isEvidenceScannerRequest(request))return scannerUnauthorizedResponse();
  try{
    if(request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json"){
      return Response.json({error:"Invalid result."},{status:415,headers:evidenceScannerResponseHeaders});
    }
    const declaredLength=Number(request.headers.get("content-length")??"0");
    if(Number.isFinite(declaredLength)&&declaredLength>4096)return Response.json({error:"Invalid result."},{status:413,headers:evidenceScannerResponseHeaders});
    const reader=request.body?.getReader();
    if(!reader)return Response.json({error:"Invalid result."},{status:400,headers:evidenceScannerResponseHeaders});
    const chunks:Uint8Array[]=[];
    let bodyLength=0;
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      bodyLength+=value.byteLength;
      if(bodyLength>4096){await reader.cancel();return Response.json({error:"Invalid result."},{status:413,headers:evidenceScannerResponseHeaders});}
      chunks.push(value);
    }
    if(bodyLength<1)return Response.json({error:"Invalid result."},{status:400,headers:evidenceScannerResponseHeaders});
    const rawBody=new TextDecoder().decode(Buffer.concat(chunks.map(chunk=>Buffer.from(chunk))));
    let parsed:unknown;
    try{parsed=JSON.parse(rawBody) as unknown;}catch{return Response.json({error:"Invalid result."},{status:400,headers:evidenceScannerResponseHeaders});}
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return Response.json({error:"Invalid result."},{status:400,headers:evidenceScannerResponseHeaders});
    const body=parsed as Record<string,unknown>;
    const fields=[body.jobId,body.leaseToken,body.outcome,body.reasonCode];
    if(Object.keys(body).length!==expectedFields.length||expectedFields.some(field=>!Object.hasOwn(body,field))
      ||fields.some(value=>typeof value!=="string"||value.length<1||value.length>100)
      ||!uuidPattern.test(body.jobId as string)||!uuidPattern.test(body.leaseToken as string)
      ||!outcomes.has(body.outcome as string)||!reasonCodes.has(body.reasonCode as string)
      ||(body.sha256!==null&&(typeof body.sha256!=="string"||!sha256Pattern.test(body.sha256)))
      ||(body.engineVersion!==null&&(typeof body.engineVersion!=="string"||body.engineVersion.length<1||body.engineVersion.length>100))
      ||(body.signatureVersion!==null&&(typeof body.signatureVersion!=="string"||body.signatureVersion.length<1||body.signatureVersion.length>100))
      ||!hasValidOutcomeReason(body.outcome,body.reasonCode,body.sha256)){
      return Response.json({error:"Invalid result."},{status:400,headers:evidenceScannerResponseHeaders});
    }

    const supabase=createSupabaseServiceClient();
    const {data,error}=await supabase.rpc("mmwr_finish_evidence_scan_job",{
      p_job_id:body.jobId,p_lease_token:body.leaseToken,p_outcome:body.outcome,p_reason_code:body.reasonCode,
      p_sha256:body.sha256??null,p_engine_version:body.engineVersion??null,p_signature_version:body.signatureVersion??null,
    });
    if(error)throw error;
    if(data!==true)return Response.json({accepted:false},{status:409,headers:evidenceScannerResponseHeaders});
    return Response.json({accepted:true},{headers:evidenceScannerResponseHeaders});
  }catch{
    return Response.json({error:"Scanner unavailable."},{status:503,headers:evidenceScannerResponseHeaders});
  }
}
