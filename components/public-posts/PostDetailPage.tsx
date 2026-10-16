"use client";

import {useEffect} from "react";
import Link from "@/components/shell/LocalizedLink";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import type {PublishedPostDetail} from "@/lib/published-post-detail";
import {SharePostControls} from "@/components/public-posts/SharePostControls";
import {PostReactions} from "@/components/public-posts/PostReactions";
import styles from "./PostDetailPage.module.css";
import {SonClarificationBanner} from "@/components/clarifications/SonClarificationBanner";

const copy = {
  "zh-CN": {eyebrow:"MMWR · 已审核公开内容", unavailableTitle:"内容暂时无法显示", unavailable:"请稍后重试，或返回浏览其他公开内容。", home:"返回首页", area:"地区", published:"最近上架", tags:"标签", preview:"公开摘要", wallTitle:"登录以继续阅读", wall:"登录或创建账号即可阅读这篇已公开内容的完整正文。投稿入口尚未开放；未来开放后，投稿需要先验证邮箱。", signin:"登录并继续阅读", signup:"创建账号", body:"公开正文", social:"公开社交资料", notice:"此页面仅显示目前已发布的审核内容。内部证据、投稿人身份及审核资料不会在此公开。", emptyTags:"暂无公开标签", pageUnavailable:"公开阅读服务暂时不可用。请稍后重试。"},
  en: {eyebrow:"MMWR · REVIEWED PUBLIC CONTENT", unavailableTitle:"This content is temporarily unavailable", unavailable:"Try again later or return to browse other public content.", home:"Back to home", area:"Area", published:"Last listed", tags:"Tags", preview:"Public summary", wallTitle:"Sign in to keep reading", wall:"Sign in or create an account to read the full text of this published post. Submissions are not open yet. When they are, you will need a verified email to submit.", signin:"Sign in and continue", signup:"Create an account", body:"Public post", social:"Public social profiles", notice:"This page shows content that is currently published. Internal evidence, submitter identity and review material are not public.", emptyTags:"No public tags", pageUnavailable:"The public reading service is temporarily unavailable. Try again later."},
  ms: {eyebrow:"MMWR · KANDUNGAN AWAM DISEMAK", unavailableTitle:"Kandungan ini tidak tersedia buat sementara waktu", unavailable:"Cuba lagi kemudian atau kembali untuk melihat kandungan awam yang lain.", home:"Kembali ke laman utama", area:"Kawasan", published:"Disenaraikan terakhir", tags:"Tag", preview:"Ringkasan awam", wallTitle:"Log masuk untuk terus membaca", wall:"Log masuk atau cipta akaun untuk membaca teks penuh hantaran yang diterbitkan ini. Penghantaran hantaran belum dibuka. Jika dibuka kelak, alamat e-mel anda perlu disahkan untuk membuat hantaran.", signin:"Log masuk dan teruskan", signup:"Cipta akaun", body:"Hantaran awam", social:"Profil sosial awam", notice:"Halaman ini hanya memaparkan kandungan yang sedang diterbitkan. Bukti dalaman, identiti penghantar dan bahan semakan bukan untuk paparan awam.", emptyTags:"Tiada tag awam", pageUnavailable:"Perkhidmatan bacaan awam tidak tersedia buat sementara waktu. Cuba lagi kemudian."},
} as const;
const localeTag={"zh-CN":"zh-CN",en:"en-MY",ms:"ms-MY"} as const;
const validReadClientEnabled=process.env.NEXT_PUBLIC_VALID_READS_ENABLED==="true";

