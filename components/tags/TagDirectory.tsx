"use client";

import {useEffect, useMemo, useRef, useState, type PointerEvent} from "react";
import Link from "@/components/shell/LocalizedLink";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {placeTags} from "./sphere-layout.mjs";
import {shouldAutoRotate} from "./sphere-motion.mjs";
import {isFrontFacingGridDepth,stableGridCoordinate} from "./sphere-grid.mjs";
import {sphereTagAccessibleLabel} from "./sphere-tag-accessible-label.mjs";
import {tagFilterAnnouncement} from "./tag-filter-announcement.mjs";
import styles from "./TagDirectory.module.css";

type Tag = {tag_id:string;tag_label:string;public_post_count:number};
type SphereTag = Tag & {longitude:number;latitude:number};
type Vector3 = {x:number;y:number;z:number};
type Quaternion = {x:number;y:number;z:number;w:number};
type Props = {tags:Tag[];status:"ready"|"empty"|"unavailable"};
const starCount = 16;
const demoLabels={
  "zh-CN":["租房经验","邻里噪音","消费纠纷","职场故事","交通争议","校园生活","网购售后","服务体验","宠物邻里","装修问题","物业沟通","求职经历","合租日常","出行体验","维修记录","饮食卫生","客服反馈","合同提醒","快递问题","社区活动","安全提醒","家居分享","购物体验","公共设施","职场沟通","学习日常","本地生活","旅行见闻","费用争议","经验分享"],
  en:["Rental tips","Neighbour noise","Consumer issues","Work stories","Traffic concerns","Campus life","Online shopping","Service reviews","Pets nearby","Home repairs","Property matters","Job hunting","Shared housing","Travel notes","Maintenance","Food safety","Customer support","Contract tips","Delivery issues","Community events","Safety notes","Home ideas","Shopping finds","Public spaces","Workplace talk","Study life","Local living","Travel stories","Billing issues","Useful advice"],
  ms:["Tip sewa rumah","Gangguan jiran","Isu pengguna","Kisah kerja","Isu trafik","Kehidupan kampus","Beli-belah dalam talian","Ulasan servis","Haiwan peliharaan","Baiki rumah","Hal pengurusan","Pengalaman kerja","Rumah kongsi","Catatan perjalanan","Penyelenggaraan","Keselamatan makanan","Khidmat pelanggan","Tip kontrak","Isu penghantaran","Acara komuniti","Nota keselamatan","Idea rumah","Pengalaman membeli","Kemudahan awam","Komunikasi kerja","Kehidupan belajar","Kehidupan tempatan","Cerita perjalanan","Isu bil","Perkongsian tip"],
} as const;
const copy = {
  "zh-CN":{eyebrow:"公开标签目录",title:"探索标签",intro:"发现已审核并公开的主题标签。标签数量仅统计当前公开内容。",empty:"目前还没有公开标签。标签会在相关内容审核并公开后出现。",unavailable:"标签服务暂时无法连接。请稍后再试。",search:"查找标签",searchHint:"输入标签名称",sphere:"三维标签球体",all:"全部标签",count:"篇公开内容",sampleCount:"篇示例内容",none:"没有匹配的标签。",clear:"清除搜索",drag:"标签固定在球面的经纬点上。拖动球体，快速松手后会带惯性减速，再恢复慢速自转。",demoHint:"30 个示例标签 · 仅供预览，不会写入数据库",sample:"示例"},
  en:{eyebrow:"PUBLIC TAG DIRECTORY",title:"Explore tags",intro:"Discover topics from reviewed, published posts. Counts include public content only.",empty:"There are no public tags yet. Tags appear after related content is reviewed and published.",unavailable:"The tag service is temporarily unavailable. Please try again later.",search:"Find a tag",searchHint:"Search tag names",sphere:"3D tag globe",all:"All tags",count:"public posts",sampleCount:"sample posts",none:"No matching tags.",clear:"Clear search",drag:"Tags stay anchored to the sphere. Drag to turn it; a quick release carries momentum before slow rotation resumes.",demoHint:"30 sample tags · preview only, never saved",sample:"Sample"},
  ms:{eyebrow:"DIREKTORI TAG AWAM",title:"Teroka tag",intro:"Temui topik daripada hantaran yang telah disemak dan diterbitkan. Kiraan hanya meliputi kandungan awam.",empty:"Belum ada tag awam. Tag akan muncul selepas kandungan berkaitan disemak dan diterbitkan.",unavailable:"Perkhidmatan tag tidak tersedia buat sementara waktu. Cuba lagi nanti.",search:"Cari tag",searchHint:"Cari nama tag",sphere:"Globe tag 3D",all:"Semua tag",count:"hantaran awam",sampleCount:"hantaran contoh",none:"Tiada tag yang sepadan.",clear:"Kosongkan carian",drag:"Tag kekal pada koordinat di permukaan glob. Seret untuk memutarkannya; pelepasan pantas membawa momentum sebelum putaran perlahan disambung.",demoHint:"30 tag contoh · pratonton sahaja, tidak disimpan",sample:"Contoh"},
} as const;

