import type {Metadata} from "next";
import {headers} from "next/headers";
import {notFound,permanentRedirect} from "next/navigation";
import {getPublicClarificationDetail} from "@/lib/clarifications";
import {ClarificationDetailPage} from "@/components/clarifications/ClarificationDetailPage";
import {getIndexableProductionOrigin} from "@/lib/seo/indexable-origin";
import {localeFromSegment,localizedPath} from "@/lib/i18n/routing";
import {clarificationCopy} from "@/components/clarifications/copy";
import {serializePublicClarificationArticle} from "@/lib/seo/public-clarification-structured-data.mjs";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Params={params:Promise<{postId:string}>};

export async function generateMetadata({params}:Params):Promise<Metadata>{
  const [{postId},requestHeaders]=await Promise.all([params,headers()]);
  const locale=localeFromSegment(requestHeaders.get("x-mmwr-locale"))??"en";
  const origin=getIndexableProductionOrigin();
  if(!uuid.test(postId))return {title:"Clarification — MMWR",robots:{index:false,follow:false}};
  const {post}=await getPublicClarificationDetail(postId);
  if(!post)return {title:"Clarification — MMWR",robots:{index:false,follow:false}};
  const relatedStoryUnavailable=!post.referencedStory;
  const title=(relatedStoryUnavailable?`${clarificationCopy[locale].clarificationBadge} — MMWR`:post.approved_title||post.primary_name).replace(/[\u0000-\u001f\u007f]/g," ").slice(0,90);
  const description=(relatedStoryUnavailable?clarificationCopy[locale].sonUnavailable:post.public_excerpt).replace(/[\u0000-\u001f\u007f]/g," ").slice(0,180);
  const languageUrls={"en-MY":new URL(localizedPath(`/clarifications/${post.post_id}`,"en"),origin??"https://mmwr.invalid").toString(),"zh-CN":new URL(localizedPath(`/clarifications/${post.post_id}`,"zh-CN"),origin??"https://mmwr.invalid").toString(),"ms-MY":new URL(localizedPath(`/clarifications/${post.post_id}`,"ms"),origin??"https://mmwr.invalid").toString(),"x-default":new URL(localizedPath(`/clarifications/${post.post_id}`,"en"),origin??"https://mmwr.invalid").toString()};
  const canonical=origin?new URL(localizedPath(`/clarifications/${post.post_id}`,locale),origin).toString():undefined;
  return {title,description,...(canonical?{alternates:{canonical,languages:languageUrls}}:{}),openGraph:{type:"article",title,description,...(canonical?{url:canonical}:{}),siteName:"MMWR"},twitter:{card:"summary",title,description},robots:{index:Boolean(origin),follow:Boolean(origin)}};
}

export default async function ClarificationRoute({params}:Params){
  const {postId}=await params;if(!uuid.test(postId))notFound();
  const result=await getPublicClarificationDetail(postId);
  if(result.status==="removed"){
    const locale=localeFromSegment((await headers()).get("x-mmwr-locale"))??"en";
    permanentRedirect(localizedPath("/",locale));
  }
  const requestHeaders=await headers();
  const locale=localeFromSegment(requestHeaders.get("x-mmwr-locale"))??"en";
  const origin=getIndexableProductionOrigin();
  const structured=result.post?.referencedStory?serializePublicClarificationArticle({
    canonical:origin?new URL(localizedPath(`/clarifications/${result.post.post_id}`,locale),origin).toString():null,
    headline:result.post.approved_title,
    description:result.post.public_excerpt,
    datePublished:result.post.last_listed_at,
    locale,
    citation:origin?new URL(localizedPath(`/posts/${result.post.referencedStory.post_id}`,locale),origin).toString():null,
  }):null;
  return <>{structured&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:structured}}/>}<ClarificationDetailPage post={result.post} status={result.status}/></>;
}