export function PostDetailPage({post,unavailable,postId,reactionError=false}:{post:PublishedPostDetail|null;unavailable:boolean;postId:string;reactionError?:boolean}) {
  const {locale,consent}=usePreferences();
  const t=copy[locale];
  const postBody=post?.fullBody;
  const readingPositionKey=`mmwr-post-reading-position:${postId}`;
  const rememberReadingPosition=()=>{
    try{sessionStorage.setItem(readingPositionKey,JSON.stringify({position:window.scrollY,savedAt:Date.now()}));}catch{}
  };
  useEffect(()=>{
    if(postBody==null||window.location.hash!=="#full-content")return;
    try{
      const raw=sessionStorage.getItem(readingPositionKey);
      if(!raw)return;
      sessionStorage.removeItem(readingPositionKey);
      const saved=JSON.parse(raw) as {position?:unknown;savedAt?:unknown};
      const now=Date.now();
      if(typeof saved.position!=="number"||!Number.isFinite(saved.position)||saved.position<0||typeof saved.savedAt!=="number"||!Number.isFinite(saved.savedAt)||saved.savedAt>now||now-saved.savedAt>10*60*1000)return;
      window.scrollTo({top:saved.position,behavior:"instant"});
    }catch{}
  },[postBody,readingPositionKey]);
  useEffect(()=>{
    const tokenPrefix="mmwr-valid-read-token:";
    if(!consent.analytics){
      try{for(let index=localStorage.length-1;index>=0;index--){const key=localStorage.key(index);if(key?.startsWith(tokenPrefix))localStorage.removeItem(key);}}catch{}
      return;
    }
    if(!validReadClientEnabled||postBody===null||!postBody)return;
    const postKey=postId.toLowerCase();
    const day=new Date().toISOString().slice(0,10);
    let token:string;
    try{
      const key=`${tokenPrefix}${day}`;const existing=localStorage.getItem(key);
      if(existing&&/^[0-9a-f]{32}$/.test(existing))token=existing;
      else{const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);token=Array.from(bytes,value=>value.toString(16).padStart(2,"0")).join("");localStorage.setItem(key,token);}
      for(let index=localStorage.length-1;index>=0;index--){const oldKey=localStorage.key(index);if(oldKey?.startsWith(tokenPrefix)&&oldKey!==key)localStorage.removeItem(oldKey);}
    }catch{return;}
    let visibleMilliseconds=0;let sent=false;
    const body=document.getElementById("full-content");if(!body)return;
    const reachedHalf=()=>window.scrollY+window.innerHeight>=body.getBoundingClientRect().top+window.scrollY+body.scrollHeight*0.5;
    const sendIfEligible=()=>{
      if(sent||document.visibilityState!=="visible"||visibleMilliseconds<10_000||!reachedHalf())return;
      sent=true;
      void fetch("/api/analytics/valid-read",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({postId:postKey,token,visibleSeconds:Math.floor(visibleMilliseconds/1000),scrollPercent:50}),cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer",keepalive:true}).catch(()=>undefined);
    };
    const timer=window.setInterval(()=>{if(document.visibilityState==="visible")visibleMilliseconds=Math.min(visibleMilliseconds+1000,3_600_000);sendIfEligible();},1000);
    window.addEventListener("scroll",sendIfEligible,{passive:true});document.addEventListener("visibilitychange",sendIfEligible);
    return()=>{window.clearInterval(timer);window.removeEventListener("scroll",sendIfEligible);document.removeEventListener("visibilitychange",sendIfEligible);};
  },[consent.analytics,postBody,postId]);
  if (!post) return <div className={styles.page} lang={locale}><section className={styles.panel} role="status"><p className={styles.eyebrow}>MMWR</p><h1>{t.unavailableTitle}</h1><p>{unavailable?t.pageUnavailable:t.unavailable}</p><Link href="/">{t.home}</Link></section></div>;
  const date=new Intl.DateTimeFormat(localeTag[locale],{dateStyle:"medium",timeZone:"Asia/Kuala_Lumpur"}).format(new Date(post.last_listed_at));
  const returnTo=`/posts/${postId}#full-content`;
  return <div className={styles.page} lang={locale}><article className={styles.panel}>
    <p className={styles.eyebrow}>{t.eyebrow}</p>
    <h1>{post.approved_title}</h1>
    <p className={styles.name}>{post.primary_name}</p>
    <p className={styles.meta}>{t.area} · {post.public_area_name}<span aria-hidden="true"> · </span>{t.published} · <time dateTime={post.last_listed_at}>{date}</time></p>
    {post.clarificationPostId&&<SonClarificationBanner clarificationPostId={post.clarificationPostId}/>}
    <section className={styles.preview} aria-labelledby="post-preview-heading"><h2 id="post-preview-heading">{t.preview}</h2><p>{post.public_excerpt}</p></section>
    {post.fullBody!==null?<section className={styles.body} id="full-content" aria-labelledby="post-body-heading"><h2 id="post-body-heading">{t.body}</h2>{post.fullBody.split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}<p className={styles.notice}>{t.notice}</p></section>:<section className={styles.wall} id="full-content" aria-labelledby="post-wall-heading"><h2 id="post-wall-heading">{t.wallTitle}</h2><p>{t.wall}</p><div><Link className={styles.primaryLink} href={`/account?next=${encodeURIComponent(returnTo)}`} onClick={rememberReadingPosition}>{t.signin}</Link><Link className={styles.secondaryLink} href={`/account/signup?next=${encodeURIComponent(returnTo)}`} onClick={rememberReadingPosition}>{t.signup}</Link></div></section>}
    {post.public_tag_labels.length>0?<ul className={styles.tags} aria-label={t.tags}>{post.public_tag_labels.map((tag,index)=><li key={`${post.post_id}-${index}`}>{tag}</li>)}</ul>:<p className={styles.muted}>{t.emptyTags}</p>}
    <PostReactions postId={postId} reactions={post.reactions} signedIn={post.signedIn} canReact={post.canReact} locale={locale} showError={reactionError}/>
    {post.publicSocialLinks.length>0&&<section className={styles.social} aria-label={t.social}><h2>{t.social}</h2><ul>{post.publicSocialLinks.map((item,index)=><li key={`${item.platform}-${index}`}><a href={item.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{item.platform}</a></li>)}</ul></section>}
    <SharePostControls title={post.approved_title} primaryName={post.primary_name} area={post.public_area_name} excerpt={post.public_excerpt}/>
    <Link className={styles.home} href="/">{t.home}</Link>
  </article></div>;
}