function normalizeQuaternion(q:Quaternion):Quaternion{
  const length=Math.hypot(q.x,q.y,q.z,q.w)||1;
  return {x:q.x/length,y:q.y/length,z:q.z/length,w:q.w/length};
}

function multiplyQuaternion(a:Quaternion,b:Quaternion):Quaternion{
  return normalizeQuaternion({
    x:a.w*b.x+a.x*b.w+a.y*b.z-a.z*b.y,
    y:a.w*b.y-a.x*b.z+a.y*b.w+a.z*b.x,
    z:a.w*b.z+a.x*b.y-a.y*b.x+a.z*b.w,
    w:a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z,
  });
}

function quaternionBetween(from:Vector3,to:Vector3):Quaternion{
  const dot=Math.max(-1,Math.min(1,from.x*to.x+from.y*to.y+from.z*to.z));
  if(dot<-.999999){
    const cross=from.x<-.8||from.x>.8?{x:0,y:from.z,z:-from.y}:{x:-from.z,y:0,z:from.x};
    const length=Math.hypot(cross.x,cross.y,cross.z)||1;
    return {x:cross.x/length,y:cross.y/length,z:cross.z/length,w:0};
  }
  return normalizeQuaternion({x:from.y*to.z-from.z*to.y,y:from.z*to.x-from.x*to.z,z:from.x*to.y-from.y*to.x,w:1+dot});
}

function quaternionFromAxisAngle(axis:Vector3,angle:number):Quaternion{
  const half=angle/2,sine=Math.sin(half);
  return normalizeQuaternion({x:axis.x*sine,y:axis.y*sine,z:axis.z*sine,w:Math.cos(half)});
}

function axisAngleFromQuaternion(q:Quaternion):{axis:Vector3;angle:number}{
  const shortest=q.w<0?{x:-q.x,y:-q.y,z:-q.z,w:-q.w}:q;
  const angle=2*Math.acos(Math.max(-1,Math.min(1,shortest.w)));
  const sine=Math.sqrt(Math.max(0,1-shortest.w*shortest.w));
  return {axis:sine<.0001?{x:0,y:0,z:1}:{x:shortest.x/sine,y:shortest.y/sine,z:shortest.z/sine},angle};
}

function trackballVector(clientX:number,clientY:number,rect:DOMRect):Vector3{
  const radius=Math.max(1,Math.min(rect.width,rect.height)/2);
  let x=(clientX-(rect.left+rect.width/2))/radius;
  let y=((rect.top+rect.height/2)-clientY)/radius;
  const distance=x*x+y*y;
  if(distance>1){const scale=1/Math.sqrt(distance);x*=scale;y*=scale;return {x,y,z:0};}
  return {x,y,z:Math.sqrt(1-distance)};
}

function rotateVector(rotation:Quaternion,vector:Vector3):Vector3{
  const tx=2*(rotation.y*vector.z-rotation.z*vector.y);
  const ty=2*(rotation.z*vector.x-rotation.x*vector.z);
  const tz=2*(rotation.x*vector.y-rotation.y*vector.x);
  return {x:vector.x+rotation.w*tx+(rotation.y*tz-rotation.z*ty),y:vector.y+rotation.w*ty+(rotation.z*tx-rotation.x*tz),z:vector.z+rotation.w*tz+(rotation.x*ty-rotation.y*tx)};
}

function projectSpherePoint(longitude:number,latitude:number,rotation:Quaternion){
  const point=rotateVector(rotation,{x:Math.cos(latitude)*Math.sin(longitude),y:Math.sin(latitude),z:Math.cos(latitude)*Math.cos(longitude)});
  return point;
}

function smoothstep(start:number,end:number,value:number){
  const progress=Math.max(0,Math.min(1,(value-start)/(end-start)));
  return progress*progress*(3-2*progress);
}

