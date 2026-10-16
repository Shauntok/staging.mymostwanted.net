import type {Metadata} from "next";
import {notFound,permanentRedirect} from "next/navigation";
import {PostDetailPage} from "@/components/public-posts/PostDetailPage";
import {getPublishedPostDetail} from "@/lib/published-post-detail";
import {getPublicPostMetadata,summarizePublicText} from "@/lib/public-post-metadata";
import {headers} from "next/headers";
import {localeFromSegment,localizedPath} from "@/lib/i18n/routing";
import {getIndexableProductionOrigin} from "@/lib/seo/indexable-origin";
import {serializePublicCreativeWork} from "@/lib/seo/public-post-structured-data.mjs";

export async function generateMetadata({params}:{params:Promise<{postId:string}>}):Promise<Metadata>{
  const [{postId},requestHeaders]=await Promise.all([params,headers()]);
  const locale=localeFromSegment(requestHeaders.get("x-mmwr-locale"))??"en";
  const post=await getPublicPostMetadata(postId);
  if(!post)return {title:"Public post — MMWR",robots:{index:false,follow:false}};

  const title=summarizePublicText(post.approved_title||post.primary_name,90);
  const excerpt=summarizePublicText(post.public_excerpt,155);
  const area=summarizePublicText(post.public_area_name,32);
  const description=summarizePublicText(area?`${area} · ${excerpt}`:excerpt,180);
  const origin=getIndexableProductionOrigin();
  const path=localizedPath(`/posts/${post.post_id.toLowerCase()}`,locale);
  const canonical=origin?new URL(path,origin).toString():undefined;
  const languages=origin?{
    "en-MY":new URL(localizedPath(`/posts/${post.post_id.toLowerCase()}`,"en"),origin).toString(),
    "zh-CN":new URL(localizedPath(`/posts/${post.post_id.toLowerCase()}`,"zh-CN"),origin).toString(),
    "ms-MY":new URL(localizedPath(`/posts/${post.post_id.toLowerCase()}`,"ms"),origin).toString(),
    "x-default":new URL(localizedPath(`/posts/${post.post_id.toLowerCase()}`,"en"),origin).toString(),
  }:undefined;
  return {
    title,
    description,
    ...(canonical&&languages?{alternates:{canonical,languages}}:{}),
    openGraph:{type:"article",title,description,...(canonical?{url:canonical}:{}),siteName:"MMWR"},
    twitter:{card:"summary",title,description},
    robots:{index:Boolean(origin),follow:Boolean(origin)},
  };
}

export default async function PostPage({params,searchParams}: {params: Promise<{postId: string}>;searchParams:Promise<{reaction?:string|string[]}>}) {
  const {postId} = await params;
  const query=await searchParams;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(postId)) notFound();
  const result = await getPublishedPostDetail(postId);
  if(result.permanentlyRemoved){
    const requestHeaders=await headers();
    const locale=localeFromSegment(requestHeaders.get("x-mmwr-locale"))??"en";
    permanentRedirect(localizedPath("/",locale));
  }
  const reactionError=query.reaction==="unavailable";
  const origin=getIndexableProductionOrigin();
  const locale=localeFromSegment((await headers()).get("x-mmwr-locale"))??"en";
  const canonical=result.post&&origin?new URL(localizedPath(`/posts/${result.post.post_id.toLowerCase()}`,locale),origin).toString():null;
  const structured=result.post&&canonical?serializePublicCreativeWork({
    canonical,
    headline:summarizePublicText(result.post.approved_title||result.post.primary_name,90),
    description:summarizePublicText(result.post.public_excerpt,155),
    locale,
  }):null;
  return <>{structured&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:structured}}/>}<PostDetailPage post={result.post} unavailable={result.unavailable} postId={postId.toLowerCase()} reactionError={reactionError}/></>;
}
