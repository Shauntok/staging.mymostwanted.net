import "server-only";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {HOME_TAG_COUNT,PUBLIC_LIST_PAGE_SIZE} from "@/lib/home-config";
import {isSupportedPublicPage} from "@/lib/public-pagination.mjs";

export type PublicPost = {
  post_id:string;
  approved_title:string;
  primary_name:string;
  public_excerpt:string;
  last_listed_at:string;
  public_tag_labels:string[];
  public_area_name:string;
  content_type?:"story"|"clarification";
  reaction_count?:number|null;
  public_thumbnail_count?:number;
};
export type PublicTagSpotlightItem={tag_id:string;tag_label:string;public_post_count:number};
export type PublicTagSpotlightResult={tags:PublicTagSpotlightItem[];status:"ready"|"empty"|"unavailable"};
export type PublicRegionPostCount={areaName:string;publicPostCount:number};
export type PublicRegionPostCountResult={counts:PublicRegionPostCount[];status:"ready"|"empty"|"unavailable"};
export type PublicPostResult = {posts:PublicPost[];status:"ready"|"empty"|"unavailable";hasNextPage:boolean};
const publicFields="post_id,approved_title,primary_name,public_excerpt,last_listed_at,public_tag_labels,public_area_name,content_type";

export async function getPublicRegionPostCounts():Promise<PublicRegionPostCountResult>{
  try{
    const supabase=await createSupabaseServerClient();
    const {data,error}=await supabase.rpc("public_region_post_counts");
    if(error||!Array.isArray(data))return {counts:[],status:"unavailable"};
    const counts=(data as {area_name:string;public_post_count:number|string}[]).flatMap(row=>{
      const count=Number(row.public_post_count);
      return typeof row.area_name==="string"&&row.area_name.length>0&&row.area_name.length<=80&&Number.isSafeInteger(count)&&count>=0
        ?[{areaName:row.area_name,publicPostCount:count}]:[];
    });
    return {counts,status:counts.length?"ready":"empty"};
  }catch{
    return {counts:[],status:"unavailable"};
  }
}

export async function attachPublicReactionCounts<T extends PublicPost>(client:Awaited<ReturnType<typeof createSupabaseServerClient>>,posts:T[]):Promise<(T&{reaction_count:number|null})[]>{
  if(posts.length===0)return posts as (T&{reaction_count:number|null})[];
  if(process.env.MMWR_PUBLIC_THUMBNAILS_ENABLED!=="true"){
    try{
      const {data,error}=await client.from("reaction_counts").select("post_id,reaction_count").in("post_id",posts.map(post=>post.post_id));
      if(error||!data)return posts.map(post=>({...post,reaction_count:null,public_thumbnail_count:0}));
      const counts=new Map<string,number>();
      for(const row of data as {post_id:string;reaction_count:number|string}[]){
        const count=Number(row.reaction_count);
        if(Number.isSafeInteger(count)&&count>=0)counts.set(row.post_id,count);
      }
      return posts.map(post=>({...post,reaction_count:counts.get(post.post_id)??0,public_thumbnail_count:0}));
    }catch{return posts.map(post=>({...post,reaction_count:null,public_thumbnail_count:0}));}
  }
  try{
    const postIds=posts.map(post=>post.post_id);
    const [reactionResult,thumbnailResult]=await Promise.all([
      client.from("reaction_counts").select("post_id,reaction_count").in("post_id",postIds),
      client.from("published_previews").select("post_id,public_thumbnail_count").in("post_id",postIds),
    ]);
    const thumbnailCounts=new Map<string,number>();
    if(!thumbnailResult.error&&thumbnailResult.data){
      for(const row of thumbnailResult.data as {post_id:string;public_thumbnail_count:number|string}[]){
        const count=Number(row.public_thumbnail_count);
        if(Number.isSafeInteger(count)&&count>=0)thumbnailCounts.set(row.post_id,count);
      }
    }
    if(reactionResult.error||!reactionResult.data)return posts.map(post=>({...post,reaction_count:null,public_thumbnail_count:thumbnailCounts.get(post.post_id)??0}));
    const counts=new Map<string,number>();
    for(const row of reactionResult.data as {post_id:string;reaction_count:number|string}[]){
      const count=Number(row.reaction_count);
      if(Number.isSafeInteger(count)&&count>=0)counts.set(row.post_id,count);
    }
    return posts.map(post=>({...post,reaction_count:counts.get(post.post_id)??0,public_thumbnail_count:thumbnailCounts.get(post.post_id)??0}));
  }catch{
    return posts.map(post=>({...post,reaction_count:null,public_thumbnail_count:0}));
  }
}

