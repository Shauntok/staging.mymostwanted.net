"use client";

import {useMemo, useState} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import type {Locale} from "@/lib/i18n/catalog";
import styles from "./StaffAnalyticsSummary.module.css";

export type StaffAnalyticsRow = {view_date:string;route_key:string;page_views:number};
type LoadState="off"|"unavailable"|"empty"|"ready";

const copy:Record<Locale,{title:string;subtitle:string;off:string;unavailable:string;empty:string;total:string;period:string;routes:string;days:string;labels:Record<string,string>}>= {
  "zh-CN":{title:"访问概览",subtitle:"仅显示经用户同意后收集的公开路线每日汇总。",off:"First-party Analytics 当前关闭。配置与迁移完成后才会显示数据。",unavailable:"Analytics 数据暂不可用。请确认迁移和服务配置已完成。",empty:"此时间范围内还没有已同意记录的访问数据。",total:"页面浏览",period:"时间范围",routes:"页面类别",days:"天",labels:{home:"首页",latest:"最新",hot:"热门故事",areas:"地区",tags:"Tags",search:"搜索",posts:"帖子",vip:"VIP",legal:"法律与政策",other_public:"其他公开页面"}},
  en:{title:"Traffic overview",subtitle:"Daily public-route aggregates collected only after user consent.",off:"First-party Analytics is off. Data appears after configuration and migration.",unavailable:"Analytics data is unavailable. Confirm the migration and service configuration.",empty:"There is no consented traffic data for this period yet.",total:"Page views",period:"Date range",routes:"Routes",days:"days",labels:{home:"Home",latest:"Latest",hot:"Hot Ranked",areas:"Areas",tags:"Tags",search:"Search",posts:"Posts",vip:"VIP",legal:"Legal and policy",other_public:"Other public pages"}},
  ms:{title:"Ringkasan trafik",subtitle:"Agregat harian laluan awam yang dikumpulkan selepas persetujuan pengguna sahaja.",off:"First-party Analytics dimatikan. Data akan dipaparkan selepas konfigurasi dan migrasi.",unavailable:"Data Analytics tidak tersedia. Sahkan migrasi dan konfigurasi perkhidmatan.",empty:"Belum ada data trafik berizin untuk tempoh ini.",total:"Paparan halaman",period:"Julat tarikh",routes:"Kategori halaman",days:"hari",labels:{home:"Laman utama",latest:"Terkini",hot:"Kisah Popular",areas:"Kawasan",tags:"Tag",search:"Carian",posts:"Hantaran",vip:"VIP",legal:"Undang-undang dan dasar",other_public:"Halaman awam lain"}},
};

const routeOrder=["home","latest","hot","areas","tags","search","posts","vip","legal","other_public"];

export function StaffAnalyticsSummary({state,rows=[]}:{state:LoadState;rows?:StaffAnalyticsRow[]}){
  const {locale}=usePreferences();
  const t=copy[locale];
  const [days,setDays]=useState<7|30|90>(30);
  const summary=useMemo(()=>{
    const today=new Date();
    const end=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate());
    const start=end-(days-1)*86_400_000;
    const totals=new Map<string,number>();
    for(const row of rows){
      const at=Date.parse(`${row.view_date}T00:00:00.000Z`);
      if(!Number.isFinite(at)||at<start||at>end)continue;
      totals.set(row.route_key,(totals.get(row.route_key)??0)+row.page_views);
    }
    return routeOrder.map(route=>({route,count:totals.get(route)??0})).filter(item=>item.count>0).sort((a,b)=>b.count-a.count||routeOrder.indexOf(a.route)-routeOrder.indexOf(b.route));
  },[days,rows]);
  const total=summary.reduce((sum,item)=>sum+item.count,0);
  const maximum=summary[0]?.count??0;
  const statusMessage=state==="off"?t.off:state==="unavailable"?t.unavailable:state==="empty"||total===0?t.empty:null;
  const numberLocale=locale==="zh-CN"?"zh-CN":locale==="ms"?"ms-MY":"en-MY";
  return <section className={styles.panel} aria-labelledby="staff-analytics-title" lang={locale}>
    <header className={styles.header}><div><p className={styles.eyebrow}>MMWR · ANALYTICS</p><h2 id="staff-analytics-title">{t.title}</h2><p>{t.subtitle}</p></div>
      <div className={styles.period}><span>{t.period}</span><div role="group" aria-label={t.period}>{([7,30,90] as const).map(value=><button key={value} type="button" aria-pressed={days===value} onClick={()=>setDays(value)}>{value} {t.days}</button>)}</div></div>
    </header>
    {statusMessage?<p className={styles.message} role="status">{statusMessage}</p>:<>
      <div className={styles.total}><strong>{new Intl.NumberFormat(numberLocale).format(total)}</strong><span>{t.total}</span></div>
      <h3>{t.routes}</h3>
      <ol className={styles.routes}>{summary.map(item=><li key={item.route}><div className={styles.routeLabel}><span>{t.labels[item.route]??item.route}</span><strong>{new Intl.NumberFormat(numberLocale).format(item.count)}</strong></div><div className={styles.track} aria-hidden="true"><span style={{width:`${maximum?Math.max(2,item.count/maximum*100):0}%`}}/></div></li>)}</ol>
    </>}
  </section>;
}
