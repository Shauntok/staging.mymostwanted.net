import {searchPublicPosts} from "@/lib/public-search";
import {getSearchClientHash} from "@/lib/search-rate-limit";

const headers={"Cache-Control":"no-store, max-age=0","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow, noarchive"};
const maxBodyBytes=2048;

export const runtime="nodejs";

async function readBoundedBody(request:Request):Promise<string|null>{
  if(!request.body)return "";
  const reader=request.body.getReader();
  const decoder=new TextDecoder();
  let totalBytes=0;
  let text="";
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      totalBytes+=value.byteLength;
      if(totalBytes>maxBodyBytes){await reader.cancel();return null;}
      text+=decoder.decode(value,{stream:true});
    }
    return text+decoder.decode();
  }catch{
    return null;
  }
}

export async function POST(request:Request){
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return Response.json({suggestions:[]},{status:403,headers});
  if(request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase()!=="application/json")return Response.json({suggestions:[]},{status:415,headers});
  const contentLength=Number(request.headers.get("content-length")??0);
  if(Number.isFinite(contentLength)&&contentLength>maxBodyBytes)return Response.json({suggestions:[]},{status:413,headers});

  let body:unknown;
  try{
    const rawBody=await readBoundedBody(request);
    if(rawBody===null)return Response.json({suggestions:[]},{status:413,headers});
    body=JSON.parse(rawBody);
  }catch{
    return Response.json({suggestions:[]},{status:400,headers});
  }

  const query=body&&typeof body==="object"&&"query" in body&&typeof body.query==="string"?body.query.trim().slice(0,120):"";
  if(query.length<2)return Response.json({suggestions:[]},{headers});

  const contentType=body&&typeof body==="object"&&"contentType" in body&&body.contentType==="story"?"story":null;

  const result=await searchPublicPosts(query,1,5,getSearchClientHash(request.headers),false,contentType);
  if(result.status==="rate-limited")return Response.json({suggestions:[]},{status:429,headers:{...headers,"Retry-After":String(result.retryAfterSeconds??60)}});
  if(result.status==="unavailable")return Response.json({suggestions:[]},{status:503,headers});

  const suggestions=result.posts.map(({post_id,primary_name,approved_title,public_area_name,content_type})=>({post_id,primary_name,approved_title,public_area_name,content_type}));
  return Response.json({suggestions},{headers});
}