export async function getLatestPublicPosts(page:number,pageSize:number):Promise<PublicPostResult>{
  if(!isSupportedPublicPage(page,pageSize))return {posts:[],status:"empty",hasNextPage:false};
  try{
    const supabase=await createSupabaseServerClient();
    const from=(page-1)*pageSize;
    const {data,error}=await supabase.from("published_previews").select(publicFields).eq("content_type","story").order("last_listed_at",{ascending:false}).range(from,from+pageSize);
    if(error||!data)return {posts:[],status:"unavailable",hasNextPage:false};
    const rows=data as unknown as PublicPost[];
    const posts=await attachPublicReactionCounts(supabase,rows.slice(0,pageSize));
    return {posts,status:posts.length?"ready":"empty",hasNextPage:rows.length>pageSize};
  }catch{
    return {posts:[],status:"unavailable",hasNextPage:false};
  }
}

export async function getHotRankedPublicPosts(page=1,pageSize=PUBLIC_LIST_PAGE_SIZE):Promise<PublicPostResult>{
  if(process.env.HOT_RANKING_ENABLED!=="true"||process.env.FIRST_PARTY_ANALYTICS_ENABLED!=="true"||process.env.VALID_READS_ENABLED!=="true"||process.env.NEXT_PUBLIC_VALID_READS_ENABLED!=="true")return {posts:[],status:"unavailable",hasNextPage:false};
  const safePage=Number.isSafeInteger(page)&&page>0?Math.min(page,83_334):1;
  const safePageSize=Number.isSafeInteger(pageSize)?Math.min(Math.max(pageSize,1),PUBLIC_LIST_PAGE_SIZE):PUBLIC_LIST_PAGE_SIZE;
  const offset=(safePage-1)*safePageSize;
  try{
    const supabase=await createSupabaseServerClient();
    const {data:ranking,error:rankingError}=await supabase.rpc("public_hot_ranked_posts",{p_limit:safePageSize+1,p_offset:offset});
    if(rankingError||!Array.isArray(ranking))return {posts:[],status:"unavailable",hasNextPage:false};
    const ids=ranking.map((row:unknown)=>{
      if(!row||typeof row!=="object"||!("post_id" in row)||typeof row.post_id!=="string"||!tagIdPattern.test(row.post_id))return null;
      return row.post_id.toLowerCase();
    });
    if(ids.length>safePageSize+1||ids.some(id=>id===null)||new Set(ids).size!==ids.length)return {posts:[],status:"unavailable",hasNextPage:false};
    if(ids.length===0)return {posts:[],status:"empty",hasNextPage:false};
    const pageIds=(ids as string[]).slice(0,safePageSize);
    const {data,error}=await supabase.from("published_previews").select(publicFields).eq("content_type","story").in("post_id",pageIds);
    if(error||!Array.isArray(data)||data.length!==pageIds.length)return {posts:[],status:"unavailable",hasNextPage:false};
    const byId=new Map((data as unknown as PublicPost[]).map(post=>[post.post_id.toLowerCase(),post]));
    const posts=pageIds.map(id=>byId.get(id));
    if(posts.some(post=>!post))return {posts:[],status:"unavailable",hasNextPage:false};
    const withCounts=await attachPublicReactionCounts(supabase,posts as PublicPost[]);
    return {posts:withCounts,status:"ready",hasNextPage:safePage<83_334&&ids.length>safePageSize};
  }catch{return {posts:[],status:"unavailable",hasNextPage:false};}
}

export async function getPublicTagSpotlight():Promise<PublicTagSpotlightResult>{
  try{
    const supabase=await createSupabaseServerClient();
    const {data,error}=await supabase.rpc("public_home_tag_spotlight",{p_limit:HOME_TAG_COUNT});
    if(error||!data)return {tags:[],status:"unavailable"};
    const tags=(data as {tag_id:string;tag_label:string;public_post_count:number|string}[]).filter(tag=>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tag.tag_id)&&
      typeof tag.tag_label==="string"&&tag.tag_label.length>0
    ).map(tag=>({...tag,public_post_count:Number(tag.public_post_count)})).filter(tag=>Number.isSafeInteger(tag.public_post_count)&&tag.public_post_count>0);
    return {tags,status:tags.length?"ready":"empty"};
  }catch{
    return {tags:[],status:"unavailable"};
  }
}

export type PublicTagPostsResult = PublicPostResult & {tagLabel:string|null};
const tagIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getPublicTagPosts(tagId:string,page:number,pageSize=12):Promise<PublicTagPostsResult>{
  if(!tagIdPattern.test(tagId))return {tagLabel:null,posts:[],status:"empty",hasNextPage:false};
  if(!isSupportedPublicPage(page,pageSize))return {tagLabel:null,posts:[],status:"empty",hasNextPage:false};
  try{
    const supabase=await createSupabaseServerClient();
    const {data:directory,error:directoryError}=await supabase.rpc("public_tag_directory");
    if(directoryError||!directory)return {tagLabel:null,posts:[],status:"unavailable",hasNextPage:false};
    const tag=(directory as {tag_id:string;tag_label:string;public_post_count:number|string}[]).find(item=>item.tag_id.toLowerCase()===tagId.toLowerCase());
    if(!tag)return {tagLabel:null,posts:[],status:"empty",hasNextPage:false};

    const from=(page-1)*pageSize;
    if(!Number.isSafeInteger(from))return {tagLabel:tag.tag_label,posts:[],status:"empty",hasNextPage:false};
    const {data,error}=await supabase.from("published_previews").select(publicFields)
      .contains("public_tag_ids",[tagId.toLowerCase()])
      .order("last_listed_at",{ascending:false}).range(from,from+pageSize);
    if(error||!data)return {tagLabel:tag.tag_label,posts:[],status:"unavailable",hasNextPage:false};
    const rows=data as unknown as PublicPost[];
    const posts=await attachPublicReactionCounts(supabase,rows.slice(0,pageSize));
    return {tagLabel:tag.tag_label,posts,status:posts.length?"ready":"empty",hasNextPage:rows.length>pageSize};
  }catch{
    return {tagLabel:null,posts:[],status:"unavailable",hasNextPage:false};
  }
}

