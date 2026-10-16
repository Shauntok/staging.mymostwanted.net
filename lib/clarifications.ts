import "server-only";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {attachPublicReactionCounts,type PublicPost} from "@/lib/public-posts";
import type {PublicReactionSummary} from "@/lib/published-post-detail";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields="post_id,approved_title,primary_name,public_excerpt,last_listed_at,public_tag_labels,public_area_name,content_type";

export type PublicReferencedStory=Pick<PublicPost,"post_id"|"approved_title"|"primary_name"|"public_area_name">&{
  first_published_at:string;
  thumbnail_available:boolean;
};
export type PublicClarificationListPost=PublicPost&{
  content_type:"clarification";
  referencedStory:PublicReferencedStory|null;
};
export type PublicClarification=PublicPost&{
  content_type:"clarification";
  fullBody:string|null;
  signedIn:boolean;
  canReact:boolean;
  reactions:PublicReactionSummary[]|null;
  referencedStory:PublicReferencedStory|null;
};
export type ClarificationListResult={posts:PublicClarificationListPost[];status:"ready"|"empty"|"unavailable";hasNextPage:boolean};
export type ClarificationDetailResult={post:PublicClarification|null;status:"ready"|"unavailable"|"removed"|"missing"};

export async function getPublicClarifications(page=1,pageSize=12):Promise<ClarificationListResult>{
  try{
    const client=await createSupabaseServerClient();
    const safePage=Number.isSafeInteger(page)&&page>0?Math.min(page,83_334):1;
    const from=(safePage-1)*Math.min(Math.max(pageSize,1),12);
    const limit=Math.min(Math.max(pageSize,1),12);
    const {data,error}=await client.rpc("public_clarification_directory",{p_limit:limit+1,p_offset:from});
    if(error||!Array.isArray(data))return {posts:[],status:"unavailable",hasNextPage:false};
    const rows=(data as unknown as Record<string,unknown>[]).flatMap(row=>{
      if(typeof row.post_id!=="string"||!uuid.test(row.post_id)||row.content_type!=="clarification")return[];
      const post={post_id:row.post_id,approved_title:String(row.approved_title??""),primary_name:String(row.primary_name??""),public_excerpt:String(row.public_excerpt??""),last_listed_at:String(row.last_listed_at??""),public_tag_labels:Array.isArray(row.public_tag_labels)?row.public_tag_labels.filter((tag):tag is string=>typeof tag==="string").slice(0,40):[],public_area_name:String(row.public_area_name??""),content_type:"clarification" as const};
      const referencedStory=typeof row.son_post_id==="string"&&uuid.test(row.son_post_id)&&typeof row.son_title==="string"
        ?{post_id:row.son_post_id,approved_title:row.son_title.slice(0,300),primary_name:String(row.son_primary_name??"").slice(0,200),public_area_name:String(row.son_area_name??"").slice(0,120),first_published_at:String(row.son_first_published_at??""),thumbnail_available:row.son_thumbnail_available===true}
        :null;
      return [{...post,referencedStory}];
    });
    const posts=await attachPublicReactionCounts(client,rows.slice(0,limit));
    return {posts,status:posts.length?"ready":"empty",hasNextPage:rows.length>limit};
  }catch{return {posts:[],status:"unavailable",hasNextPage:false};}
}

