import type {Metadata} from "next";
import {headers} from "next/headers";
import {getPublicClarifications,getPublicStoryForClarificationRequest} from "@/lib/clarifications";
import {ClarificationsPage} from "@/components/clarifications/ClarificationsPage";
import {getTelegramSupportConfig} from "@/lib/clarification-telegram";
import {getIndexableProductionOrigin} from "@/lib/seo/indexable-origin";
import {localeFromSegment,localizedPath} from "@/lib/i18n/routing";

export async function generateMetadata():Promise<Metadata>{
  const locale=localeFromSegment((await headers()).get("x-mmwr-locale"))??"en";
  const title=locale==="zh-CN"?"真相页 — MMWR":locale==="ms"?"Kebenaran & Penjelasan — MMWR":"Truth & Clarifications — MMWR";
  const origin=getIndexableProductionOrigin();
  const languages={"en-MY":new URL(localizedPath("/clarifications","en"),origin??"https://mmwr.invalid").toString(),"zh-CN":new URL(localizedPath("/clarifications","zh-CN"),origin??"https://mmwr.invalid").toString(),"ms-MY":new URL(localizedPath("/clarifications","ms"),origin??"https://mmwr.invalid").toString(),"x-default":new URL(localizedPath("/clarifications","en"),origin??"https://mmwr.invalid").toString()};
  return {title,robots:{index:Boolean(origin),follow:Boolean(origin)},...(origin?{alternates:{canonical:new URL(localizedPath("/clarifications",locale),origin).toString(),languages}}:{})};
}

export default async function ClarificationsRoute({searchParams}:{searchParams:Promise<{page?:string|string[];son?:string|string[]}>}){
  const query=await searchParams;const rawPage=Array.isArray(query.page)?query.page[0]:query.page;const parsedPage=Number(rawPage);const page=Number.isSafeInteger(parsedPage)&&parsedPage>0?Math.min(parsedPage,83_334):1;
  const rawSon=Array.isArray(query.son)?query.son[0]:query.son;const son=typeof rawSon==="string"?await getPublicStoryForClarificationRequest(rawSon):null;
  const result=await getPublicClarifications(page);
  const support=getTelegramSupportConfig(process.env.PUBLIC_TELEGRAM_SUPPORT_URL);
  const canonicalOrigin=getIndexableProductionOrigin();
  const initialPost=son?{post_id:son.post_id,approved_title:son.approved_title,primary_name:son.primary_name,public_area_name:son.public_area_name,content_type:"story" as const}:null;
  return <ClarificationsPage posts={result.posts} status={result.status} hasNextPage={result.hasNextPage} page={page} supportUrl={support.available?support.baseUrl:null} canonicalOrigin={canonicalOrigin?.toString()??null} initialPost={initialPost} showDemo={process.env.NODE_ENV!=="production"}/>;
}
