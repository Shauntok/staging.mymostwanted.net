import {createHmac} from "node:crypto";
import {isIP} from "node:net";
import {getAnalyticsClientHash} from "@/lib/analytics/client-hash";
import {createSupabaseServiceClient} from "@/lib/supabase/service";
import {hasValidAnalyticsConsentAttestation} from "@/lib/analytics/consent-attestation";

const headers={"Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow, noarchive"};
const bodyLimit=256;
const postIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tokenPattern=/^[0-9a-f]{32}$/;
const supportedTrustedHeaders=new Set(["x-vercel-forwarded-for","cf-connecting-ip","x-mmwr-client-ip"]);
export const runtime="nodejs";

async function readBoundedBody(request:Request):Promise<string|null>{
  if(!request.body)return "";
  const reader=request.body.getReader();const decoder=new TextDecoder();let total=0;let text="";
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>bodyLimit){await reader.cancel();return null;}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}catch{return null;}
}

export async function POST(request:Request){
  if(process.env.FIRST_PARTY_ANALYTICS_ENABLED!=="true"||process.env.VALID_READS_ENABLED!=="true")return new Response(null,{status:204,headers});
  if(!hasValidAnalyticsConsentAttestation(request.headers.get("cookie")))return new Response(null,{status:204,headers});
  const origin=request.headers.get("origin");
  if(!origin||origin!==new URL(request.url).origin)return Response.json({error:"invalid_request"},{status:403,headers});
  if(request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json")return Response.json({error:"invalid_request"},{status:415,headers});
  const length=Number(request.headers.get("content-length")??0);if(Number.isFinite(length)&&length>bodyLimit)return Response.json({error:"invalid_request"},{status:413,headers});
  let body:unknown;try{const raw=await readBoundedBody(request);if(raw===null)return Response.json({error:"invalid_request"},{status:413,headers});body=JSON.parse(raw);}catch{return Response.json({error:"invalid_request"},{status:400,headers});}
  if(!body||typeof body!=="object")return Response.json({error:"invalid_request"},{status:400,headers});
  const input=body as Record<string,unknown>;
  if(Object.keys(input).sort().join(",")!=="postId,scrollPercent,token,visibleSeconds"||typeof input.postId!=="string"||!postIdPattern.test(input.postId)||typeof input.token!=="string"||!tokenPattern.test(input.token)||!Number.isInteger(input.visibleSeconds)||Number(input.visibleSeconds)<10||Number(input.visibleSeconds)>3600||!Number.isInteger(input.scrollPercent)||Number(input.scrollPercent)<50||Number(input.scrollPercent)>100)return Response.json({error:"invalid_request"},{status:400,headers});
  const rateHash=getAnalyticsClientHash(request.headers);const secret=process.env.ANALYTICS_VALID_READ_HMAC_SECRET;
  if(!rateHash||!secret||Buffer.byteLength(secret,"utf8")<32)return Response.json({error:"analytics_unavailable"},{status:503,headers});
  const trustedHeader=process.env.ANALYTICS_TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  const address=request.headers.get(trustedHeader&&supportedTrustedHeaders.has(trustedHeader)?trustedHeader:"")?.split(",",1)[0]?.trim();
  if(!address||isIP(address)===0)return Response.json({error:"analytics_unavailable"},{status:503,headers});
  const visitorPostHash=createHmac("sha256",secret).update("mmwr:valid-read-post-token:").update(input.postId.toLowerCase()).update(":").update(input.token).digest("hex");
  try{
    const supabase=createSupabaseServiceClient();
    const {data,error}=await supabase.rpc("record_analytics_valid_read",{p_post_id:input.postId.toLowerCase(),p_visitor_post_hash:visitorPostHash,p_client_hash:rateHash,p_visible_seconds:input.visibleSeconds,p_scroll_percent:input.scrollPercent});
    if(error)return Response.json({error:"analytics_unavailable"},{status:503,headers});
    return new Response(null,{status:data===true?204:202,headers});
  }catch{return Response.json({error:"analytics_unavailable"},{status:503,headers});}
}
