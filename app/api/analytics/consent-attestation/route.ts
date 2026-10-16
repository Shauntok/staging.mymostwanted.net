import {NextResponse} from "next/server";
import {ANALYTICS_CONSENT_COOKIE,createAnalyticsConsentAttestation} from "@/lib/analytics/consent-attestation";

const headers={"Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow, noarchive"};
const bodyLimit=64;
export const runtime="nodejs";

async function readBoundedBody(request:Request){
  if(!request.body)return "";
  const reader=request.body.getReader();const decoder=new TextDecoder();let bytes=0;let text="";
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>bodyLimit){await reader.cancel();return null;}text+=decoder.decode(value,{stream:true});}return text+decoder.decode();}catch{return null;}
}

export async function POST(request:Request){
  const origin=request.headers.get("origin");
  if(!origin||origin!==new URL(request.url).origin)return NextResponse.json({error:"invalid_request"},{status:403,headers});
  if(request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json")return NextResponse.json({error:"invalid_request"},{status:415,headers});
  const length=Number(request.headers.get("content-length")??0);
  if(Number.isFinite(length)&&length>bodyLimit)return NextResponse.json({error:"invalid_request"},{status:413,headers});
  let body:unknown;
  try{const text=await readBoundedBody(request);if(text===null)return NextResponse.json({error:"invalid_request"},{status:413,headers});body=JSON.parse(text);}catch{return NextResponse.json({error:"invalid_request"},{status:400,headers});}
  if(!body||typeof body!=="object"||Object.keys(body).length!==1||typeof (body as Record<string,unknown>).analytics!=="boolean")return NextResponse.json({error:"invalid_request"},{status:400,headers});
  const analytics=(body as {analytics:boolean}).analytics;
  const response=new NextResponse(null,{status:204,headers});
  if(!analytics){
    response.cookies.set(ANALYTICS_CONSENT_COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/api/analytics",maxAge:0});
    return response;
  }
  const attestation=createAnalyticsConsentAttestation();
  if(!attestation)return NextResponse.json({error:"analytics_unavailable"},{status:503,headers});
  response.cookies.set(ANALYTICS_CONSENT_COOKIE,attestation.value,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/api/analytics",maxAge:attestation.maxAge});
  return response;
}
