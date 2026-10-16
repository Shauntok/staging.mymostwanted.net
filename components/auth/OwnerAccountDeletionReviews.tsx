"use client";

import {useCallback,useEffect,useState} from "react";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import styles from "./OwnerAccountDeletionReviews.module.css";

type Review={username:string;requestedAt:string;reason:"evidence_owned"|"auth_cleanup_failed"|"auth_cleanup_uncertain"};
type ReviewCursor={requestedAt:string;username:string};
const PAGE_SIZE=50;
const copy={
  "zh-CN":{title:"账号删除人工审核",intro:"自动清理已暂停。此列表只显示用户名、申请时间和审核原因；不会操作或删除证据。",refresh:"刷新队列",loading:"正在读取…",empty:"目前没有待审核账号。",error:"无法读取审核队列。请确认 Owner 权限、近期 TOTP 和数据库迁移。",evidence:"账号仍关联证据资料",failure:"Auth 清理失败",uncertain:"Auth 删除状态待核实",requested:"申请于",previous:"上一页",next:"下一页",page:"第 {page} 页",dateLocale:"zh-CN"},
  en:{title:"Account deletion review",intro:"Automatic cleanup is paused. This list shows usernames, request times and review reasons; it does not change or delete evidence.",refresh:"Refresh queue",loading:"Loading…",empty:"No accounts are waiting for review.",error:"The review queue could not be loaded. Check Owner access, recent TOTP and the database migration.",evidence:"Evidence is still linked to this account",failure:"Auth cleanup failed",uncertain:"Auth deletion outcome needs review",requested:"Requested",previous:"Previous",next:"Next",page:"Page {page}",dateLocale:"en"},
  ms:{title:"Semakan pemadaman akaun",intro:"Pembersihan automatik dihentikan. Senarai ini hanya memaparkan nama pengguna, masa permohonan dan sebab semakan; bukti tidak diubah atau dipadam.",refresh:"Muat semula baris",loading:"Memuatkan…",empty:"Tiada akaun menunggu semakan.",error:"Baris semakan tidak dapat dimuatkan. Semak akses Owner, TOTP terkini dan migrasi pangkalan data.",evidence:"Bukti masih dikaitkan dengan akaun ini",failure:"Pembersihan Auth gagal",uncertain:"Hasil pemadaman Auth perlu disemak",requested:"Dimohon",previous:"Sebelumnya",next:"Seterusnya",page:"Halaman {page}",dateLocale:"ms"},
} as const;

export function OwnerAccountDeletionReviews(){
  const {locale}=usePreferences();
  const t=copy[locale];
  const [rows,setRows]=useState<Review[]>([]);
  const [page,setPage]=useState(0);
  const [cursors,setCursors]=useState<(ReviewCursor|null)[]>([null]);
  const [hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(true);
  const [failed,setFailed]=useState(false);
  const fetchPage=useCallback(async(cursor:ReviewCursor|null)=>{
    const {data,error}=await createSupabaseBrowserClient().rpc("owner_list_account_deletion_reviews_page",{
      p_after_requested_at:cursor?.requestedAt??null,p_after_username:cursor?.username??null,p_limit:PAGE_SIZE+1
    });
    if(error||!Array.isArray(data))throw new Error("Review queue unavailable");
    return data.map((value):Review=>{
      if(!value||typeof value!=="object")throw new Error("Invalid deletion review record");
      const row=value as Record<string,unknown>;
      const timestamp=typeof row.requested_at==="string"?Date.parse(row.requested_at):NaN;
      if(typeof row.username!=="string"||row.username.length<1||row.username.length>80||typeof row.requested_at!=="string"||!Number.isFinite(timestamp)||(row.review_reason!=="evidence_owned"&&row.review_reason!=="auth_cleanup_failed"&&row.review_reason!=="auth_cleanup_uncertain"))throw new Error("Invalid deletion review record");
      // Keep the database timestamp string intact; Date.toISOString() truncates
      // PostgreSQL microseconds and could repeat or skip a keyset page row.
      return {username:row.username,requestedAt:row.requested_at,reason:row.review_reason};
    });
  },[]);
  useEffect(()=>{
    let active=true;
    void fetchPage(cursors[page]??null).then(parsed=>{
      if(!active)return;
      setRows(parsed.slice(0,PAGE_SIZE));setHasMore(parsed.length>PAGE_SIZE);setFailed(false);
    }).catch(()=>{if(active){setRows([]);setFailed(true)}}).finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false};
  },[fetchPage,cursors,page]);
  async function reload(){
    setLoading(true);setFailed(false);
    try{const parsed=await fetchPage(cursors[page]??null);setRows(parsed.slice(0,PAGE_SIZE));setHasMore(parsed.length>PAGE_SIZE)}
    catch{setRows([]);setFailed(true)}finally{setLoading(false)}
  }
  function nextPage(){
    if(loading||!hasMore||rows.length===0)return;
    const last=rows[rows.length-1];const cursor={requestedAt:last.requestedAt,username:last.username};
    setLoading(true);setCursors(previous=>[...previous.slice(0,page+1),cursor]);setPage(page+1);
  }
  function previousPage(){if(!loading&&page>0){setLoading(true);setPage(page-1)}}
  const date=(value:string)=>new Intl.DateTimeFormat(t.dateLocale,{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kuala_Lumpur"}).format(new Date(value));
  return <section className={styles.panel}>
    <header className={styles.header}><div><h2>{t.title}</h2><p className="auth-intro">{t.intro}</p></div><button type="button" className="button button-outline" onClick={()=>void reload()} disabled={loading}>{loading?t.loading:t.refresh}</button></header>
    {loading?<p className={styles.empty}>{t.loading}</p>:failed?<p className={styles.error} role="alert">{t.error}</p>:rows.length===0?<p className={styles.empty}>{t.empty}</p>:<ul className={styles.list}>{rows.map((row,index)=><li className={styles.row} key={`${row.username}-${row.requestedAt}-${index}`}><span className={styles.username}>{row.username}</span><time className={styles.date} dateTime={row.requestedAt}>{t.requested} · {date(row.requestedAt)}</time><span className={styles.reason}>{row.reason==="evidence_owned"?t.evidence:row.reason==="auth_cleanup_failed"?t.failure:t.uncertain}</span></li>)}</ul>}
    {!loading&&!failed&&rows.length>0&&<nav className={styles.pagination} aria-label={locale==="zh-CN"?"审核队列分页":locale==="ms"?"Penomboran baris semakan":"Review queue pages"}>
      <button type="button" className="button button-outline" onClick={previousPage} disabled={page===0}>{t.previous}</button>
      <span>{t.page.replace("{page}",String(page+1))}</span>
      <button type="button" className="button button-outline" onClick={nextPage} disabled={!hasMore}>{t.next}</button>
    </nav>}
  </section>;
}
