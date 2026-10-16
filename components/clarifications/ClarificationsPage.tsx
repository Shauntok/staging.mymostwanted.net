"use client";

import {PublicPostGrid} from "@/components/public-posts/PublicPostGrid";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import type {PublicClarificationListPost} from "@/lib/clarifications";
import type {Locale} from "@/lib/i18n/catalog";
import {clarificationCopy} from "@/components/clarifications/copy";
import {ClarificationRequestDraft} from "@/components/clarifications/ClarificationRequestDraft";
import styles from "./ClarificationsPage.module.css";

const demoUnavailable:Record<Locale,string>={"zh-CN":"真实澄清内容暂时无法载入；下方卡片仅供本地界面演示，并非真实帖子。",en:"Live clarification posts could not be loaded. The card below is only a local UI demo, not a real post.",ms:"Penjelasan sebenar tidak dapat dimuatkan buat masa ini. Kad di bawah hanyalah demo UI tempatan, bukan hantaran sebenar."};

export function ClarificationsPage({posts,status,hasNextPage,page,supportUrl,canonicalOrigin,initialPost,showDemo}:{posts:PublicClarificationListPost[];status:"ready"|"empty"|"unavailable";hasNextPage:boolean;page:number;supportUrl:string|null;canonicalOrigin:string|null;initialPost:{post_id:string;approved_title:string;primary_name:string;public_area_name:string;content_type:"story"}|null;showDemo:boolean}){
  const {locale}=usePreferences();
  const t=clarificationCopy[locale];
  const showDemoCard=showDemo&&page===1;

  return <div className={styles.page} lang={locale}>
    <header className={styles.header}>
      <p className={styles.eyebrow}>MMWR · CLARIFICATIONS</p>
      <h1>{t.directoryTitle}</h1>
      <p>{t.directoryIntro}</p>
    </header>
    {status==="unavailable"&&<p className={styles.message} role="status">{showDemoCard?demoUnavailable[locale]:t.unavailable}</p>}
    {status==="empty"&&!showDemoCard&&<p className={styles.message} role="status">{t.empty}</p>}
    {showDemoCard&&<section className={styles.cards} aria-label={t.directoryTitle}>
      <article className={`${styles.card} ${styles.demoCard}`}>
        <span className={`${styles.badge} ${styles.demoBadge}`}>{t.demoBadge}</span>
        <p className={styles.name}>MMWR</p>
        <h2>{t.demoTitle}</h2>
        <p className={styles.meta}>{t.demoArea}</p>
        <p className={styles.excerpt}>{t.demoExcerpt}</p>
        <section className={styles.related} aria-label={t.sonLabel}>
          <h3>{t.sonLabel}</h3>
          <p>{t.demoIntro}</p>
        </section>
      </article>
    </section>}
    {posts.length>0&&<PublicPostGrid posts={posts} status="ready" page={page} hasNextPage={hasNextPage} basePath="/clarifications" heading={t.directoryTitle} hideHeader/>}
    <ClarificationRequestDraft supportUrl={supportUrl} canonicalOrigin={canonicalOrigin} initialPost={initialPost}/>
  </div>;
}