export type PublicAreaPostsResult = PublicPostResult & {areaName:string|null};

export async function getPublicAreaPosts(areaName:string,page:number,pageSize=12):Promise<PublicAreaPostsResult>{
  const normalizedArea=areaName.trim();
  if(!normalizedArea||normalizedArea.length>80||/[\u0000-\u001f\u007f]/.test(normalizedArea))return {areaName:null,posts:[],status:"empty",hasNextPage:false};
  if(!isSupportedPublicPage(page,pageSize))return {areaName:normalizedArea,posts:[],status:"empty",hasNextPage:false};
  try{
    const supabase=await createSupabaseServerClient();
    const from=(page-1)*pageSize;
    const {data,error}=await supabase.rpc("public_posts_for_area",{
      p_area_name:normalizedArea,p_limit:pageSize+1,p_offset:from,
    });
    if(error||!data)return {areaName:normalizedArea,posts:[],status:"unavailable",hasNextPage:false};
    const rows=data as unknown as PublicPost[];
    const posts=await attachPublicReactionCounts(supabase,rows.slice(0,pageSize));
    return {areaName:normalizedArea,posts,status:posts.length?"ready":"empty",hasNextPage:rows.length>pageSize};
  }catch{
    return {areaName:normalizedArea,posts:[],status:"unavailable",hasNextPage:false};
  }
}

export type PublicChildArea={id:string;name:string;publicPostCount:number};
export type PublicChildAreasResult={areas:PublicChildArea[];status:"ready"|"unavailable"};

export async function getPublicChildAreas(parentAreaName:string):Promise<PublicChildAreasResult>{
  const normalizedParent=parentAreaName.trim();
  if(!normalizedParent||normalizedParent.length>80||/[\u0000-\u001f\u007f]/.test(normalizedParent))return {areas:[],status:"ready"};
  try{
    const supabase=await createSupabaseServerClient();
    const {data,error}=await supabase.rpc("public_child_area_post_counts",{p_parent_area_name:normalizedParent});
    if(error||!Array.isArray(data))return {areas:[],status:"unavailable"};
    const areas=(data as {area_id:string;area_name:string;public_post_count:number|string}[]).flatMap(row=>{
      const count=Number(row.public_post_count);
      return (
      typeof row.area_id==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.area_id)&&
      typeof row.area_name==="string"&&row.area_name.length>0&&row.area_name.length<=80&&Number.isSafeInteger(count)&&count>=0
      )?[{id:row.area_id,name:row.area_name,publicPostCount:count}]:[];
    });
    return {areas,status:"ready"};
  }catch{
    return {areas:[],status:"unavailable"};
  }
}

export async function getPublicChildAreaPosts(cityId:string,parentAreaName:string,cityName:string,page:number,pageSize=12):Promise<PublicAreaPostsResult>{
  const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const normalizedParent=parentAreaName.trim();
  const normalizedCity=cityName.trim();
  if(!uuidPattern.test(cityId)||!normalizedParent||normalizedParent.length>80||/[\u0000-\u001f\u007f]/.test(normalizedParent)||!normalizedCity||normalizedCity.length>80||/[\u0000-\u001f\u007f]/.test(normalizedCity))return {areaName:null,posts:[],status:"empty",hasNextPage:false};
  if(!isSupportedPublicPage(page,pageSize))return {areaName:normalizedCity,posts:[],status:"empty",hasNextPage:false};
  try{
    const supabase=await createSupabaseServerClient();
    const from=(page-1)*pageSize;
    const {data,error}=await supabase.rpc("public_posts_for_city",{
      p_city_id:cityId.toLowerCase(),p_parent_area_name:normalizedParent,p_limit:pageSize+1,p_offset:from,
    });
    if(error||!data)return {areaName:normalizedCity,posts:[],status:"unavailable",hasNextPage:false};
    const rows=data as unknown as PublicPost[];
    const posts=await attachPublicReactionCounts(supabase,rows.slice(0,pageSize));
    return {areaName:normalizedCity,posts,status:posts.length?"ready":"empty",hasNextPage:rows.length>pageSize};
  }catch{
    return {areaName:normalizedCity,posts:[],status:"unavailable",hasNextPage:false};
  }
}
