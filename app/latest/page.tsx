import type { Metadata } from "next";
import {PublicPostGrid} from "@/components/public-posts/PublicPostGrid";
import {getLatestPublicPosts} from "@/lib/public-posts";
import {getLocalizedPageMetadata} from "@/lib/seo/localized-page-metadata";

const metadataCopy={
  "zh-CN":{title:"最新公开内容",description:"浏览 MMWR 中最新发布并经过审核的公开内容。"},
  en:{title:"Latest public posts",description:"Browse the latest reviewed public MMWR posts."},
  ms:{title:"Hantaran awam terkini",description:"Lihat hantaran awam MMWR terkini yang telah disemak."},
} satisfies Parameters<typeof getLocalizedPageMetadata>[1];

export async function generateMetadata({searchParams}:{searchParams:Promise<{page?:string|string[]}>}):Promise<Metadata>{
  const params=await searchParams;
  const rawPage=Array.isArray(params.page)?params.page[0]:params.page;
  const parsed=rawPage&&/^\d{1,6}$/.test(rawPage)?Number(rawPage):1;
  const page=Number.isSafeInteger(parsed)&&parsed>1?parsed:1;
  const preview=page===1?await getLatestPublicPosts(1,1):null;
  const hasPublicPosts=preview?.status==="ready"&&preview.posts.length>0;
  return getLocalizedPageMetadata(page>1?`/latest?page=${page}`:"/latest",metadataCopy,page===1&&Boolean(hasPublicPosts));
}

export default async function LatestPage({searchParams}:{searchParams:Promise<{page?:string|string[]}>}){
  const params=await searchParams;
  const rawPage=Array.isArray(params.page)?params.page[0]:params.page;
  const parsed=rawPage&&/^\d{1,6}$/.test(rawPage)?Number(rawPage):1;
  const page=Number.isSafeInteger(parsed)&&parsed>0?parsed:1;
  const result=await getLatestPublicPosts(page,12);
  return <div className="content-section home-content" style={{minHeight:"70vh",paddingTop:"clamp(38px,7vw,76px)"}}>
    <PublicPostGrid posts={result.posts} status={result.status} page={page} hasNextPage={result.hasNextPage} basePath="/latest"/>
  </div>;
}