export function TagDirectory({tags,status}:Props){
  const {locale}=usePreferences(); const text=copy[locale];
  const [query,setQuery]=useState(""); const [rotation,setRotation]=useState<Quaternion>({x:Math.sin(-Math.PI/60),y:0,z:0,w:Math.cos(-Math.PI/60)});
  const [sample,setSample]=useState<SphereTag[]>([]);
  const [demoMode,setDemoMode]=useState(false);
  const [dragging,setDragging]=useState(false); const [inertial,setInertial]=useState(false);
  const [focusedTagId,setFocusedTagId]=useState<string|null>(null);
  const [reducedMotion,setReducedMotion]=useState(false);
  const spinDirection=useRef({x:0,y:0,z:0,remaining:0});
  const pointer=useRef<{vector:Vector3;time:number}|null>(null);
  const angularVelocity=useRef({x:0,y:0,z:0});
  useEffect(()=>{const frame=window.requestAnimationFrame(()=>setDemoMode(process.env.NODE_ENV==="development"&&new URLSearchParams(window.location.search).get("preview")==="tags"));return()=>window.cancelAnimationFrame(frame);},[]);
  const demoTags=useMemo(()=>demoLabels[locale].map((tag_label,index)=>({tag_id:`demo-tag-${index+1}`,tag_label,public_post_count:11+(index*17)%91})),[locale]);
  const directoryTags=demoMode?demoTags:tags;
  useEffect(()=>{const frame=window.requestAnimationFrame(()=>setSample(placeTags(directoryTags)));return()=>window.cancelAnimationFrame(frame);},[directoryTags]);
  useEffect(()=>{const preference=window.matchMedia("(prefers-reduced-motion: reduce)");const update=()=>setReducedMotion(preference.matches);update();preference.addEventListener("change",update);return()=>preference.removeEventListener("change",update);},[]);
  useEffect(()=>{
    if(!shouldAutoRotate({reducedMotion,dragging,inertial,tagFocused:focusedTagId!==null}))return;
    const chooseDirection=()=>{
      const angle=Math.random()*Math.PI*2,z=Math.random()*2-1;
      const planar=Math.sqrt(1-z*z),speed=.003+Math.random()*.003;
      spinDirection.current={x:Math.cos(angle)*planar*speed,y:Math.sin(angle)*planar*speed,z:z*speed,remaining:60+Math.floor(Math.random()*100)};
    };
    if(spinDirection.current.remaining<=0)chooseDirection();
    const timer=window.setInterval(()=>{
      if(spinDirection.current.remaining--<=0)chooseDirection();
      const direction=spinDirection.current,speed=Math.hypot(direction.x,direction.y,direction.z);
      const delta=quaternionFromAxisAngle({x:direction.x/speed,y:direction.y/speed,z:direction.z/speed},speed);
      setRotation(value=>multiplyQuaternion(delta,value));
    },80);
    return()=>window.clearInterval(timer);
  },[dragging,inertial,reducedMotion,focusedTagId]);
  useEffect(()=>{
    if(!inertial||reducedMotion)return;
    let frame=0,last=performance.now();
    const move=(now:number)=>{
      const elapsed=Math.min(40,now-last);last=now;
      const velocity=angularVelocity.current;
      const speed=Math.hypot(velocity.x,velocity.y,velocity.z);
      if(speed>0){const delta=quaternionFromAxisAngle({x:velocity.x/speed,y:velocity.y/speed,z:velocity.z/speed},speed*elapsed);setRotation(value=>multiplyQuaternion(delta,value));}
      const friction=Math.exp(-elapsed/500);
      velocity.x*=friction;velocity.y*=friction;velocity.z*=friction;
      const remainingSpeed=Math.hypot(velocity.x,velocity.y,velocity.z);
      if(remainingSpeed<.00032){
        const direction={x:velocity.x/(remainingSpeed||1),y:velocity.y/(remainingSpeed||1),z:velocity.z/(remainingSpeed||1)},speed=.003+Math.random()*.003;
        spinDirection.current={x:direction.x*speed,y:direction.y*speed,z:direction.z*speed,remaining:60+Math.floor(Math.random()*100)};
        angularVelocity.current={x:0,y:0,z:0};setInertial(false);return;
      }
      frame=window.requestAnimationFrame(move);
    };
    frame=window.requestAnimationFrame(move);
    return()=>window.cancelAnimationFrame(frame);
  },[inertial,reducedMotion]);
  const sorted=useMemo(()=>[...directoryTags].sort((a,b)=>a.tag_label.localeCompare(b.tag_label,locale)),[directoryTags,locale]);
  const filtered=useMemo(()=>sorted.filter(tag=>tag.tag_label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),[sorted,query]);
  const sphereTags=useMemo(()=>{const visible=new Set(filtered.map(tag=>tag.tag_id));return sample.filter(tag=>visible.has(tag.tag_id));},[filtered,sample]);
  const onPointerDown=(event:PointerEvent<HTMLDivElement>)=>{
    if((event.target as HTMLElement).closest("a,button"))return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current={vector:trackballVector(event.clientX,event.clientY,event.currentTarget.getBoundingClientRect()),time:event.timeStamp};
    angularVelocity.current={x:0,y:0,z:0};setInertial(false);setDragging(true);
  };
  const onPointerMove=(event:PointerEvent<HTMLDivElement>)=>{
    const previous=pointer.current;if(!previous)return;
    const elapsed=Math.max(1,event.timeStamp-previous.time),next=trackballVector(event.clientX,event.clientY,event.currentTarget.getBoundingClientRect());
    const delta=quaternionBetween(previous.vector,next),{axis,angle}=axisAngleFromQuaternion(delta),speed=Math.min(.015,angle/elapsed);
    angularVelocity.current={x:angularVelocity.current.x*.55+axis.x*speed*.45,y:angularVelocity.current.y*.55+axis.y*speed*.45,z:angularVelocity.current.z*.55+axis.z*speed*.45};
    pointer.current={vector:next,time:event.timeStamp};
    setRotation(value=>multiplyQuaternion(delta,value));
  };
  const onPointerUp=()=>{
    pointer.current=null;setDragging(false);
    if(!reducedMotion&&Math.hypot(angularVelocity.current.x,angularVelocity.current.y,angularVelocity.current.z)>.00035)setInertial(true);
    else{angularVelocity.current={x:0,y:0,z:0};setInertial(false);}
  };
  const tagHref=(tagId:string)=>`/tags/${tagId}`;
  return <div className={styles.page} lang={locale}>
    <header className={styles.header}><p className={styles.eyebrow}>{text.eyebrow} / MMWR</p><h1>{text.title}</h1><p>{text.intro}</p></header>
    <>
      <section className={styles.explorer} aria-label={text.sphere}>
        <div className={styles.spacefield} aria-hidden="true">{Array.from({length:starCount},(_,index)=><i key={index} className={styles.star}/>)}</div>
        <div className={styles.explorerMeta} aria-hidden="true"><span>MMWR</span><i/><span>TAG ORBIT</span></div>
        <div className={`${styles.sphere} ${dragging?styles.dragging:""}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <EarthIllustration rotation={rotation}/>
          {sphereTags.map(tag=>{const point=projectSpherePoint(tag.longitude,tag.latitude,rotation);const x=50+point.x*42,y=50-point.y*42,opacity=smoothstep(-.45,.32,point.z),scale=.52+.48*smoothstep(-.45,1,point.z),hidden=opacity<.035;return demoMode?<span key={tag.tag_id} className={`${styles.orb} ${styles.orbSample}`} style={{left:`${x}%`,top:`${y}%`,zIndex:Math.round((point.z+1)*20),transform:`translate(-50%,-50%) scale(${scale})`,opacity}} aria-hidden="true">{tag.tag_label}</span>:<Link key={tag.tag_id} className={styles.orb} href={tagHref(tag.tag_id)} style={{left:`${x}%`,top:`${y}%`,zIndex:Math.round((point.z+1)*20),transform:`translate(-50%,-50%) scale(${scale})`,opacity,pointerEvents:hidden?"none":"auto"}} tabIndex={hidden?-1:0} aria-hidden={hidden||undefined} aria-label={sphereTagAccessibleLabel(tag.tag_label,tag.public_post_count,locale)} onFocus={()=>{setFocusedTagId(tag.tag_id);angularVelocity.current={x:0,y:0,z:0};setInertial(false);}} onBlur={event=>{const nextTarget=event.relatedTarget;if(nextTarget instanceof Node&&event.currentTarget.parentElement?.contains(nextTarget))return;setFocusedTagId(null);}}>{tag.tag_label}</Link>;})}
        </div>
        <p className={`${styles.hint} ${status!=="ready"&&!demoMode?styles.hintStatus:""}`} role={status==="ready"||demoMode?undefined:"status"}>{demoMode?text.demoHint:status==="ready"?text.drag:status==="empty"?text.empty:text.unavailable}</p>
      </section>
      <section className={styles.directory} aria-labelledby="tag-list-title">
        <div className={styles.listHeading}><h2 id="tag-list-title">{text.all}<span>{filtered.length}</span></h2><label><span className={styles.srOnly}>{text.search}</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={text.searchHint} type="search"/>{query&&<button type="button" onClick={()=>setQuery("")}>{text.clear}</button>}</label></div>
        <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">{query.trim()?tagFilterAnnouncement(filtered.length,locale):""}</p>
        {status!=="ready"&&!demoMode?<p className={styles.notice} role="status">{status==="empty"?text.empty:text.unavailable}</p>:filtered.length?<ul>{filtered.map(tag=><li key={tag.tag_id}>{demoMode?<div className={styles.directoryTag}><span>{tag.tag_label}</span><small>{tag.public_post_count.toLocaleString(locale)} {text.sampleCount}</small></div>:<Link className={styles.directoryTag} href={tagHref(tag.tag_id)}><span>{tag.tag_label}</span><small>{tag.public_post_count.toLocaleString(locale)} {text.count}</small></Link>}{demoMode&&<span className={styles.sampleBadge}>{text.sample}</span>}</li>)}</ul>:<p className={styles.notice}>{text.none}</p>}
      </section>
    </>
  </div>;
}

function EarthIllustration({rotation}:{rotation:Quaternion}){
  const gridPaths=useMemo(()=>{
    const paths:string[]=[];
    const line=(points:Array<{longitude:number;latitude:number}>)=>{
      let segment:string[]=[];
      for(const point of points){
        const projected=projectSpherePoint(point.longitude,point.latitude,rotation);
        if(isFrontFacingGridDepth(projected.z)){segment.push(`${stableGridCoordinate(250+projected.x*224)},${stableGridCoordinate(250-projected.y*224)}`);}
        else if(segment.length>1){paths.push(`M${segment.join(" L")}`);segment=[];}
        else segment=[];
      }
      if(segment.length>1)paths.push(`M${segment.join(" L")}`);
    };
    for(let latitude=-75;latitude<=75;latitude+=15){line(Array.from({length:145},(_,index)=>({longitude:-Math.PI+index*Math.PI*2/144,latitude:latitude*Math.PI/180})));}
    for(let longitude=0;longitude<360;longitude+=15){line(Array.from({length:145},(_,index)=>({longitude:longitude*Math.PI/180,latitude:(-Math.PI/2+index*Math.PI/144)})));}
    return paths;
  },[rotation]);
  return <svg className={styles.earth} viewBox="0 0 500 500" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="tagSphereOcean" cx="35%" cy="29%" r="76%"><stop offset="0" stopColor="#3d91a5" stopOpacity=".3"/><stop offset=".58" stopColor="#17485c" stopOpacity=".24"/><stop offset="1" stopColor="#081b29" stopOpacity=".16"/></radialGradient>
      <radialGradient id="tagSphereLight" cx="27%" cy="22%" r="80%"><stop offset="0" stopColor="#d4fffb" stopOpacity=".14"/><stop offset=".47" stopColor="#43d4dc" stopOpacity=".025"/><stop offset="1" stopColor="#031421" stopOpacity=".08"/></radialGradient>
      <clipPath id="tagSphereClip"><circle cx="250" cy="250" r="224"/></clipPath>
      <filter id="tagSphereGlow" x="-45%" y="-45%" width="190%" height="190%"><feGaussianBlur stdDeviation="20"/></filter>
    </defs>
    <circle cx="250" cy="250" r="230" fill="#35a9b7" opacity=".1" filter="url(#tagSphereGlow)"/>
    <circle cx="250" cy="250" r="225" fill="url(#tagSphereOcean)" stroke="#6de8f3" strokeOpacity=".62" strokeWidth="1.6"/>
    <g clipPath="url(#tagSphereClip)" fill="none" stroke="#b7f6fa" strokeOpacity=".18" strokeWidth="1.05">
      {gridPaths.map((path,index)=><path key={index} d={path}/>) }
      <circle cx="250" cy="250" r="224" fill="url(#tagSphereLight)" stroke="none"/>
    </g>
    <circle cx="250" cy="250" r="224" fill="none" stroke="#b8fff0" strokeOpacity=".42"/>
  </svg>;
}
