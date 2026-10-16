"use client";

import {useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from "react";
import {DistrictBoundaries,type DistrictFitBounds} from "@/components/maps/DistrictBoundaries";
import {malaysiaMapAreas} from "@/lib/maps/malaysia-map-areas";
import {singaporePath} from "@/lib/maps/singapore";
import type {Locale} from "@/lib/i18n/catalog";
import {copy} from "@/lib/i18n/catalog";
import {stateDisplayName} from "@/lib/maps/state-labels";
import {clampAreaMapZoom,constrainAreaMapPan,getAreaMapInteractionTransform} from "./selected-area-map-view.mjs";
import styles from "./AreaBrowsePage.module.css";

const paths=[...malaysiaMapAreas,{name:"Singapore",d:singaporePath,districtFitD:singaporePath}];

type SelectedAreaMapProps={area:string;locale:Locale;districts:{id:string;name:string;publicPostCount:number}[]};

export function SelectedAreaMap(props:SelectedAreaMapProps){
  return <SelectedAreaMapView key={props.area} {...props}/>;
}

function SelectedAreaMapView({area,locale,districts}:SelectedAreaMapProps){
  const pathRef=useRef<SVGPathElement|null>(null);
  const fitPathRef=useRef<SVGPathElement|null>(null);
  const dragStart=useRef<{x:number;y:number;panX:number;panY:number;pointerId:number}|null>(null);
  const dragged=useRef(false);
  const [layout,setLayout]=useState<{transform:string;districtFitBounds:DistrictFitBounds;fittedSize:{width:number;height:number}}|null>(null);
  const [zoom,setZoom]=useState(1);
  const [pan,setPan]=useState({x:0,y:0});
  const [isPanning,setIsPanning]=useState(false);
  const districtCounts=useMemo(()=>Object.fromEntries(districts.map(district=>[district.name,{id:district.id,count:district.publicPostCount}])),[districts]);
  useEffect(()=>{
    const path=pathRef.current;
    const fitPath=fitPathRef.current;
    if(!path||!fitPath)return;
    const bounds=path.getBBox();const fitBounds=fitPath.getBBox();
    if(!bounds.width||!bounds.height||!fitBounds.width||!fitBounds.height)return;
    const scale=Math.min(720/bounds.width,390/bounds.height);
    const x=500-(bounds.x+bounds.width/2)*scale;
    const y=220-(bounds.y+bounds.height/2)*scale;
    setLayout({transform:`translate(${x} ${y}) scale(${scale})`,districtFitBounds:{x:fitBounds.x,y:fitBounds.y,width:fitBounds.width,height:fitBounds.height},fittedSize:{width:bounds.width*scale,height:bounds.height*scale}});
  },[area]);
  const selected=paths.find(item=>item.name===area);
  const mapLabel=locale==="zh-CN"?`${stateDisplayName(locale,area)}示意地图`:locale==="ms"?`Peta panduan ${stateDisplayName(locale,area)}`:`${stateDisplayName(locale,area)} map outline`;
  const t=copy[locale];
  const viewTransform=getAreaMapInteractionTransform(zoom,pan);
  const zoomBy=(amount:number)=>{
    const next=clampAreaMapZoom(zoom+amount);
    setZoom(next);
    setPan(current=>layout?constrainAreaMapPan(current,next,layout.fittedSize):{x:0,y:0});
  };
  const resetView=()=>{setZoom(1);setPan({x:0,y:0});};
  const startPan=(event:ReactPointerEvent<SVGSVGElement>)=>{
    if(zoom<=1||(event.pointerType==="mouse"&&event.button!==0))return;
    dragStart.current={x:event.clientX,y:event.clientY,panX:pan.x,panY:pan.y,pointerId:event.pointerId};
    dragged.current=false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePan=(event:ReactPointerEvent<SVGSVGElement>)=>{
    const start=dragStart.current;
    if(!start||start.pointerId!==event.pointerId||!layout)return;
    const bounds=event.currentTarget.getBoundingClientRect();
    const dx=(event.clientX-start.x)*1000/bounds.width;
    const dy=(event.clientY-start.y)*440/bounds.height;
    if(Math.abs(dx)>2||Math.abs(dy)>2){
      dragged.current=true;setIsPanning(true);
      setPan(constrainAreaMapPan({x:start.panX+dx,y:start.panY+dy},zoom,layout.fittedSize));
    }
  };
  const endPan=(event?:ReactPointerEvent<SVGSVGElement>)=>{
    if(event&&dragStart.current?.pointerId!==event.pointerId)return;
    dragStart.current=null;setIsPanning(false);
  };
  return <>
    <div className={styles.selectedMapControls} role="group" aria-label={t.mapControls}>
      <button type="button" aria-label={t.mapZoomIn} disabled={!layout||zoom>=12} onClick={()=>zoomBy(0.4)}>+</button>
      <button type="button" aria-label={t.mapZoomOut} disabled={zoom<=1} onClick={()=>zoomBy(-0.4)}>−</button>
      <button type="button" aria-label={t.mapResetZoom} disabled={zoom===1&&pan.x===0&&pan.y===0} onClick={resetView}>⌖</button>
    </div>
    <svg className={isPanning?`${styles.selectedAreaMap} ${styles.panning}`:styles.selectedAreaMap} data-ready={layout?"true":"false"} data-zoomed={zoom>1?"true":"false"} viewBox="0 0 1000 440" role="group" aria-label={mapLabel} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={endPan} onClickCapture={event=>{if(dragged.current){event.preventDefault();event.stopPropagation();dragged.current=false;}}}>
      {selected&&<>
        <g transform={layout?.transform}>
          <g transform={viewTransform}>
            <path ref={pathRef} className={styles.selectedAreaShape} d={selected.d} fillRule="evenodd"/>
            {layout&&<DistrictBoundaries region={area} fitBounds={layout.districtFitBounds} clipPathD={selected.districtFitD} locale={locale} counts={districtCounts}/>}
          </g>
        </g>
        <path ref={fitPathRef} d={selected.districtFitD} className="map-measure-target" aria-hidden="true"/>
      </>}
    </svg>
  </>;
}
