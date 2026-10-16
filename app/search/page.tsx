import type {Metadata} from "next";
import {headers} from "next/headers";
import {SearchExperience} from "@/components/search/SearchExperience";
import {searchPublicPosts} from "@/lib/public-search";
import {getSearchClientHash} from "@/lib/search-rate-limit";
import {getLocalizedNoIndexMetadata} from "@/lib/seo/localized-page-metadata";

const metadataCopy={
  "zh-CN":{title:"搜索",description:"搜索 MMWR 中已经审核并公开的内容。"},
  en:{title:"Search",description:"Search reviewed public MMWR content when the search service is available."},
  ms:{title:"Carian",description:"Cari kandungan MMWR yang telah disemak dan diterbitkan."},
} satisfies Parameters<typeof getLocalizedNoIndexMetadata>[1];

export async function generateMetadata():Promise<Metadata>{return getLocalizedNoIndexMetadata("/search",metadataCopy);}

export default async function SearchPage({searchParams}: {searchParams: Promise<{q?: string | string[];page?:string|string[]}>}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const rawPage=Array.isArray(params.page)?params.page[0]:params.page;
  const parsed=rawPage&&/^\d{1,6}$/.test(rawPage)?Number(rawPage):1;
  const page=Number.isSafeInteger(parsed)&&parsed>0?Math.min(parsed,83_334):1;
  const requestHeaders=await headers();
  const result=await searchPublicPosts(query,page,12,getSearchClientHash(requestHeaders),true);
  return <SearchExperience query={query} posts={result.posts} similarPosts={result.similarPosts} status={result.status} page={page} hasNextPage={result.hasNextPage}/>;
}
