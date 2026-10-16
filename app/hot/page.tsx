import type { Metadata } from "next";
import {HotRankingPage} from "@/components/hot/HotRankingPage";
import {getLocalizedPageMetadata} from "@/lib/seo/localized-page-metadata";
import {getHotRankedPublicPosts} from "@/lib/public-posts";
import {PUBLIC_LIST_PAGE_SIZE} from "@/lib/home-config";

const metadataCopy={
  "zh-CN":{title:"热门故事",description:"了解 MMWR 如何根据经过审核的有效阅读呈现热门故事。"},
  en:{title:"Hot Ranked",description:"See how MMWR Hot Ranked will present audited effective-read rankings."},
  ms:{title:"Kisah popular",description:"Lihat cara MMWR akan memaparkan kisah popular berdasarkan bacaan berkesan yang diaudit."},
} satisfies Parameters<typeof getLocalizedPageMetadata>[1];

function normalizedPage(raw:string|string[]|undefined){const value=Array.isArray(raw)?raw[0]:raw;const parsed=value&&/^\d{1,6}$/.test(value)?Number(value):1;return Number.isSafeInteger(parsed)&&parsed>1?Math.min(parsed,83_334):1;}

export async function generateMetadata({searchParams}:{searchParams:Promise<{page?:string|string[]}>}):Promise<Metadata>{
  const params=await searchParams;const page=normalizedPage(params.page);
  const hasHotRanking=process.env.HOT_RANKING_ENABLED==="true"&&process.env.FIRST_PARTY_ANALYTICS_ENABLED==="true"&&process.env.VALID_READS_ENABLED==="true"&&process.env.NEXT_PUBLIC_VALID_READS_ENABLED==="true";
  const preview=page===1&&hasHotRanking?await getHotRankedPublicPosts(1,1):null;
  const hasPublicRanking=preview?.status==="ready"&&preview.posts.length>0;
  return getLocalizedPageMetadata(page>1?`/hot?page=${page}`:"/hot",metadataCopy,page===1&&hasPublicRanking);
}

export default async function HotPage({searchParams}:{searchParams:Promise<{page?:string|string[]}>}) { const params=await searchParams;const page=normalizedPage(params.page);const result=await getHotRankedPublicPosts(page,PUBLIC_LIST_PAGE_SIZE);return <HotRankingPage posts={result.posts} status={result.status} page={page} hasNextPage={result.hasNextPage}/>; }
