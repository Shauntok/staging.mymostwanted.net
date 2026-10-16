import "server-only";
import {getIndexableSitemapRecordCount,getIndexableSitemapRecords,getIndexableSitemapTagCount,getIndexableSitemapTags} from "@/lib/public-post-metadata";
import {getHotRankedPublicPosts,getLatestPublicPosts,getPublicChildAreas,getPublicRegionPostCounts} from "@/lib/public-posts";
import {browsableRegions} from "@/lib/maps/malaysia-regions";
import {localizedPath} from "@/lib/i18n/routing";
import {getIndexableProductionOrigin} from "@/lib/seo/indexable-origin";
import {areSitemapChildAreaResultsAvailable,isSitemapPublicQueryAvailable} from "@/lib/seo/sitemap-data-health.mjs";
import {isCompleteSitemapPage} from "@/lib/seo/sitemap-page-completeness.mjs";
import {buildSitemapIndexXml,buildSitemapXml} from "@/lib/seo/sitemap-document.mjs";
import {getSitemapShardCount,getSitemapShardIds,getSitemapShardRange} from "@/lib/seo/sitemap-pagination.mjs";

const locales=["en","zh-CN","ms"] as const;

function getLanguageUrls(path:string,origin:URL){
  return {
    "en-MY":new URL(localizedPath(path,"en"),origin).toString(),
    "zh-CN":new URL(localizedPath(path,"zh-CN"),origin).toString(),
    "ms-MY":new URL(localizedPath(path,"ms"),origin).toString(),
    "x-default":new URL(localizedPath(path,"en"),origin).toString(),
  };
}

function localizedEntries(path:string,origin:URL,lastModified?:Date){
  const languages=getLanguageUrls(path,origin);
  return locales.map(locale=>({
    url:languages[locale==="zh-CN"?"zh-CN":locale==="ms"?"ms-MY":"en-MY"],
    ...(lastModified?{lastModified}:{}),
    alternates:{languages},
  }));
}

async function getCurrentShardIds(){
  const [postCount,tagCount]=await Promise.all([getIndexableSitemapRecordCount(),getIndexableSitemapTagCount()]);
  return getSitemapShardIds(postCount,tagCount);
}

async function publicAreaEntries(origin:URL){
  const regionCounts=await getPublicRegionPostCounts();
  if(!isSitemapPublicQueryAvailable(regionCounts))return null;
  if(regionCounts.status==="empty")return [];
  const publicCounts=new Map(regionCounts.counts.filter(item=>item.publicPostCount>0).map(item=>[item.areaName,item.publicPostCount]));
  const publicRegions=browsableRegions.filter(region=>publicCounts.has(region));
  const children=await Promise.all(publicRegions.map(async region=>({region,result:await getPublicChildAreas(region)})));
  if(!areSitemapChildAreaResultsAvailable(children.map(({result})=>result)))return null;
  const entries:ReturnType<typeof localizedEntries>[number][]=[];
  for(const region of publicRegions){
    const query=new URLSearchParams({state:region});
    entries.push(...localizedEntries(`/areas?${query}`,origin));
  }
  for(const {region,result} of children){
    for(const area of result.areas){
      if(area.publicPostCount<=0)continue;
      const query=new URLSearchParams({state:region,district:area.id.toLowerCase()});
      entries.push(...localizedEntries(`/areas?${query}`,origin));
    }
  }
  return entries;
}

function isHotRankingEnabled(){
  return process.env.HOT_RANKING_ENABLED==="true"&&process.env.FIRST_PARTY_ANALYTICS_ENABLED==="true"&&
    process.env.VALID_READS_ENABLED==="true"&&process.env.NEXT_PUBLIC_VALID_READS_ENABLED==="true";
}

export async function getPublicSitemapIndexDocument():Promise<string|null>{
  const origin=getIndexableProductionOrigin();
  if(!origin)return null;
  const shardIds=await getCurrentShardIds();
  return shardIds?buildSitemapIndexXml(origin,shardIds):null;
}

export async function getPublicSitemapShardDocument(id:number):Promise<string|null>{
  const origin=getIndexableProductionOrigin();
  if(!origin||!Number.isSafeInteger(id)||id<0)return null;
  const [postCount,tagCount]=await Promise.all([getIndexableSitemapRecordCount(),getIndexableSitemapTagCount()]);
  const shardCount=getSitemapShardCount(postCount,tagCount);
  if(shardCount===null||id>=shardCount)return null;
  const range=getSitemapShardRange(id);
  if(!range)return null;
  const [records,tags]=await Promise.all([
    getIndexableSitemapRecords(range.postOffset,range.postLimit),
    getIndexableSitemapTags(range.tagOffset,range.tagLimit),
  ]);
  if(records===null||tags===null||postCount===null||tagCount===null
    ||!isCompleteSitemapPage(records,postCount,range.postOffset,range.postLimit)
    ||!isCompleteSitemapPage(tags,tagCount,range.tagOffset,range.tagLimit))return null;
  const entries:ReturnType<typeof localizedEntries>[number][]=[];

  if(id===0){
    entries.push(...localizedEntries("/",origin));
    entries.push(...localizedEntries("/clarifications",origin));
    entries.push(...localizedEntries("/areas",origin));
    const [latest,hot]=await Promise.all([
      getLatestPublicPosts(1,1),
      isHotRankingEnabled()?getHotRankedPublicPosts(1,1):Promise.resolve(null),
    ]);
    if(!isSitemapPublicQueryAvailable(latest)||(isHotRankingEnabled()&&!isSitemapPublicQueryAvailable(hot)))return null;
    if(latest.status==="ready"&&latest.posts.length>0)entries.push(...localizedEntries("/latest",origin));
    if(hot?.status==="ready"&&hot.posts.length>0)entries.push(...localizedEntries("/hot",origin));
    if(tags.length>0)entries.push(...localizedEntries("/tags",origin));
    const areas=await publicAreaEntries(origin);
    if(areas===null)return null;
    entries.push(...areas);
  }

  for(const tag of tags)entries.push(...localizedEntries(`/tags/${tag.tag_id}`,origin));
  for(const record of records){
    const route=record.content_type==="story"?"posts":"clarifications";
    entries.push(...localizedEntries(`/${route}/${record.post_id}`,origin,new Date(record.last_listed_at)));
  }
  return buildSitemapXml(entries);
}
