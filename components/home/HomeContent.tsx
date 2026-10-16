import {HomePage} from "@/components/home/HomePage";
import {getHotRankedPublicPosts,getLatestPublicPosts,getPublicTagSpotlight} from "@/lib/public-posts";
import {HOME_HOT_COUNT,HOME_LATEST_COUNT} from "@/lib/home-config";
import {getIndexableProductionOrigin} from "@/lib/seo/indexable-origin";
import type {Locale} from "@/lib/i18n/catalog";
import {localeSegment} from "@/lib/i18n/routing";

export async function HomeContent({locale}:{locale:Locale}){
  const [latest,hot,tags]=await Promise.all([getLatestPublicPosts(1,HOME_LATEST_COUNT),getHotRankedPublicPosts(1,HOME_HOT_COUNT),getPublicTagSpotlight()]);
  const origin=getIndexableProductionOrigin();
  const siteUrl=origin?new URL(`/${localeSegment(locale)}`,origin).toString():null;
  const jsonLd=origin&&siteUrl?{
    "@context":"https://schema.org",
    "@graph":[
      {"@type":"Organization","@id":`${origin.origin}/#organization`,name:"MMWR — Malaysia Most Wanted Ranking",url:siteUrl},
      {"@type":"WebSite","@id":`${siteUrl}#website`,name:"MMWR — Malaysia Most Wanted Ranking",url:siteUrl,publisher:{"@id":`${origin.origin}/#organization`}},
    ],
  }:null;
  return <>
    {jsonLd&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,"\\u003c")}}/>}
    <HomePage latestPosts={latest.posts} latestStatus={latest.status} hotPosts={hot.posts} hotStatus={hot.status} tagSpotlight={tags.tags} tagStatus={tags.status}/>
  </>;
}
