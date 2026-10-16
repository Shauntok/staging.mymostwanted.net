"use client";

import Image from "next/image";
import Link from "@/components/shell/LocalizedLink";
import {useState} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import type {PublicPost} from "@/lib/public-posts";
import {buildPublicThumbnailGridLayout} from "@/lib/public-thumbnails/grid-layout.mjs";
import {getPaginationNavigationLabel, shouldRenderPublicPagination} from "./pagination-label.mjs";
import styles from "./PublicPostGrid.module.css";

type PublicGridPost=PublicPost&{referencedStory?:Pick<PublicPost,"post_id"|"approved_title"|"primary_name"|"public_area_name">|null};

const copy={
  "zh-CN":{title:"最新公开内容",empty:"目前没有已审核并公开的内容。",unavailable:"公开内容服务暂时不可用。",area:"地区",tags:"标签",published:"公开于",read:"阅读全文",reactions:"Reaction 数",previous:"上一页",next:"下一页",page:"第",of:"页",clarification:"澄清",relatedStory:"相关公开帖子",relatedUnavailable:"相关帖子目前无法公开查看。为保护隐私，此处不显示其名称或地区。",rank:"排名"},
  en:{title:"Latest public posts",empty:"There are no reviewed public posts yet.",unavailable:"The public content service is temporarily unavailable.",area:"Area",tags:"Tags",published:"Published",read:"Read full post",reactions:"Reactions",previous:"Previous",next:"Next",page:"Page",of:"",clarification:"Clarification",relatedStory:"Related public post",relatedUnavailable:"The related post is not currently available for public viewing. Its name and area are hidden to protect privacy.",rank:"Rank"},
  ms:{title:"Hantaran awam terkini",empty:"Belum ada hantaran awam yang telah disemak.",unavailable:"Perkhidmatan kandungan awam tidak tersedia buat sementara waktu.",area:"Kawasan",tags:"Tag",published:"Diterbitkan",read:"Baca hantaran penuh",reactions:"Reaksi",previous:"Sebelumnya",next:"Seterusnya",page:"Halaman",of:"",clarification:"Penjelasan",relatedStory:"Hantaran awam berkaitan",relatedUnavailable:"Hantaran berkaitan tidak tersedia untuk paparan awam buat masa ini. Nama dan kawasannya disembunyikan bagi melindungi privasi.",rank:"Kedudukan"},
} as const;
const localeTag={"zh-CN":"zh-CN",en:"en-MY",ms:"ms-MY"} as const;

export function PublicPostGrid({posts,status,page=1,hasNextPage=false,basePath,heading,hideHeader=false,gridClassName,rankStart}:{posts:PublicGridPost[];status:"ready"|"empty"|"unavailable";page?:number;hasNextPage?:boolean;basePath?:string;heading?:string;hideHeader?:boolean;gridClassName?:string;rankStart?:number}){
  const {locale}=usePreferences();const t=copy[locale];
  const [failedThumbnailPosts,setFailedThumbnailPosts]=useState<Set<string>>(()=>new Set());
  return <>
    {basePath&&!hideHeader&&<header className={styles.header}><p>MMWR · PUBLIC POSTS</p><h1>{heading??t.title}</h1></header>}
    {status!=="ready"?<p className={styles.message} role="status">{status==="unavailable"?t.unavailable:t.empty}</p>:<div className={gridClassName??styles.grid}>{posts.map((post,index)=>{
      const thumbnailLayout=buildPublicThumbnailGridLayout(
        post.public_thumbnail_count??0,
        failedThumbnailPosts.has(post.post_id)?[0]:[],
      );
      return <article className={styles.card} key={post.post_id}>
        <div className={styles.visual} aria-hidden="true">{thumbnailLayout.slots.length>0?<div className={styles.imageGrid} data-count={thumbnailLayout.slots.length}>{thumbnailLayout.slots.map(({position})=><Image key={`${post.post_id}-${position}`} src={`/api/public/posts/${post.post_id}/thumbnails/${position}`} width={960} height={640} sizes="(max-width: 680px) 100vw, 50vw" unoptimized alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailedThumbnailPosts(current=>{
          if(current.has(post.post_id))return current;
          const next=new Set(current);
          next.add(post.post_id);
          return next;
        })}/>)}{thumbnailLayout.moreCount>0&&<span className={styles.moreImages}>+{thumbnailLayout.moreCount}</span>}</div>:<i>MMWR</i>}{rankStart!==undefined&&<span className={styles.rankBadge}>{rankStart+index}</span>}</div>
        <div className={styles.body}>{rankStart!==undefined&&<p className={styles.srOnly}>{t.rank} {rankStart+index}</p>}{post.content_type==="clarification"&&<p className={styles.kicker}>{t.clarification}</p>}<p className={styles.kicker}>{post.primary_name}</p><h2><Link href={post.content_type==="clarification"?`/clarifications/${post.post_id}`:`/posts/${post.post_id}`}>{post.approved_title}</Link></h2><p className={styles.area}>{t.area} · {post.public_area_name}</p><p className={styles.excerpt}>{post.public_excerpt}</p>{post.content_type==="clarification"&&post.referencedStory!==undefined&&<section className={styles.related} aria-label={t.relatedStory}><h3>{t.relatedStory}</h3>{post.referencedStory?<><p>{post.referencedStory.primary_name} · {post.referencedStory.public_area_name}</p><Link href={`/posts/${post.referencedStory.post_id}`}>{post.referencedStory.approved_title} →</Link></>:<p>{t.relatedUnavailable}</p>}</section>}{post.public_tag_labels.length>0&&<ul className={styles.tags} aria-label={t.tags}>{post.public_tag_labels.map((tag,i)=><li key={`${post.post_id}-${i}`}>{tag}</li>)}</ul>}<time className={styles.date} dateTime={post.last_listed_at}>{t.published} · {new Intl.DateTimeFormat(localeTag[locale],{dateStyle:"medium",timeZone:"Asia/Kuala_Lumpur"}).format(new Date(post.last_listed_at))}</time>{post.reaction_count!==undefined&&post.reaction_count!==null&&<p className={styles.reactionCount} aria-label={`${t.reactions}: ${post.reaction_count}`}><span aria-hidden="true">♡</span> {new Intl.NumberFormat(localeTag[locale]).format(post.reaction_count)} {t.reactions}</p>}<Link className={styles.readLink} href={post.content_type==="clarification"?`/clarifications/${post.post_id}`:`/posts/${post.post_id}`}>{t.read} →</Link></div>
      </article>;
    })}</div>}
    {basePath&&shouldRenderPublicPagination({status,hasResults:posts.length>0,hasBasePath:true,page,hasNextPage})&&<nav className={styles.pagination} aria-label={getPaginationNavigationLabel(locale)}>
      {page>1?<Link href={`${basePath}${basePath.includes("?")?"&":"?"}page=${page-1}`} rel="prev">← {t.previous}</Link>:<span/>}<span aria-current="page">{t.page} {page} {t.of}</span>{hasNextPage?<Link href={`${basePath}${basePath.includes("?")?"&":"?"}page=${page+1}`} rel="next">{t.next} →</Link>:<span/>}
    </nav>}
  </>;
}
