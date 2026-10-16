import "server-only";
import {createSupabaseServiceClient} from "@/lib/supabase/service";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {attachPublicReactionCounts,type PublicPost} from "@/lib/public-posts";

export type PublicSimilarPost={post_id:string;approved_title:string;primary_name:string;public_area_name:string};
export type PublicSearchPost=PublicPost&{content_type:"story"|"clarification"};
export type PublicSearchResult={posts:PublicSearchPost[];similarPosts:PublicSimilarPost[];status:"idle"|"ready"|"empty"|"unavailable"|"rate-limited";hasNextPage:boolean;retryAfterSeconds?:number};

export async function searchPublicPosts(query:string,page:number,pageSize=12,clientHash:string|null=null,includeSimilar=false,contentType:"story"|"clarification"|null=null):Promise<PublicSearchResult>{
  const normalized=query.trim().slice(0,120);
  if(normalized.length<2)return {posts:[],similarPosts:[],status:"idle",hasNextPage:false};
  if(!clientHash)return {posts:[],similarPosts:[],status:"unavailable",hasNextPage:false};
  const safePage=Number.isSafeInteger(page)?Math.min(Math.max(page,1),83_334):1;
  const safePageSize=Number.isSafeInteger(pageSize)?Math.min(Math.max(pageSize,1),12):12;
  try{
    const supabase=createSupabaseServiceClient();
    const {data:limitData,error:limitError}=await supabase.rpc("check_public_search_rate_limit",{p_client_hash:clientHash});
    if(limitError||!limitData)return {posts:[],similarPosts:[],status:"unavailable",hasNextPage:false};
    const limitRow=Array.isArray(limitData)?limitData[0]:limitData;
    const limit=limitRow as unknown as {allowed:boolean;retry_after_seconds:number};
    if(!limit.allowed)return {posts:[],similarPosts:[],status:"rate-limited",hasNextPage:false,retryAfterSeconds:limit.retry_after_seconds};
    const {data,error}=await supabase.rpc("search_published_previews",{p_query:normalized,p_limit:safePageSize+1,p_offset:(safePage-1)*safePageSize,p_content_type:contentType});
    if(error||!data)return {posts:[],similarPosts:[],status:"unavailable",hasNextPage:false};
    const rows=data as unknown as PublicSearchPost[];
    const pagePosts=rows.slice(0,safePageSize);
    const posts=includeSimilar?await attachPublicReactionCounts(await createSupabaseServerClient(),pagePosts):pagePosts;
    let similarPosts:PublicSimilarPost[]=[];
    if(includeSimilar&&normalized.length>=4){
      const {data:similarData,error:similarError}=await supabase.rpc("recommend_similar_published_previews",{
        p_query:normalized,p_exclude_ids:posts.map(post=>post.post_id),p_limit:5,
      });
      if(!similarError&&similarData)similarPosts=similarData as unknown as PublicSimilarPost[];
    }
    return {posts,similarPosts,status:posts.length?"ready":"empty",hasNextPage:rows.length>safePageSize&&safePage<83_334};
  }catch{
    return {posts:[],similarPosts:[],status:"unavailable",hasNextPage:false};
  }
}
