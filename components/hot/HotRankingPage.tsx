"use client";

import {usePreferences} from "@/components/shell/PreferencesProvider";
import Link from "@/components/shell/LocalizedLink";
import {PublicPostGrid} from "@/components/public-posts/PublicPostGrid";
import {getPaginationNavigationLabel, shouldRenderPublicPagination} from "@/components/public-posts/pagination-label.mjs";
import {PUBLIC_LIST_PAGE_SIZE} from "@/lib/home-config";
import type {PublicPost} from "@/lib/public-posts";
import styles from "./HotRankingPage.module.css";

const copy={
  "zh-CN":{eyebrow:"MMWR · 热门故事",title:"热门故事",status:"热门故事榜单尚未启用",active:"热门故事榜单",empty:"目前没有达到公开门槛的热门故事。",body:"榜单只使用经过限速与去重的有效阅读；没有已核实的数据时不会显示帖子或排名。",ruleTitle:"热门故事规则",rule1:"评分为最近 1 小时有效阅读 × 3，加上 6 小时 × 2 与 24 小时 × 1。",rule2:"帖子最近 24 小时至少需要 100 次有效阅读；有效阅读要求页面停留 10 秒并浏览正文至少一半。",rule3:"自然热度与 Featured / Boost 付费或人工推荐分开记录和展示。",weight:"有效阅读只在用户同意分析后计入；访客/会话、分享归因与广告点击不会进入榜单。",updates:"榜单会持续更新，翻页时帖子与名次可能变化。",slot:"热门故事位置准备中",latest:"浏览最新公开内容",slots:`热门故事列表预留 ${PUBLIC_LIST_PAGE_SIZE} 个位置`,rank:"第 {rank} 名",page:"第",of:"页",previous:"上一页",next:"下一页"},
  en:{eyebrow:"MMWR · HOT RANKED",title:"Hot Ranked",status:"The ranking is not active yet",active:"Hot Ranked posts",empty:"No post currently meets the public ranking threshold.",body:"The ranking uses rate-limited, deduplicated effective reads. Posts and ranks stay hidden when verified data is unavailable.",ruleTitle:"Ranking rules",rule1:"Score: effective reads in the last hour × 3, plus the last 6 hours × 2 and 24 hours × 1.",rule2:"A post needs at least 100 effective reads in 24 hours. A read requires 10 seconds on the visible page and scrolling through half the post.",rule3:"Organic ranking stays separate from paid or manually curated Featured / Boost placement.",weight:"Effective reads count only after Analytics consent. Visitor/session, share attribution and ad clicks are not collected for this ranking.",updates:"The ranking updates continuously, so posts and positions may shift between pages.",slot:"Ranking position reserved",latest:"Browse latest public posts",slots:`${PUBLIC_LIST_PAGE_SIZE} positions are reserved for the ranked list`,rank:"Rank {rank}",page:"Page",of:"",previous:"Previous",next:"Next"},
  ms:{eyebrow:"MMWR · KISAH POPULAR",title:"Kisah Popular",status:"Kedudukan kisah popular belum diaktifkan",active:"Kisah Popular",empty:"Tiada hantaran yang memenuhi ambang kedudukan buat masa ini.",body:"Kedudukan menggunakan bacaan berkesan yang dihadkan kadarnya dan dinyahganda. Hantaran serta kedudukan kekal tersembunyi jika data yang disahkan tiada.",ruleTitle:"Peraturan Kisah Popular",rule1:"Skor: bacaan berkesan sejam terkini × 3, ditambah 6 jam × 2 dan 24 jam × 1.",rule2:"Hantaran memerlukan sekurang-kurangnya 100 bacaan berkesan dalam 24 jam. Bacaan memerlukan 10 saat pada halaman yang kelihatan dan skrol sekurang-kurangnya separuh kandungan.",rule3:"Kedudukan organik diasingkan daripada paparan Featured / Boost berbayar atau pilihan manual.",weight:"Bacaan berkesan dikira selepas persetujuan Analytics sahaja. Pelawat/sesi, atribusi perkongsian dan klik iklan tidak dikumpulkan untuk kedudukan ini.",updates:"Kedudukan sentiasa dikemas kini; hantaran dan nombor kedudukan mungkin berubah antara halaman.",slot:"Ruang kisah popular disediakan",latest:"Lihat hantaran awam terkini",slots:`${PUBLIC_LIST_PAGE_SIZE} ruang disediakan untuk senarai kisah popular`,rank:"Kedudukan {rank}",page:"Halaman",of:"",previous:"Sebelumnya",next:"Seterusnya"},
} as const;

export function HotRankingPage({posts,status,page,hasNextPage}:{posts:PublicPost[];status:"ready"|"empty"|"unavailable";page:number;hasNextPage:boolean}){
  const {locale}=usePreferences();const t=copy[locale];
  const hasPosts=status==="ready"&&posts.length>0;
  const statusText=hasPosts?t.active:status==="empty"?t.empty:t.status;
  return <div className={styles.page} lang={locale}>
    <header className={styles.header}><p>{t.eyebrow}</p><h1>{t.title}</h1><div className={styles.status}><span aria-hidden="true"/>{statusText}</div></header>
    <section className={styles.explanation} aria-labelledby="hot-rules-title"><div className={styles.explanationHeading}><span aria-hidden="true">↗</span><h2 id="hot-rules-title">{t.ruleTitle}</h2></div><p>{t.body}</p><ul><li>{t.rule1}</li><li>{t.rule2}</li><li>{t.rule3}</li></ul><p className={styles.weight}>{t.weight}</p><p className={styles.updates}>{t.updates}</p></section>
    <section className={styles.ranking} aria-label={hasPosts?t.active:t.slots}>{hasPosts?<PublicPostGrid posts={posts} status="ready" page={page} hideHeader gridClassName={styles.cards} rankStart={(page-1)*PUBLIC_LIST_PAGE_SIZE+1}/>:<><div className={styles.cards}>{Array.from({length:PUBLIC_LIST_PAGE_SIZE},(_,i)=><article className={styles.card} key={i} aria-hidden="true"><div className={styles.image}><span/></div><div className={styles.lines}><i/><i/><i/><i/></div></article>)}</div><p>{status==="empty"?t.empty:t.slot}</p></>}</section>
    {shouldRenderPublicPagination({status,hasResults:hasPosts,hasBasePath:true,page,hasNextPage})&&<nav className={styles.pagination} aria-label={getPaginationNavigationLabel(locale)}>
      {page>1?<Link href={`/hot?page=${page-1}`} rel="prev">← {t.previous}</Link>:<span/>}<span aria-current="page">{t.page} {page} {t.of}</span>{hasNextPage?<Link href={`/hot?page=${page+1}`} rel="next">{t.next} →</Link>:<span/>}
    </nav>}
    <Link className={styles.latest} href="/latest">{t.latest}<span aria-hidden="true">→</span></Link>
  </div>;
}
