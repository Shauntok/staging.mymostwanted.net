import "server-only";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import type {PublicPost} from "@/lib/public-posts";
import {countPublicSitemapTagIds,listPublicSitemapTagIds} from "@/lib/seo/public-sitemap-tags.mjs";
import {parsePublicSitemapRecords} from "@/lib/seo/public-sitemap-records.mjs";

const fields = "post_id,approved_title,primary_name,public_excerpt,last_listed_at,public_tag_labels,public_area_name";
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Read only the sanitized published projection for page and social metadata. */
export async function getPublicPostMetadata(postId:string):Promise<Pick<PublicPost,"post_id"|"approved_title"|"primary_name"|"public_excerpt"|"public_area_name">|null>{
  if(!idPattern.test(postId))return null;
  try{
    const supabase=await createSupabaseServerClient();
    const {data,error}=await supabase.from("published_previews").select(fields)
      .eq("post_id",postId.toLowerCase()).eq("content_type","story").maybeSingle();
    if(error||!data)return null;
    const post=data as unknown as PublicPost;
    return {
      post_id:post.post_id,
      approved_title:post.approved_title,
      primary_name:post.primary_name,
      public_excerpt:post.public_excerpt,
      public_area_name:post.public_area_name,
    };
  }catch{
    return null;
  }
}

export type IndexableSitemapRecord={post_id:string;last_listed_at:string;content_type:"story"|"clarification"};
export type IndexableSitemapTag={tag_id:string};

/** Count only tags attached to the public projection, never private tag records. */
export async function getIndexableSitemapTagCount():Promise<number|null>{
  try{
    return await countPublicSitemapTagIds(await createSupabaseServerClient());
  }catch{return null;}
}

/** Read a bounded, stable sitemap slice of tags present on public posts. */
export async function getIndexableSitemapTags(offset:number,limit:number):Promise<IndexableSitemapTag[]|null>{
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>500)return null;
  try{
    return await listPublicSitemapTagIds(await createSupabaseServerClient(),offset,limit);
  }catch{return null;}
}

/** Count only currently public projection rows; never include private or unpublished posts. */
export async function getIndexableSitemapRecordCount():Promise<number|null>{
  try{
    const supabase=await createSupabaseServerClient();
    const {count,error}=await supabase.from("published_previews").select("post_id",{count:"exact",head:true})
      .in("content_type",["story","clarification"]);
    return error||typeof count!=="number"?null:count;
  }catch{return null;}
}

/** Read a bounded, stable sitemap slice from the public projection only. */
export async function getIndexableSitemapRecords(offset:number,limit:number):Promise<IndexableSitemapRecord[]|null>{
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>500)return null;
  try{
    const supabase=await createSupabaseServerClient();
    const {data,error}=await supabase.from("published_previews").select("post_id,last_listed_at,content_type")
      .in("content_type",["story","clarification"]).order("post_id",{ascending:true}).range(offset,offset+limit-1);
    return parsePublicSitemapRecords(data,error);
  }catch{return null;}
}

export function summarizePublicText(value:string,maxLength=180):string{
  const normalized=value.replace(/\s+/g," ").trim();
  if(normalized.length<=maxLength)return normalized;
  return `${normalized.slice(0,maxLength-1).trimEnd()}…`;
}
