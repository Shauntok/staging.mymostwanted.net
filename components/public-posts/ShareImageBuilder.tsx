"use client";

import {useEffect,useRef,useState} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {QRCodeSVG} from "qrcode.react";
import styles from "./ShareImageBuilder.module.css";

const copy={
  "zh-CN":{title:"分享图片",post:"帖子 4:5",story:"限时动态 9:16",preview:"分享图片预览",download:"下载 PNG 图片",share:"分享图片",unsupported:"此浏览器无法分享图片，请下载后手动分享。",failed:"暂时无法分享图片，请下载后手动分享。",caption:"已审核公开内容",scan:"扫码查看公开页面"},
  en:{title:"Share image",post:"Post 4:5",story:"Story 9:16",preview:"Share image preview",download:"Download PNG image",share:"Share image",unsupported:"This browser cannot share image files. Download the image to share it manually.",failed:"The image could not be shared. Download it and share it manually.",caption:"REVIEWED PUBLIC CONTENT",scan:"SCAN TO VIEW PUBLIC PAGE"},
  ms:{title:"Imej perkongsian",post:"Hantaran 4:5",story:"Story 9:16",preview:"Pratonton imej perkongsian",download:"Muat turun imej PNG",share:"Kongsi imej",unsupported:"Pelayar ini tidak dapat berkongsi fail imej. Muat turun imej untuk berkongsi secara manual.",failed:"Imej tidak dapat dikongsi. Muat turun dan kongsikannya secara manual.",caption:"KANDUNGAN AWAM DISEMAK",scan:"IMBAS UNTUK MELIHAT HALAMAN AWAM"},
} as const;

type Ratio="post"|"story";

function wrapText(context:CanvasRenderingContext2D,value:string,maxWidth:number,maxLines:number){
  const lines:string[]=[];
  let line="";
  for(const token of value.match(/\s+|[^\s]+/gu)??[]){
    if(/^\s+$/u.test(token)){
      if(line&&!line.endsWith(" "))line+=" ";
      continue;
    }
    for(const character of Array.from(token)){
      if(line&&context.measureText(line+character).width>maxWidth){
        lines.push(line.trimEnd());
        line=character;
        if(lines.length>=maxLines)break;
      }else line+=character;
    }
    if(lines.length>=maxLines)break;
  }
  if(lines.length<maxLines&&line)lines.push(line);
  if(lines.length===maxLines&&lines.join(" ").length<value.length){
    let last=lines[maxLines-1];
    while(last&&context.measureText(`${last}…`).width>maxWidth)last=last.slice(0,-1);
    lines[maxLines-1]=`${last.trimEnd()}…`;
  }
  return lines;
}

