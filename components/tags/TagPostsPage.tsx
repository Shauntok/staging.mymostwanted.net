"use client";

import Link from "@/components/shell/LocalizedLink";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import type {PublicPost} from "@/lib/public-posts";
import {PublicPostGrid} from "@/components/public-posts/PublicPostGrid";

const copy={
  "zh-CN":{eyebrow:"MMWR · 标签",tag:"标签",all:"返回标签目录"},
  en:{eyebrow:"MMWR · TAG",tag:"Tag",all:"Back to all tags"},
  ms:{eyebrow:"MMWR · TAG",tag:"Tag",all:"Kembali ke semua tag"},
} as const;

export function TagPostsPage({tagLabel,posts,status,page,hasNextPage,basePath}:{tagLabel:string|null;posts:PublicPost[];status:"ready"|"empty"|"unavailable";page:number;hasNextPage:boolean;basePath:string}){
  const {locale}=usePreferences();
  const text=copy[locale];
  return <div className="content-section home-content" style={{minHeight:"70vh",paddingTop:"clamp(38px,7vw,76px)"}} lang={locale}>
    <p style={{margin:"0 0 8px",color:"var(--accent)",fontSize:10,fontWeight:700,letterSpacing:".14em"}}>{text.eyebrow}</p>
    <PublicPostGrid posts={posts} status={status} page={page} hasNextPage={hasNextPage} basePath={basePath} heading={tagLabel?`${text.tag}: ${tagLabel}`:text.tag}/>
    <Link href="/tags" style={{display:"inline-flex",marginTop:22,color:"var(--accent)",fontSize:12,fontWeight:700}}>{text.all}</Link>
  </div>;
}
