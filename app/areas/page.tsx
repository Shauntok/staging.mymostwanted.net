import type {Metadata} from "next";
import {AreaBrowsePage} from "@/components/areas/AreaBrowsePage";
import {getPublicAreaPosts,getPublicChildAreas,getPublicChildAreaPosts,getPublicRegionPostCounts} from "@/lib/public-posts";
import {getIndexableSitemapRecordCount} from "@/lib/public-post-metadata";
import {browsableRegions} from "@/lib/maps/malaysia-regions";
import {getLocalizedPageMetadata} from "@/lib/seo/localized-page-metadata";

const metadataCopy={
  "zh-CN":{title:"按地区浏览",description:"按所选地区浏览当前经过审核并公开的 MMWR 内容。"},
  en:{title:"Browse areas",description:"Browse current reviewed public MMWR posts by selected region."},
  ms:{title:"Terokai kawasan",description:"Lihat hantaran MMWR awam yang telah disemak mengikut kawasan pilihan."},
} satisfies Parameters<typeof getLocalizedPageMetadata>[1];

export async function generateMetadata({searchParams}:{searchParams:Promise<{state?:string|string[];district?:string|string[];city?:string|string[];page?:string|string[]}>}):Promise<Metadata>{
  const params=await searchParams;
  const requestedState=typeof params.state==="string"?params.state:null;
  const state=requestedState==="W.P. Putrajaya"?"W.P. Kuala Lumpur":requestedState&&browsableRegions.some(region=>region===requestedState)?requestedState:null;
  const child=typeof params.district==="string"?params.district:params.city;
  const requestedDistrict=typeof child==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(child)?child.toLowerCase():null;
  const rawPage=Array.isArray(params.page)?params.page[0]:params.page;
  const parsed=rawPage&&/^\d{1,6}$/.test(rawPage)?Number(rawPage):1;
  const page=Number.isSafeInteger(parsed)&&parsed>1?parsed:1;
  const query=new URLSearchParams();
  if(state)query.set("state",state);
  if(state&&requestedDistrict)query.set("district",requestedDistrict);
  if(page>1)query.set("page",String(page));
  const suffix=query.toString();
  const path=`/areas${suffix?`?${suffix}`:""}`;
  let areaLabel:string|null=null;
  let hasPublicPosts=!state&&!requestedDistrict;
  if(state&&page===1){
    areaLabel=state;
    if(requestedDistrict){
      const configured=await getPublicChildAreas(state);
      const selected=configured.status==="ready"?configured.areas.find(area=>area.id.toLowerCase()===requestedDistrict):null;
      if(selected){
        areaLabel=selected.name;
        const result=await getPublicChildAreaPosts(selected.id,state,selected.name,1,1);
        hasPublicPosts=result.status==="ready"&&result.posts.length>0;
      }
    }else{
      const result=await getPublicAreaPosts(state,1,1);
      hasPublicPosts=result.status==="ready"&&result.posts.length>0;
    }
  }
  const localizedCopy=areaLabel?Object.fromEntries(Object.entries(metadataCopy).map(([locale,copy])=>[locale,{
    title:`${areaLabel} — ${copy.title}`,
    description:`${copy.description} ${areaLabel}.`,
  }])) as typeof metadataCopy:metadataCopy;
  return getLocalizedPageMetadata(path,localizedCopy,page===1&&hasPublicPosts&&(!requestedDistrict||Boolean(areaLabel)));
}

export default async function AreasPage({searchParams}:{searchParams:Promise<{state?:string|string[];district?:string|string[];city?:string|string[];page?:string|string[]}>}){
  const params=await searchParams;
  const requestedState=typeof params.state==="string"?params.state:null;
  const selectedArea=requestedState==="W.P. Putrajaya"?"W.P. Kuala Lumpur":requestedState&&browsableRegions.some(region=>region===requestedState)?requestedState:null;
  const [configuredChildren,regionCounts,totalPublicPosts]=await Promise.all([
    selectedArea?getPublicChildAreas(selectedArea):Promise.resolve({areas:[],status:"ready" as const}),
    getPublicRegionPostCounts(),
    selectedArea?Promise.resolve(null):getIndexableSitemapRecordCount(),
  ]);
  const districtParam=typeof params.district==="string"?params.district:typeof params.city==="string"?params.city:null;
  const selectedDistrict=districtParam?configuredChildren.areas.find(area=>area.id.toLowerCase()===districtParam.toLowerCase())??null:null;
  const rawPage=Array.isArray(params.page)?params.page[0]:params.page;
  const parsed=rawPage&&/^\d{1,6}$/.test(rawPage)?Number(rawPage):1;
  const page=Number.isSafeInteger(parsed)&&parsed>0?parsed:1;
  const result=selectedArea?(selectedDistrict?await getPublicChildAreaPosts(selectedDistrict.id,selectedArea,selectedDistrict.name,page,12):await getPublicAreaPosts(selectedArea,page,12)):null;
  return <AreaBrowsePage areas={[...browsableRegions]} regionCounts={regionCounts.counts} regionCountsStatus={regionCounts.status} totalPublicPosts={totalPublicPosts} selectedArea={selectedArea} childAreas={configuredChildren.areas} childAreasStatus={configuredChildren.status} selectedDistrict={selectedDistrict} posts={result?.posts??[]} status={result?.status??"empty"} page={page} hasNextPage={result?.hasNextPage??false}/>;
}
