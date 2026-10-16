"use client";

import {useEffect,useId,useMemo,useState} from "react";
import type {Locale} from "@/lib/i18n/catalog";
import {localizedPath} from "@/lib/i18n/routing";
import {stateDisplayName} from "@/lib/maps/state-labels";
import {areaCountAccessibleLabel} from "@/components/areas/area-count-accessible-label.mjs";
import {districtRepresentativePoint} from "@/lib/maps/district-geometry.mjs";
import styles from "@/components/areas/AreaBrowsePage.module.css";

type Position=[number,number,...number[]];
type LinearRing=Position[];
type PolygonCoordinates=LinearRing[];
type DistrictFeature={
  properties:{name:string;sourceName?:string};
  geometry:{type:"Polygon";coordinates:PolygonCoordinates}|{type:"MultiPolygon";coordinates:PolygonCoordinates[]};
};
type DistrictFeatureCollection={type:"FeatureCollection";features:DistrictFeature[]};
export type DistrictFitBounds={x:number;y:number;width:number;height:number};

const fileByRegion:Record<string,string>={
  Johor:"johor",Kedah:"kedah",Kelantan:"kelantan",Melaka:"melaka","Negeri Sembilan":"negeri-sembilan",Pahang:"pahang",Penang:"penang",Perak:"perak",Perlis:"perlis",Sabah:"sabah",Sarawak:"sarawak",Selangor:"selangor",Terengganu:"terengganu","W.P. Kuala Lumpur":"kuala-lumpur","W.P. Labuan":"labuan",
};

function polygonRings(feature:DistrictFeature):PolygonCoordinates[]{
  return feature.geometry.type==="Polygon"?[feature.geometry.coordinates]:feature.geometry.coordinates;
}

function rounded(value:number){return Math.round(value*100)/100;}

export function DistrictBoundaries({region,fitBounds,clipPathD,locale,counts}:{region:string;fitBounds:DistrictFitBounds;clipPathD:string;locale:Locale;counts:Record<string,{id:string;count:number}>}){
  const [loaded,setLoaded]=useState<{region:string;features:DistrictFeature[]}|null>(null);
  const rawId=useId();
  const clipId=`district-clip-${rawId.replace(/[^a-zA-Z0-9_-]/g,"")}`;

  useEffect(()=>{
    const file=fileByRegion[region];
    if(!file)return;
    const controller=new AbortController();
    fetch(`/maps/districts/${file}.geojson`,{signal:controller.signal,cache:"force-cache"})
      .then(async(response)=>{
        if(!response.ok)throw new Error("District boundary file unavailable");
        return await response.json() as DistrictFeatureCollection;
      })
      .then((data)=>{if(data.type==="FeatureCollection"&&Array.isArray(data.features))setLoaded({region,features:data.features});})
      .catch(()=>{if(!controller.signal.aborted)setLoaded({region,features:[]});});
    return ()=>controller.abort();
  },[region]);

  const pathData=useMemo(()=>{
    const features=loaded?.region===region?loaded.features:[];
    if(features.length===0||fitBounds.width<=0||fitBounds.height<=0)return {boundaries:"",pins:[]};
    const positions=features.flatMap((feature)=>polygonRings(feature).flat(2));
    const bounds=positions.reduce((result,[longitude,latitude])=>({
      minLongitude:Math.min(result.minLongitude,longitude),maxLongitude:Math.max(result.maxLongitude,longitude),
      minLatitude:Math.min(result.minLatitude,latitude),maxLatitude:Math.max(result.maxLatitude,latitude),
    }),{minLongitude:Number.POSITIVE_INFINITY,maxLongitude:Number.NEGATIVE_INFINITY,minLatitude:Number.POSITIVE_INFINITY,maxLatitude:Number.NEGATIVE_INFINITY});
    const {minLongitude,maxLongitude,minLatitude,maxLatitude}=bounds;
    if(!Number.isFinite(minLongitude)||maxLongitude<=minLongitude||maxLatitude<=minLatitude)return {boundaries:"",pins:[]};
    const toX=(longitude:number)=>rounded(fitBounds.x+(longitude-minLongitude)/(maxLongitude-minLongitude)*fitBounds.width);
    const toY=(latitude:number)=>rounded(fitBounds.y+(maxLatitude-latitude)/(maxLatitude-minLatitude)*fitBounds.height);
    const boundaries=features.flatMap((feature)=>polygonRings(feature).flatMap((polygon)=>polygon.map((ring)=>{
      if(ring.length<3)return "";
      return `M${ring.map(([longitude,latitude])=>`${toX(longitude)},${toY(latitude)}`).join("L")}Z`;
    }))).filter(Boolean).join("");
    const pins=features.flatMap(feature=>{
      const data=counts[feature.properties.name];
      const point=data?districtRepresentativePoint(feature.geometry):null;
      if(!data||data.count<=0||!point)return [];
      const label=stateDisplayName(locale,feature.properties.name);
      const width=Math.min(138,Math.max(80,label.length*(locale==="zh-CN"?8:5)+32));
      return [{name:feature.properties.name,id:data.id,count:data.count,x:toX(point[0]),y:toY(point[1]),width}];
    });
    return {boundaries,pins};
  },[loaded,region,fitBounds,counts,locale]);

  if(!pathData.boundaries)return null;
  return <g>
    <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><path d={clipPathD} fillRule="evenodd"/></clipPath></defs>
    <path className="district-boundary-lines" d={pathData.boundaries} clipPath={`url(#${clipId})`} fillRule="evenodd" aria-hidden="true"/>
    <g clipPath={`url(#${clipId})`}>
      {pathData.pins.map(pin=><a key={pin.id} className={styles.districtPostPin} href={localizedPath(`/areas?state=${encodeURIComponent(region)}&district=${encodeURIComponent(pin.id)}`,locale)} aria-label={areaCountAccessibleLabel(stateDisplayName(locale,pin.name),pin.count,locale,locale==="zh-CN"?"篇公开帖子":locale==="ms"?"hantaran awam":"public posts","")}>
        <rect x={pin.x-pin.width/2} y={pin.y-11} width={pin.width} height="22" rx="11"/>
        <circle cx={pin.x-pin.width/2+11} cy={pin.y} r="3"/>
        <text x={pin.x+2} y={pin.y+3.5} textAnchor="middle">{stateDisplayName(locale,pin.name)} · {pin.count.toLocaleString(locale==="zh-CN"?"zh-CN":locale==="ms"?"ms-MY":"en-MY")}</text>
      </a>)}
    </g>
  </g>;
}
