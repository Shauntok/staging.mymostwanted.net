"use client";

import {useCallback,useEffect,useState} from "react";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import LocalizedLink from "@/components/shell/LocalizedLink";
import styles from "./StaffReportQueue.module.css";

type ReportStatus="received"|"reviewing"|"resolved"|"dismissed";
type Report={id:string;report_kind:"report"|"feedback";post_id:string|null;reason:string;message:string;status:ReportStatus;submitted_at:string};
type T={ [K in Exclude<keyof typeof copy.en,"labels">]: string } & {labels:Record<string,string>};

const copy={
  "zh-CN":{title:"举报与反馈",intro:"私密队列只对通过 TOTP 验证的 Owner/Admin 开放。查看和处理动作都会记录。",loading:"正在读取…",retry:"重新载入",empty:"目前没有举报或反馈记录。",error:"无法读取队列。请确认后台登录和 TOTP 状态。",report:"举报",feedback:"反馈",post:"关联帖子",noPost:"未关联帖子",reason:"分类",message:"用户说明",status:"状态",received:"新收到",reviewing:"处理中",resolved:"已处理",dismissed:"不采取行动",note:"处理说明（必填）",notePlaceholder:"说明处理决定和原因",save:"保存处理状态",saving:"正在保存…",saved:"状态已更新并记入审计。",saveError:"无法更新状态。请检查 TOTP 是否仍在有效时间内。",reference:"记录编号",time:"提交时间",labels:{inaccurate_information:"信息可能有误",privacy:"隐私问题",safety:"安全风险",spam:"垃圾或重复内容",suggestion:"建议",accessibility:"无障碍体验",technical_issue:"技术问题",other:"其他"}},
  en:{title:"Reports & feedback",intro:"This private queue is limited to Owners/Admins with verified TOTP. Views and actions are audited.",loading:"Loading…",retry:"Reload",empty:"There are no report or feedback records yet.",error:"Could not load the queue. Check staff access and TOTP status.",report:"Report",feedback:"Feedback",post:"Related post",noPost:"No post selected",reason:"Category",message:"User details",status:"Status",received:"Received",reviewing:"Reviewing",resolved:"Resolved",dismissed:"Dismissed",note:"Review note (required)",notePlaceholder:"Record the decision and reason",save:"Save review status",saving:"Saving…",saved:"Status updated and audit recorded.",saveError:"Could not update status. Your TOTP proof may have expired.",reference:"Record",time:"Submitted",labels:{inaccurate_information:"Possibly inaccurate information",privacy:"Privacy concern",safety:"Safety concern",spam:"Spam or duplicate content",suggestion:"Suggestion",accessibility:"Accessibility",technical_issue:"Technical issue",other:"Other"}},
  ms:{title:"Laporan & maklum balas",intro:"Baris gilir peribadi ini hanya untuk Owner/Admin yang telah mengesahkan TOTP. Setiap paparan dan tindakan direkodkan.",loading:"Sedang memuatkan…",retry:"Muat semula",empty:"Belum ada laporan atau maklum balas.",error:"Baris gilir tidak dapat dimuatkan. Semak akses kakitangan dan status TOTP.",report:"Laporan",feedback:"Maklum balas",post:"Hantaran berkaitan",noPost:"Tiada hantaran dipilih",reason:"Kategori",message:"Butiran pengguna",status:"Status",received:"Diterima",reviewing:"Sedang disemak",resolved:"Selesai",dismissed:"Tiada tindakan",note:"Catatan semakan (wajib)",notePlaceholder:"Catat keputusan dan sebab",save:"Simpan status semakan",saving:"Sedang menyimpan…",saved:"Status dikemas kini dan direkodkan dalam audit.",saveError:"Status tidak dapat dikemas kini. Pengesahan TOTP mungkin telah tamat tempoh.",reference:"Rekod",time:"Dihantar",labels:{inaccurate_information:"Maklumat mungkin tidak tepat",privacy:"Isu privasi",safety:"Isu keselamatan",spam:"Spam atau kandungan pendua",suggestion:"Cadangan",accessibility:"Kebolehcapaian",technical_issue:"Isu teknikal",other:"Lain-lain"}},
} as const;

