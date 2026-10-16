"use client";

import {usePreferences} from "@/components/shell/PreferencesProvider";
import type {Locale} from "@/lib/i18n/catalog";
import styles from "./StaffDashboardSummary.module.css";

export type DashboardMetrics={pending:number;highRisk:number|null;publishedToday:number;pageViewsTodayUtc:number|null;analyticsEnabled:boolean;unavailable:boolean};
const copy:Record<Locale,{title:string;pending:string;high:string;published:string;views:string;off:string;unavailable:string;timezone:string;notAvailable:string}>={
  "zh-CN":{title:"今日概览",pending:"待审核投稿",high:"高风险待审",published:"今日发布",views:"今日页面浏览",off:"First-party Analytics 已关闭",unavailable:"概览数据暂不可用，请确认工作台迁移已应用。",timezone:"日期以马来西亚时间统计；页面浏览日期按 UTC 汇总。",notAvailable:"—"},
  en:{title:"Today at a glance",pending:"Submissions awaiting review",high:"High-risk awaiting review",published:"Published today",views:"Page views today",off:"First-party Analytics is off",unavailable:"Summary metrics are unavailable. Confirm the dashboard migration is applied.",timezone:"Publication date uses Malaysia time; page-view totals use UTC dates.",notAvailable:"—"},
  ms:{title:"Ringkasan hari ini",pending:"Penghantaran menunggu semakan",high:"Risiko tinggi menunggu semakan",published:"Diterbitkan hari ini",views:"Paparan halaman hari ini",off:"First-party Analytics dimatikan",unavailable:"Metrik ringkasan tidak tersedia. Sahkan migrasi papan pemuka telah digunakan.",timezone:"Tarikh penerbitan mengikut waktu Malaysia; jumlah paparan halaman mengikut tarikh UTC.",notAvailable:"—"},
};

export function StaffDashboardSummary({metrics,isOwner}:{metrics:DashboardMetrics;isOwner:boolean}){
  const {locale}=usePreferences();
  const t=copy[locale];
  const numberLocale=locale==="zh-CN"?"zh-CN":locale==="ms"?"ms-MY":"en-MY";
  const number=(value:number)=>new Intl.NumberFormat(numberLocale).format(value);
  return <section className={styles.panel} lang={locale} aria-labelledby="staff-dashboard-summary-title">
    <h2 id="staff-dashboard-summary-title">{t.title}</h2>
    {metrics.unavailable?<p className={styles.notice} role="status">{t.unavailable}</p>:<>
      <dl className={styles.metrics}>
        <div><dt>{t.pending}</dt><dd>{number(metrics.pending)}</dd></div>
        {isOwner?<div><dt>{t.high}</dt><dd>{metrics.highRisk===null?t.notAvailable:number(metrics.highRisk)}</dd></div>:null}
        <div><dt>{t.published}</dt><dd>{number(metrics.publishedToday)}</dd></div>
        <div><dt>{t.views}</dt><dd>{!metrics.analyticsEnabled?<span className={styles.off}>{t.off}</span>:metrics.pageViewsTodayUtc===null?t.notAvailable:number(metrics.pageViewsTodayUtc)}</dd></div>
      </dl>
      <p className={styles.note}>{t.timezone}</p>
    </>}
  </section>;
}
