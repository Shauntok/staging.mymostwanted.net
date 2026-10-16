const maxDerivativeBytes=512*1024;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const privateHeaders={
  "cache-control":"private, no-store, max-age=0",
  "content-security-policy":"default-src 'none'; sandbox",
  "cross-origin-resource-policy":"same-site",
  "x-content-type-options":"nosniff",
};

function unavailable(status=404,headers={}){return new Response(null,{status,headers:{...privateHeaders,...headers}});}

function isWebp(bytes){
  return bytes.length>=12&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
}

export function createPublicThumbnailHandler({isEnabled,checkRateLimit,resolvePath,download}){
  return async function GET(request,{params}){
    if(!isEnabled())return unavailable();
    const {postId,position}=await params;
    if(!uuidPattern.test(postId)||!/^\d$/.test(position)||Number(position)>2)return unavailable();

    try{
      const limit=await checkRateLimit(request);
      if(!limit?.configured)return unavailable(503);
      if(!limit.allowed){
        const retryAfter=Number.isInteger(limit.retryAfterSeconds)&&limit.retryAfterSeconds>0
          ?limit.retryAfterSeconds:60;
        return unavailable(429,{"retry-after":String(retryAfter)});
      }

      // Resolve eligibility on every request so a hide, removal, or visibility
      // change revokes the next delivery without relying on a cache purge.
      const path=await resolvePath(postId.toLowerCase(),Number(position));
      if(typeof path!=="string"||path.length<1||path.length>240)return unavailable();

      const file=await download(path);
      if(!file||!Buffer.isBuffer(file.bytes)||file.size<12||file.size>maxDerivativeBytes)return unavailable();
      if(file.bytes.length!==file.size||!isWebp(file.bytes))return unavailable();
      return new Response(file.bytes,{status:200,headers:{
        ...privateHeaders,
        "content-length":String(file.bytes.length),
        "content-type":"image/webp",
      }});
    }catch{
      return unavailable(503);
    }
  };
}