export function ShareImageBuilder({url,title,primaryName,area,excerpt}:{url:string;title:string;primaryName:string;area:string;excerpt:string}){
  const {locale}=usePreferences();
  const t=copy[locale];
  const [ratio,setRatio]=useState<Ratio>("post");
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const qrRef=useRef<HTMLDivElement>(null);
  const [ready,setReady]=useState(false);
  const [status,setStatus]=useState("");
  const safeExcerpt=excerpt.split(/\r?\n/).slice(0,5).join(" ").trim().slice(0,400);

  useEffect(()=>{
    const canvas=canvasRef.current;
    const svg=qrRef.current?.querySelector("svg");
    const context=canvas?.getContext("2d");
    if(!canvas||!svg||!context||!url){setReady(false);return;}
    setReady(false);
    const width=1080;
    const height=ratio==="post"?1350:1920;
    canvas.width=width;
    canvas.height=height;
    const qrCopy=svg.cloneNode(true) as SVGSVGElement;
    qrCopy.setAttribute("xmlns","http://www.w3.org/2000/svg");
    const qrUrl=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(qrCopy)],{type:"image/svg+xml;charset=utf-8"}));
    const qrImage=new Image();
    qrImage.onload=()=>{
      const background=context.createLinearGradient(0,0,width,height);
      background.addColorStop(0,"#effaff");
      background.addColorStop(1,"#dff2fb");
      context.fillStyle=background;
      context.fillRect(0,0,width,height);
      context.strokeStyle="rgba(0,158,190,.08)";
      context.lineWidth=1;
      for(let x=0;x<=width;x+=48){context.beginPath();context.moveTo(x,0);context.lineTo(x,height);context.stroke();}
      for(let y=0;y<=height;y+=48){context.beginPath();context.moveTo(0,y);context.lineTo(width,y);context.stroke();}
      context.fillStyle="#fff";
      context.shadowColor="rgba(16,42,69,.12)";
      context.shadowBlur=34;
      context.shadowOffsetY=12;
      context.beginPath();
      context.roundRect(54,54,width-108,height-108,34);
      context.fill();
      context.shadowColor="transparent";
      context.shadowBlur=0;
      context.shadowOffsetY=0;
      context.fillStyle="#10b5c5";
      context.beginPath();
      context.roundRect(96,96,10,92,5);
      context.fill();
      context.fillStyle="#102a45";
      context.font="800 58px Arial, sans-serif";
      context.fillText("MMWR",132,156);
      context.fillStyle="#59738d";
      context.font="22px Arial, sans-serif";
      context.fillText("MALAYSIA MOST WANTED RANKING",134,190);
      context.fillStyle="#07899c";
      context.font="700 18px Arial, sans-serif";
      context.fillText(t.caption.toUpperCase(),104,260);

      const maxTextWidth=width-208;
      context.fillStyle="#102a45";
      context.font="700 58px Arial, sans-serif";
      const nameLines=wrapText(context,primaryName,maxTextWidth,2);
      let y=352;
      for(const line of nameLines){context.fillText(line,100,y);y+=72;}
      context.fillStyle="#07899c";
      context.font="600 40px Arial, sans-serif";
      const titleLines=wrapText(context,title,maxTextWidth,2);
      y+=16;
      for(const line of titleLines){context.fillText(line,102,y);y+=54;}
      context.fillStyle="#59738d";
      context.font="26px Arial, sans-serif";
      y+=8;
      context.fillText(area,104,y);
      y+=48;
      context.strokeStyle="#d9e8ef";
      context.beginPath();context.moveTo(104,y);context.lineTo(width-104,y);context.stroke();
      y+=58;
      context.fillStyle="#29435d";
      context.font="31px Arial, sans-serif";
      const excerptLines=wrapText(context,safeExcerpt,width-230,ratio==="post"?5:8);
      for(const line of excerptLines){context.fillText(line,104,y);y+=48;}

      const qrSize=160;
      const qrX=width-104-qrSize;
      const qrY=height-104-qrSize-48;
      context.fillStyle="#fff";
      context.beginPath();context.roundRect(qrX-8,qrY-8,qrSize+16,qrSize+16,10);context.fill();
      context.drawImage(qrImage,qrX,qrY,qrSize,qrSize);
      context.fillStyle="#59738d";
      context.font="700 15px Arial, sans-serif";
      context.fillText(t.scan.toUpperCase(),104,height-145);
      context.font="21px Arial, sans-serif";
      const host=new URL(url).host;
      context.fillText(host,104,height-108);
      URL.revokeObjectURL(qrUrl);
      setReady(true);
    };
    qrImage.onerror=()=>{URL.revokeObjectURL(qrUrl);setReady(false);};
    qrImage.src=qrUrl;
    return()=>{URL.revokeObjectURL(qrUrl);qrImage.onload=null;};
  },[area,locale,primaryName,ratio,safeExcerpt,t.caption,t.scan,title,url]);

  const pngFile=async()=>{
    const canvas=canvasRef.current;
    if(!canvas||!ready)return null;
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));
    return blob?new File([blob],`mmwr-share-${ratio}.png`,{type:"image/png"}):null;
  };

  const download=async()=>{
    const file=await pngFile();
    if(!file)return;
    const objectUrl=URL.createObjectURL(file);
    const link=document.createElement("a");
    link.href=objectUrl;
    link.download=file.name;
    link.click();
    window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
  };

  const shareImage=async()=>{
    const file=await pngFile();
    if(!file)return;
    if(!navigator.share||!navigator.canShare?.({files:[file]})){setStatus(t.unsupported);return;}
    try{await navigator.share({files:[file],title,text:title,url});setStatus("");}catch(error){
      if(error&&typeof error==="object"&&"name" in error&&error.name==="AbortError")return;
      setStatus(t.failed);
    }
  };

  return <details className={styles.panel}>
    <summary>{t.title}</summary>
    <div className={styles.ratios} role="group" aria-label={t.title}>
      <button type="button" aria-pressed={ratio==="post"} onClick={()=>setRatio("post")}>{t.post}</button>
      <button type="button" aria-pressed={ratio==="story"} onClick={()=>setRatio("story")}>{t.story}</button>
    </div>
    <p className={styles.caption}>{t.preview}</p>
    <canvas ref={canvasRef} className={styles.preview} role="img" aria-label={`${title} · ${primaryName} · ${area}`}/>
    <div ref={qrRef} className={styles.qrSource} aria-hidden="true"><QRCodeSVG value={url} size={188} level="M" marginSize={4}/></div>
    <div className={styles.actions}>
      <button type="button" className="button button-outline" disabled={!ready} onClick={download}>{t.download}</button>
      <button type="button" className="button button-primary" disabled={!ready} onClick={shareImage}>{t.share}</button>
    </div>
    {status&&<p className={styles.status} role="status">{status}</p>}
  </details>;
}
