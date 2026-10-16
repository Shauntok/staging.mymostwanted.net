import {createSupabaseServiceClient} from "@/lib/supabase/service";
import {createPublicThumbnailHandler} from "@/lib/public-thumbnails/delivery.mjs";
import {getPublicThumbnailClientHash} from "@/lib/public-thumbnails/client-hash.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const storageBucket="mmwr-public-thumbnail-derivatives";
export const GET=createPublicThumbnailHandler({
  isEnabled:()=>process.env.MMWR_PUBLIC_THUMBNAILS_ENABLED==="true",
  checkRateLimit:async(request:Request)=>{
    const clientHash=getPublicThumbnailClientHash(request.headers);
    if(!clientHash)return {configured:false,allowed:false,retryAfterSeconds:0};
    const supabase=createSupabaseServiceClient();
    const {data,error}=await supabase.rpc("check_public_thumbnail_rate_limit",{
      p_client_hash:clientHash,
    });
    if(error)throw error;
    const result=Array.isArray(data)?data[0]:null;
    if(typeof result?.allowed!=="boolean")throw new Error("Thumbnail rate-limit response unavailable.");
    return {
      configured:true,
      allowed:result.allowed,
      retryAfterSeconds:Number(result.retry_after_seconds)||0,
    };
  },
  resolvePath:async(postId:string,position:number)=>{
    const supabase=createSupabaseServiceClient();
    const {data:path,error}=await supabase.rpc("mmwr_public_thumbnail_path",{
      p_post_id:postId,p_position:position,
    });
    if(error)throw error;
    return path;
  },
  download:async(path:string)=>{
    const supabase=createSupabaseServiceClient();
    const {data:file,error}=await supabase.storage.from(storageBucket).download(path);
    if(error||!file)return null;
    return {bytes:Buffer.from(await file.arrayBuffer()),size:file.size};
  },
});
