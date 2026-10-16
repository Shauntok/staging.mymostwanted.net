"use client";

import {useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode} from "react";
import {useRouter} from "next/navigation";
import Link from "@/components/shell/LocalizedLink";
import {copy, type Locale} from "@/lib/i18n/catalog";
import {localizedPath} from "@/lib/i18n/routing";
import {malaysiaMapAreas} from "@/lib/maps/malaysia-map-areas";
import {singaporePath} from "@/lib/maps/singapore";
import {stateDisplayName} from "@/lib/maps/state-labels";

const mapPaths=[...malaysiaMapAreas,{name:"Singapore",d:singaporePath,districtFitD:singaporePath}];
const eastMalaysiaNames=new Set(["Sabah","Sarawak","W.P. Labuan"]);

export function MalaysiaMap({locale,source,totalPublicPosts=null,bare=false}:{locale:Locale;source:string;totalPublicPosts?:number|null;bare?:boolean}) {
  const t = copy[locale];
  const countryName=locale==="zh-CN"?"马来西亚":"Malaysia";
  const totalPostsLabel=locale==="zh-CN"?"全网帖子":locale==="ms"?"Jumlah hantaran awam":"All public posts";
  const formattedTotal=totalPublicPosts===null?"—":new Intl.NumberFormat(locale==="zh-CN"?"zh-CN":locale==="ms"?"ms-MY":"en-MY").format(totalPublicPosts);
  const router=useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{name:string;x:number;y:number;width:number;scale:number}|null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan,setPan]=useState({x:0,y:0});
  const [isPanning,setIsPanning]=useState(false);
  const dragStart=useRef<{x:number;y:number;panX:number;panY:number;pointerId:number}|null>(null);
  const dragged=useRef(false);
  const focusCenter=useRef<{x:number;y:number}|null>(null);
  const focusBounds=useRef<{x:number;y:number;width:number;height:number}|null>(null);
  function constrainPan(x:number,y:number,scale=zoom) {
    const bounds=focusBounds.current;
    if (!bounds) {
      const limitX=(scale-1)*500;
      const limitY=(scale-1)*195;
      return {x:Math.max(-limitX,Math.min(limitX,x)),y:Math.max(-limitY,Math.min(limitY,y))};
    }
    const clampAxis=(start:number,end:number,center:number,safeStart:number,safeEnd:number,value:number)=>{
      const transformedStart=center+scale*(start-center);
      const transformedEnd=center+scale*(end-center);
      const span=safeEnd-safeStart;
      const minPan=transformedEnd-transformedStart<=span?safeStart-transformedStart:safeStart-transformedEnd;
      const maxPan=transformedEnd-transformedStart<=span?safeEnd-transformedEnd:safeEnd-transformedStart;
      return Math.max(minPan,Math.min(maxPan,value));
    };
    return {x:clampAxis(bounds.x,bounds.x+bounds.width,500,32,968,x),y:clampAxis(bounds.y,bounds.y+bounds.height,195,58,356,y)};
  }
  function resetMap() {
    focusCenter.current=null; focusBounds.current=null; setSelected(null); setHovered(null); setZoom(1); setPan({x:0,y:0});
  }
  function focusState(path:SVGPathElement,name:string) {
    const bounds=path.getBBox(); const width=Math.max(bounds.width,1); const height=Math.max(bounds.height,1);
    const nextZoom=Math.max(1,Math.min(24,1000*0.72/width,390*0.72/height));
    const centerX=bounds.x+bounds.width/2; const centerY=bounds.y+bounds.height/2;
    focusCenter.current={x:centerX,y:centerY}; focusBounds.current={x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height};
    setSelected(name); setHovered(null);
    const centeredPan={x:-nextZoom*(centerX-500),y:-nextZoom*(centerY-195)};
    setPan(constrainPan(centeredPan.x,centeredPan.y,nextZoom)); setZoom(nextZoom);
  }
  function showStateLabel(path:SVGPathElement,name:string) {
    const bounds=path.getBBox(); const label=stateDisplayName(locale,name);
    const svgWidth=path.ownerSVGElement?.getBoundingClientRect().width??1000; const scale=1000/(svgWidth*zoom);
    const width=Math.min(190,Math.max(64,label.length*(locale==="zh-CN"?14:7)+20))*scale;
    setHovered({name,x:Math.max(width/2+8,Math.min(992-width/2,bounds.x+bounds.width/2)),y:Math.max(40+28*scale,bounds.y),width,scale});
  }
  function startPan(event:ReactPointerEvent<SVGSVGElement>) {
    if (zoom<=1||(event.pointerType==="mouse"&&event.button!==0)) return;
    dragStart.current={x:event.clientX,y:event.clientY,panX:pan.x,panY:pan.y,pointerId:event.pointerId}; dragged.current=false;
    const captureTarget=event.target instanceof SVGElement?event.target:event.currentTarget; captureTarget.setPointerCapture(event.pointerId);
  }
  function movePan(event:ReactPointerEvent<SVGSVGElement>) {
    const start=dragStart.current; if (!start||start.pointerId!==event.pointerId) return;
    const bounds=event.currentTarget.getBoundingClientRect(); const dx=(event.clientX-start.x)*1000/bounds.width; const dy=(event.clientY-start.y)*390/bounds.height;
    if (Math.abs(dx)>2||Math.abs(dy)>2) {dragged.current=true;setIsPanning(true);setPan(constrainPan(start.panX+dx,start.panY+dy));}
  }
  function endPan(event?:ReactPointerEvent<SVGSVGElement>) {if(event&&dragStart.current?.pointerId!==event.pointerId)return;dragStart.current=null;setIsPanning(false);}
  function zoomBy(amount:number) {
    const next=Math.max(1,Math.min(24,zoom+amount)); setZoom(next);
    if(focusCenter.current){setPan((current)=>constrainPan(current.x+(zoom-next)*(focusCenter.current!.x-500),current.y+(zoom-next)*(focusCenter.current!.y-195),next));return;}
    setPan((current)=>({x:Math.max(-(next-1)*500,Math.min((next-1)*500,current.x)),y:Math.max(-(next-1)*195,Math.min((next-1)*195,current.y))}));
  }
  function renderMapPath({name,d}:typeof mapPaths[number]) {
    const label=stateDisplayName(locale,name);const active=selected===name;const hidden=Boolean(selected&&!active);const className=["map-state",active&&"map-state-selected",hidden&&"map-state-hidden"].filter(Boolean).join(" ");
    return <path key={name} className={className} d={d} fillRule="evenodd" role={hidden?undefined:"button"} tabIndex={hidden?-1:0} aria-hidden={hidden} aria-label={`${t.mapSelectState} ${label}`} aria-pressed={active} onPointerEnter={(event)=>{if(!selected&&!bare)showStateLabel(event.currentTarget,name);}} onPointerLeave={()=>setHovered(null)} onFocus={(event)=>{if(!selected&&!bare)showStateLabel(event.currentTarget,name);}} onBlur={()=>setHovered(null)} onClick={(event)=>{if(dragged.current)return;if(bare){router.push(localizedPath(`/areas?state=${encodeURIComponent(name)}`,locale));return;}focusState(event.currentTarget,name);}} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();if(bare)router.push(localizedPath(`/areas?state=${encodeURIComponent(name)}`,locale));else focusState(event.currentTarget,name);}}}/>;
  }
  function renderGlowPath({name,d}:typeof mapPaths[number]) {
    return <path key={`glow-${name}`} className="map-state-glow" d={d} fillRule="evenodd" aria-hidden="true"/>;
  }
  function renderBareLayout(paths:typeof mapPaths,renderPath:(path:typeof mapPaths[number])=>ReactNode) {
    return <g transform="translate(25 0) translate(475 195) scale(1.08) translate(-475 -195)">
      <g transform="translate(35 0)">{paths.filter(({name})=>!eastMalaysiaNames.has(name)).map(renderPath)}</g>
      <g transform="translate(-55 0)">{paths.filter(({name})=>eastMalaysiaNames.has(name)).map(renderPath)}</g>
    </g>;
  }
  return <>
    {!bare&&<div className="map-side">
      {selected?<button className="map-side-icon map-back-button" type="button" aria-label={t.mapReturn} title={t.mapReturn} onClick={resetMap}><span className="map-back-arrow" aria-hidden="true">←</span><span className="map-back-label">{t.mapBack}</span></button>:<div className="map-side-icon" aria-hidden="true">◫</div>}
      <div className="map-side-copy"><h2 id="map-title">{t.browseByState}</h2><p>{t.mapIntro}</p></div>
    </div>}
    {!bare&&selected&&<div className="map-focus-title" aria-live="polite">{stateDisplayName(locale,selected)}</div>}
    <div className="malaysia-map" role="group" aria-label={t.mapAccessibleLabel}>
      {!bare&&<div className="map-glow" aria-hidden="true"/>}
      <svg className={isPanning?"malaysia-map-svg is-panning":zoom>1?"malaysia-map-svg is-draggable":"malaysia-map-svg"} viewBox="0 0 1000 390" role="group" aria-label={t.mapAccessibleLabel} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={endPan} onPointerLeave={()=>setHovered(null)} onClickCapture={(event)=>{if(dragged.current){event.preventDefault();event.stopPropagation();dragged.current=false;}}}>
        {bare&&<defs><filter id="area-map-edge-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8"/></filter></defs>}
        {bare&&renderBareLayout(mapPaths,renderGlowPath)}
        <g className="map-zoom-group" transform={`translate(${500+pan.x} ${195+pan.y}) scale(${zoom}) translate(-500 -195)`}>
          {bare?renderBareLayout(mapPaths,renderMapPath):mapPaths.map(renderMapPath)}
          {!bare&&hovered&&<g className="map-hover-label" transform={`translate(${hovered.x} ${hovered.y})`} aria-hidden="true" pointerEvents="none"><rect x={-hovered.width/2} y={-24*hovered.scale} width={hovered.width} height={20*hovered.scale} rx={8*hovered.scale}/><text x="0" y={-14*hovered.scale} fontSize={12*hovered.scale}>{stateDisplayName(locale,hovered.name)}</text></g>}
        </g>
      </svg>
      {bare&&<div className="map-area-meta"><strong className="map-focus-title">{countryName}</strong><span>{totalPostsLabel} <b>{formattedTotal}</b></span></div>}
      {!bare&&<><div className="map-controls" role="group" aria-label={t.mapControls}><button type="button" aria-label={t.mapZoomIn} disabled={zoom>=24} onClick={()=>zoomBy(0.4)}>+</button><button type="button" aria-label={t.mapZoomOut} disabled={zoom<=1} onClick={()=>zoomBy(-0.4)}>−</button><button type="button" aria-label={t.mapResetZoom} onClick={resetMap}>⌖</button></div>
      <span className="map-watermark" aria-hidden="true">MALAYSIA</span></>}
    </div>
    {!bare&&<><div className="map-source"><details><summary>{t.mapCredits}</summary><div><p>{source} · {t.mapModified} · <a href="https://data.humdata.org/dataset/cod-ab-mys" target="_blank" rel="noreferrer">UNHCR / HDX</a> · <a href="https://creativecommons.org/licenses/by/3.0/igo/" target="_blank" rel="noreferrer">CC BY 3.0 IGO</a></p><p>{t.mapSingaporeSource} · <a href="https://www.geoboundaries.org/api/current/gbOpen/SGP/ADM0/" target="_blank" rel="noreferrer">geoBoundaries</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">ODbL 1.0</a></p></div></details><a className="map-source-link" href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">geoBoundaries</a></div>
    <div className="map-selection" aria-live="polite" aria-atomic="true">{selected?<><span>{t.mapSelectionPending}</span><Link href={`/areas?state=${encodeURIComponent(selected)}`}>{t.mapExploreSelected} →</Link></>:<span>{t.mapSelectPrompt}</span>}</div></>}
  </>;
}
