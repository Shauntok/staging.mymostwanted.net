"use client";

import {useRef,useState,useSyncExternalStore} from "react";
import {usePathname} from "next/navigation";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {QRCodeSVG} from "qrcode.react";
import {ShareImageBuilder} from "@/components/public-posts/ShareImageBuilder";
import {buildPublicShareTargets,isPublicHttpsOrigin,isPublicShareHostname} from "@/lib/public-share-targets.mjs";
import styles from "./SharePostControls.module.css";

const copy={
  "zh-CN":{title:"分享此内容",share:"系统分享",shareHint:"Instagram、TikTok、Threads、Messenger 和微信可从系统分享菜单选择；不支持时可复制公开链接。",copy:"复制链接",copied:"链接已复制。",fallback:"无法自动复制，请复制下方链接。",failed:"暂时无法分享，请复制链接后自行分享。",link:"帖子链接",platforms:"分享到",whatsapp:"WhatsApp",telegram:"Telegram",facebook:"Facebook",x:"X",snapchat:"Snapchat",qr:"显示二维码",qrCaption:"扫描二维码打开此公开页面",downloadQr:"下载二维码 SVG",localPreview:"当前为预览环境。配置可公开访问的 HTTPS 站点地址后，才能生成可用的分享链接、二维码和分享图片。"},
  en:{title:"Share this post",share:"Share",shareHint:"Choose Instagram, TikTok, Threads, Messenger, or WeChat from your device’s share menu; copy the public link if it is unavailable.",copy:"Copy link",copied:"Link copied.",fallback:"Copy the link below to share it.",failed:"Sharing is unavailable. Copy the link and share it manually.",link:"Post link",platforms:"Share on",whatsapp:"WhatsApp",telegram:"Telegram",facebook:"Facebook",x:"X",snapchat:"Snapchat",qr:"Show QR code",qrCaption:"Scan to open this public page",downloadQr:"Download QR code SVG",localPreview:"This preview environment needs a publicly reachable HTTPS site URL before usable share links, QR codes, and share images can be created."},
  ms:{title:"Kongsi hantaran ini",share:"Kongsi",shareHint:"Pilih Instagram, TikTok, Threads, Messenger atau WeChat melalui menu perkongsian peranti; salin pautan awam jika pilihan itu tiada.",copy:"Salin pautan",copied:"Pautan disalin.",fallback:"Salin pautan di bawah untuk berkongsi.",failed:"Perkongsian tidak tersedia. Salin pautan dan kongsikannya secara manual.",link:"Pautan hantaran",platforms:"Kongsi di",whatsapp:"WhatsApp",telegram:"Telegram",facebook:"Facebook",x:"X",snapchat:"Snapchat",qr:"Paparkan kod QR",qrCaption:"Imbas untuk membuka halaman awam ini",downloadQr:"Muat turun SVG kod QR",localPreview:"Ini persekitaran pratonton. Konfigurasikan URL HTTPS yang boleh dicapai umum untuk menghasilkan pautan, kod QR dan imej perkongsian yang boleh digunakan."},
} as const;

type BrowserEnvironment={runtimeOrigin:string|null;canShare:boolean};
const subscribeToBrowserEnvironment=(onChange:()=>void)=>{
  window.addEventListener("focus",onChange);
  window.addEventListener("pageshow",onChange);
  return()=>{window.removeEventListener("focus",onChange);window.removeEventListener("pageshow",onChange);};
};

function getBrowserEnvironmentSnapshot(){
  const runtimeUrl=new URL(window.location.origin);
  const runtimeOrigin=runtimeUrl.protocol==="https:"&&isPublicShareHostname(runtimeUrl.hostname)?runtimeUrl.origin:null;
  return JSON.stringify({runtimeOrigin,canShare:typeof navigator.share==="function"} satisfies BrowserEnvironment);
}

const getServerBrowserEnvironmentSnapshot=()=>JSON.stringify({runtimeOrigin:null,canShare:false} satisfies BrowserEnvironment);
const configuredSiteOrigin=process.env.NEXT_PUBLIC_SITE_URL&&isPublicHttpsOrigin(process.env.NEXT_PUBLIC_SITE_URL)
  ?new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
  :null;