const statuses:ReportStatus[]=["reviewing","resolved","dismissed"];

async function fetchStaffReports(){
  const supabase=createSupabaseBrowserClient();
  const {data,error}=await supabase.rpc("list_staff_user_reports",{p_limit:50});
  if(error)throw error;
  return (data??[]) as Report[];
}

export function StaffReportQueue(){
  const {locale}=usePreferences();const t=copy[locale];
  const [reports,setReports]=useState<Report[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState(false);
  const load=useCallback(async()=>{
    setLoading(true);setError(false);
    try{setReports(await fetchStaffReports());}
    catch{setError(true);}finally{setLoading(false);}
  },[]);
  useEffect(()=>{
    let active=true;
    void fetchStaffReports().then((rows)=>{if(active)setReports(rows);}).catch(()=>{if(active)setError(true);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[]);

  return <section className={styles.page} lang={locale} aria-labelledby="staff-report-queue-title"><div className={styles.panel}>
    <p className="eyebrow">MMWR · STAFF</p><h1 id="staff-report-queue-title">{t.title}</h1><p className={styles.intro}>{t.intro}</p>
    <button className={styles.reload} type="button" onClick={()=>void load()} disabled={loading}>{loading?t.loading:t.retry}</button>
    {error?<p className={styles.state} role="alert">{t.error}</p>:loading?<p className={styles.state} role="status">{t.loading}</p>:reports.length===0?<p className={styles.state} role="status">{t.empty}</p>:<ul className={styles.list}>{reports.map(report=><StaffReportCard key={report.id} report={report} t={t} onUpdated={load}/>)}</ul>}
  </div></section>;
}

function StaffReportCard({report,t,onUpdated}:{report:Report;t:T;onUpdated:()=>Promise<void>}){
  const {locale}=usePreferences();
  const [status,setStatus]=useState<ReportStatus>(report.status);const [note,setNote]=useState("");const [busy,setBusy]=useState(false);const [feedback,setFeedback]=useState("");
  async function save(){
    if(!note.trim()||note.trim().length>500||busy)return;setBusy(true);setFeedback("");
    try{const supabase=createSupabaseBrowserClient();const {data,error}=await supabase.rpc("update_staff_user_report",{p_report_id:report.id,p_status:status,p_reason:note.trim()});if(error||data!==true)throw error??new Error("Review update rejected");setNote("");setFeedback(t.saved);await onUpdated();}
    catch{setFeedback(t.saveError);}finally{setBusy(false);}
  }
  const reason=(t.labels as Record<string,string>)[report.reason]??report.reason;
  return <li className={styles.card}>
    <header className={styles.heading}><strong>{report.report_kind==="report"?t.report:t.feedback}</strong><bdi>{t.reference}: {report.id}</bdi></header>
    <dl className={styles.details}><div><dt>{t.reason}</dt><dd>{reason}</dd></div><div><dt>{t.time}</dt><dd><time dateTime={report.submitted_at}>{new Date(report.submitted_at).toLocaleString(locale)}</time></dd></div><div><dt>{t.post}</dt><dd>{report.post_id?<LocalizedLink href={`/posts/${report.post_id}`}>{report.post_id}</LocalizedLink>:t.noPost}</dd></div></dl>
    <div className={styles.body}><span>{t.message}</span><p>{report.message}</p></div>
    <label className={styles.field}>{t.status}<select value={status} onChange={event=>setStatus(event.target.value as ReportStatus)}>{status==="received"&&<option value="received" disabled>{t.received}</option>}{statuses.map(value=><option value={value} key={value}>{t[value]}</option>)}</select></label>
    <label className={styles.field}>{t.note}<textarea value={note} maxLength={500} rows={3} placeholder={t.notePlaceholder} onChange={event=>setNote(event.target.value)}/></label>
    <div className={styles.actions}><button type="button" onClick={()=>void save()} disabled={busy||!note.trim()}>{busy?t.saving:t.save}</button>{feedback&&<span role="status">{feedback}</span>}</div>
  </li>;
}
