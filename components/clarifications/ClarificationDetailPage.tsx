"use client";

import Link from "@/components/shell/LocalizedLink";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import type {PublicClarification} from "@/lib/clarifications";
import type {Locale} from "@/lib/i18n/catalog";
import {PostReactions} from "@/components/public-posts/PostReactions";
import {SharePostControls} from "@/components/public-posts/SharePostControls";
import {clarificationCopy} from "@/components/clarifications/copy";
import styles from "./ClarificationDetailPage.module.css";

const dates:Record<Locale,string>={"zh-CN":"zh-CN",en:"en-MY",ms:"ms-MY"};
export function ClarificationDetailPage({post,status}:{post:PublicClarification|null;status:"ready"|"unavailable"|"removed"|"missing"}){
  const {locale}=usePreferences();const t=clarificationCopy[locale];
  if(!post)return <div className={styles.page} lang={locale}><section className={styles.panel} role="status"><p className={styles.eyebrow}>{t.detailLabel}</p><h1>{status==="removed"?t.unavailable:status==="unavailable"?t.unavailable:t.empty}</h1><Link href="/clarifications">{t.back}</Link></section></div>;
  if(!post.referencedStory)return <div className={styles.page} lang={locale}><section className={styles.panel} role="status"><p className={styles.eyebrow}>{t.detailLabel}</p><span className={styles.badge}>{t.clarificationBadge}</span><h1>{t.sonUnavailable}</h1><Link href="/clarifications">{t.back}</Link></section></div>;
  const date=new Intl.DateTimeFormat(dates[locale],{dateStyle:"medium",timeZone:"Asia/Kuala_Lumpur"}).format(new Date(post.last_listed_at));
  const sonHref=post.referencedStory?`/posts/${post.referencedStory.post_id}`:null;
  return <div className={styles.page} lang={locale}><article className={styles.panel}>
    <p className={styles.eyebrow}>{t.detailLabel}</p><span className={styles.badge}>{t.clarificationBadge}</span><h1>{post.approved_title}</h1>
    <p className={styles.name}>{post.primary_name}</p><p className={styles.meta}>{t.area} · {post.public_area_name}<span aria-hidden="true"> · </span>{t.date} · {date}</p>
    <section className={styles.son} aria-labelledby="clarification-son-heading"><h2 id="clarification-son-heading">{t.sonLabel}</h2>{post.referencedStory&&sonHref?<><p className={styles.sonName}>{post.referencedStory.primary_name}</p><h3><Link href={sonHref}>{post.referencedStory.approved_title}</Link></h3><p>{post.referencedStory.public_area_name}</p></>:<p>{t.sonUnavailable}</p>}</section>
    <section className={styles.preview}><h2>{t.preview}</h2><p>{post.public_excerpt}</p></section>
    {post.fullBody!==null?<section className={styles.body} id="full-content"><h2>{t.body}</h2>{post.fullBody.split(/\n\s*\n/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</section>:<section className={styles.wall}><h2>{t.readWallTitle}</h2><p>{t.readWall}</p><div><Link href={`/account?next=${encodeURIComponent(`/clarifications/${post.post_id}#full-content`)}`}>{t.signIn}</Link><Link href={`/account/signup?next=${encodeURIComponent(`/clarifications/${post.post_id}#full-content`)}`}>{t.signUp}</Link></div></section>}
    {post.public_tag_labels.length>0&&<ul className={styles.tags} aria-label={t.tags}>{post.public_tag_labels.map((tag,index)=><li key={`${post.post_id}-${index}`}>{tag}</li>)}</ul>}
    <PostReactions postId={post.post_id} reactions={post.reactions} signedIn={post.signedIn} canReact={post.canReact} locale={locale}/>
    <SharePostControls title={post.approved_title} primaryName={post.primary_name} area={post.public_area_name} excerpt={post.public_excerpt}/>
    {sonHref&&<Link className={styles.request} href={`/clarifications?son=${post.referencedStory?.post_id}#request`}>{t.requestFromSon}</Link>}<Link className={styles.back} href="/clarifications">← {t.back}</Link>
  </article></div>;
}