export function SharePostControls({title,primaryName,area,excerpt}:{title:string;primaryName:string;area:string;excerpt:string}){
  const {locale}=usePreferences();
  const pathname=usePathname();
  const text=copy[locale];
  const environment=JSON.parse(useSyncExternalStore(subscribeToBrowserEnvironment,getBrowserEnvironmentSnapshot,getServerBrowserEnvironmentSnapshot)) as BrowserEnvironment;
  const publicOrigin=configuredSiteOrigin??environment.runtimeOrigin;
  const localPreview=!publicOrigin;
  const url=publicOrigin?new URL(pathname,publicOrigin).toString():"";
  const [message,setMessage]=useState("");
  const [showFallback,setShowFallback]=useState(false);
  const qrRef=useRef<HTMLDivElement>(null);
  const shareText=[title,`${primaryName} · ${area}`,excerpt.split(/\r?\n/).slice(0,5).join(" ").trim().slice(0,400)].filter(Boolean).join(" · ");
  const shareLabels={whatsapp:text.whatsapp,telegram:text.telegram,facebook:text.facebook,x:text.x,snapchat:text.snapchat};
  const shareLinks=url&&!localPreview?buildPublicShareTargets(url,shareText).map(target=>({name:shareLabels[target.id],href:target.href})):[];
  const copyLink=async()=>{
    if(!url)return;
    try{
      await navigator.clipboard.writeText(url);
      setMessage(text.copied);
      setShowFallback(false);
    }catch{
      setMessage(text.fallback);
      setShowFallback(true);
    }
  };

  const share=async()=>{
    if(!url||!navigator.share)return;
    try{
      await navigator.share({title,text:shareText,url});
      setMessage("");
    }catch(error){
      if(error&&typeof error==="object"&&"name" in error&&error.name==="AbortError")return;
      setMessage(text.failed);
    }
  };

  const downloadQr=()=>{
    const svg=qrRef.current?.querySelector("svg");
    if(!svg)return;
    const copy=svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns","http://www.w3.org/2000/svg");
    const blob=new Blob([new XMLSerializer().serializeToString(copy)],{type:"image/svg+xml;charset=utf-8"});
    const objectUrl=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=objectUrl;
    link.download="mmwr-public-post-qr.svg";
    link.click();
    window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
  };

  return <section className={styles.panel} aria-labelledby="share-post-heading">
    <h2 id="share-post-heading">{text.title}</h2>
    <div className={styles.actions}>
      <button type="button" className="button button-outline" onClick={copyLink} disabled={!url||localPreview}>{text.copy}</button>
      {environment.canShare&&<button type="button" className="button button-primary" onClick={share} disabled={!url||localPreview}>{text.share}</button>}
    </div>
    {localPreview&&<p className={styles.status} role="status">{text.localPreview}</p>}
    {environment.canShare&&url&&!localPreview&&<p className={styles.shareHint}>{text.shareHint}</p>}
    {shareLinks.length>0&&<div className={styles.platforms} role="group" aria-label={text.platforms}><span>{text.platforms}</span>{shareLinks.map(item=><a key={item.name} href={item.href} target="_blank" rel="noopener noreferrer">{item.name}</a>)}</div>}
    {url&&!localPreview&&<details className={styles.qr}><summary>{text.qr}</summary><figure><div ref={qrRef} className={styles.qrImage}><QRCodeSVG value={url} size={188} level="M" marginSize={4}/></div><figcaption>{text.qrCaption}</figcaption></figure><button type="button" className="button button-outline" onClick={downloadQr}>{text.downloadQr}</button></details>}
    {url&&!localPreview&&<ShareImageBuilder url={url} title={title} primaryName={primaryName} area={area} excerpt={excerpt}/>}
    {message&&<p className={styles.status} role="status">{message}</p>}
    {showFallback&&<label className={styles.fallback}>{text.link}<input readOnly value={url} onFocus={event=>event.currentTarget.select()}/></label>}
  </section>;
}
