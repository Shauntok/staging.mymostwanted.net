import {createSupabaseServiceClient} from "@/lib/supabase/service";
import {evidenceScannerResponseHeaders,isEvidenceScannerEnabled,isEvidenceScannerRequest,scannerDisabledResponse,scannerUnauthorizedResponse} from "@/lib/security/evidence-scanner-auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const maxDerivativeBytes=512*1024;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const storagePathPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i;
const storageBucket="mmwr-public-thumbnail-derivatives";

function isWebp(bytes:Buffer){
  return bytes.length>=12&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
}

async function readBoundedBody(request:Request):Promise<Buffer|null>{
  const declaredLength=Number(request.headers.get("content-length")??"0");
  if(Number.isFinite(declaredLength)&&declaredLength>maxDerivativeBytes)return null;
  const reader=request.body?.getReader();
  if(!reader)return null;
  const chunks:Uint8Array[]=[];
  let total=0;
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    total+=value.byteLength;
    if(total>maxDerivativeBytes){await reader.cancel();return null;}
    chunks.push(value);
  }
  if(total===0)return null;
  return Buffer.concat(chunks.map(chunk=>Buffer.from(chunk)),total);
}

async function removeUploadedObject(supabase:ReturnType<typeof createSupabaseServiceClient>,path:string){
  try{await supabase.storage.from(storageBucket).remove([path]);}catch{}
}

export async function POST(request:Request){
  if(!isEvidenceScannerEnabled()||process.env.MMWR_PUBLIC_THUMBNAILS_ENABLED!=="true")return scannerDisabledResponse();
  if(!isEvidenceScannerRequest(request))return scannerUnauthorizedResponse();
  if(request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="image/webp"){
    return Response.json({error:"Invalid thumbnail."},{status:415,headers:evidenceScannerResponseHeaders});
  }

  const jobId=request.headers.get("x-mmwr-scan-job-id")??"";
  const leaseToken=request.headers.get("x-mmwr-scan-lease-token")??"";
  if(!uuidPattern.test(jobId)||!uuidPattern.test(leaseToken)){
    return Response.json({error:"Invalid thumbnail."},{status:400,headers:evidenceScannerResponseHeaders});
  }
  const bytes=await readBoundedBody(request);
  if(!bytes||!isWebp(bytes))return Response.json({error:"Invalid thumbnail."},{status:400,headers:evidenceScannerResponseHeaders});

  let supabase:ReturnType<typeof createSupabaseServiceClient>|null=null;
  let path:string|null=null;
  let uploaded=false;
  try{
    supabase=createSupabaseServiceClient();
    const {data:target,error:targetError}=await supabase.rpc("mmwr_get_scanner_thumbnail_target",{
      p_job_id:jobId,p_lease_token:leaseToken,
    });
    if(targetError)throw targetError;
    if(typeof target!=="string"||!storagePathPattern.test(target)||!target.endsWith(`/${jobId}/${leaseToken}.webp`)){
      return Response.json({accepted:false},{status:409,headers:evidenceScannerResponseHeaders});
    }
    path=target;
    const {error:uploadError}=await supabase.storage.from(storageBucket).upload(path,bytes,{
      contentType:"image/webp",cacheControl:"0",upsert:true,
    });
    if(uploadError)throw uploadError;
    uploaded=true;

    const {data:registered,error:registerError}=await supabase.rpc("mmwr_register_evidence_thumbnail",{
      p_job_id:jobId,p_lease_token:leaseToken,
    });
    if(registerError)throw registerError;
    if(registered!==true){
      await removeUploadedObject(supabase,path);
      return Response.json({accepted:false},{status:409,headers:evidenceScannerResponseHeaders});
    }
    return Response.json({accepted:true},{headers:evidenceScannerResponseHeaders});
  }catch{
    if(supabase&&path&&uploaded)await removeUploadedObject(supabase,path);
    return Response.json({error:"Thumbnail storage unavailable."},{status:503,headers:evidenceScannerResponseHeaders});
  }
}