export async function getPublicClarificationDetail(postId:string):Promise<ClarificationDetailResult>{
  if(!uuid.test(postId))return {post:null,status:"missing"};
  try{
    const client=await createSupabaseServerClient();
    const normalized=postId.toLowerCase();
    const {data:preview,error}=await client.from("published_previews").select(fields).eq("post_id",normalized).eq("content_type","clarification").maybeSingle();
    if(error)return {post:null,status:"unavailable"};
    if(!preview){
      const {data:removed,error:removeError}=await client.rpc("post_is_permanently_removed",{p_post_id:normalized});
      if(removeError)return {post:null,status:"unavailable"};
      return {post:null,status:removed===true?"removed":"missing"};
    }
    const {data:parentRows,error:parentError}=await client.rpc("public_referenced_story_for_clarification",{p_clarification_post_id:normalized});
    if(parentError)return {post:null,status:"unavailable"};
    const parent=Array.isArray(parentRows)?parentRows[0]:null;
    const referencedStory=parent&&typeof parent==="object"&&typeof parent.post_id==="string"&&uuid.test(parent.post_id)
      ?{post_id:parent.post_id,approved_title:String(parent.approved_title??"").slice(0,300),primary_name:String(parent.primary_name??"").slice(0,200),public_area_name:String(parent.public_area_name??"").slice(0,120),first_published_at:String(parent.first_published_at??""),thumbnail_available:parent.thumbnail_available===true}
      :null;
    const {data:{user}}=await client.auth.getUser();
    let signedIn=false,canReact=false,fullBody:string|null=null;
    if(user){
      const {data:profile,error:profileError}=await client.from("profiles").select("account_state").eq("id",user.id).maybeSingle();
      signedIn=!profileError&&(profile?.account_state==="active"||profile?.account_state==="suspended");
      canReact=!profileError&&profile?.account_state==="active";
      if(signedIn){
        const {data,error}=await client.rpc("read_published_post_body",{p_post_id:normalized});
        if(error)return {post:null,status:"unavailable"};
        fullBody=typeof data==="string"?data:null;
      }
    }
    const {data:reactionData,error:reactionError}=await client.rpc("public_reaction_breakdown",{p_post_id:normalized});
    const reactionRows=!reactionError&&Array.isArray(reactionData)?(reactionData as {reaction_type:string;reaction_count:number|string;selected_by_viewer:boolean}[]).map(row=>({
      reaction_type:row.reaction_type as PublicReactionSummary["reaction_type"],reaction_count:Number(row.reaction_count),selected_by_viewer:row.selected_by_viewer===true,
    })).filter(row=>["helpful","thanks","support"].includes(row.reaction_type)&&Number.isSafeInteger(row.reaction_count)&&row.reaction_count>=0):null;
    const reactions=reactionRows&&new Set(reactionRows.map(row=>row.reaction_type)).size===3?reactionRows:null;
    const safe=preview as unknown as PublicPost;
    return {post:{...safe,content_type:"clarification",fullBody,signedIn,canReact,reactions,referencedStory},status:"ready"};
  }catch{return {post:null,status:"unavailable"};}
}

export async function getPublicClarificationForStory(postId:string):Promise<string|null>{
  if(!uuid.test(postId))return null;
  try{
    const client=await createSupabaseServerClient();
    const {data,error}=await client.rpc("public_clarification_for_story",{p_son_post_id:postId.toLowerCase()});
    if(error)return null;
    const row=Array.isArray(data)?data[0]:null;
    return row&&typeof row.clarification_post_id==="string"&&uuid.test(row.clarification_post_id)?row.clarification_post_id:null;
  }catch{return null;}
}

export async function getIndexableClarificationIds():Promise<{id:string;lastListedAt:string}[]>{
  try{
    const client=await createSupabaseServerClient();const collected:{id:string;lastListedAt:string}[]=[];const size=500;
    for(let page=0;page<100;page++){
      const from=page*size;const {data,error}=await client.from("published_previews").select("post_id,last_listed_at")
        .eq("content_type","clarification").order("last_listed_at",{ascending:false}).range(from,from+size-1);
      if(error||!Array.isArray(data))return [];
      for(const row of data){if(typeof row.post_id==="string"&&uuid.test(row.post_id)&&typeof row.last_listed_at==="string"&&Number.isFinite(Date.parse(row.last_listed_at)))collected.push({id:row.post_id,lastListedAt:row.last_listed_at});}
      if(data.length<size)return collected;
    }
    return collected;
  }catch{return [];}
}

export async function getPublicStoryForClarificationRequest(postId:string):Promise<(PublicReferencedStory&{content_type:"story"})|null>{
  if(!uuid.test(postId))return null;
  try{
    const client=await createSupabaseServerClient();
    const {data,error}=await client.rpc("public_story_for_clarification_request",{p_post_id:postId.toLowerCase()});
    const row=Array.isArray(data)?data[0]:null;
    if(error||!row||row.content_type!=="story"||typeof row.post_id!=="string"||!uuid.test(row.post_id))return null;
    return {post_id:row.post_id,approved_title:String(row.approved_title??"").slice(0,300),primary_name:String(row.primary_name??"").slice(0,200),public_area_name:String(row.public_area_name??"").slice(0,120),first_published_at:String(row.first_published_at??""),thumbnail_available:row.thumbnail_available===true,content_type:"story"};
  }catch{return null;}
}
