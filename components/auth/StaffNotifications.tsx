"use client";

import {useCallback,useEffect,useState} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import styles from "./StaffNotifications.module.css";

type Status="unread"|"read"|"in_progress"|"resolved";
type EventType="submission_received"|"submission_high_risk"|"user_report_received";
type Priority="normal"|"important"|"critical";
type Notification={id:string;event_type:EventType;entity_id:string;priority:Priority;status:Status;created_at:string;updated_at:string};
type Copy={title:string;intro:string;loading:string;reload:string;empty:string;error:string;normal:string;important:string;critical:string;unread:string;read:string;in_progress:string;resolved:string;submission_received:string;submission_high_risk:string;user_report_received:string;eventMessage:Record<EventType,string>;openQueue:string;markRead:string;start:string;resolve:string;totp:string;verify:string;cancel:string;saving:string;saved:string;actionError:string;dateLocale:string};

const copy:Record<"zh-CN"|"en"|"ms",Copy>={
  "zh-CN":{title:"站内通知",intro:"只显示当前后台账号收到的通知。处理顺序为未读、已读、处理中、已处理；状态变更需要近期 TOTP 并记入审计。通知在 90 天后清理。",loading:"正在载入通知…",reload:"刷新",empty:"目前没有通知。",error:"无法载入通知。请检查后台权限、迁移状态和 TOTP。",normal:"普通",important:"重要",critical:"紧急",unread:"未读",read:"已读",in_progress:"处理中",resolved:"已处理",submission_received:"收到新的投稿",submission_high_risk:"投稿被标记为高风险，需要 Owner 审核",user_report_received:"收到新的举报或反馈",eventMessage:{submission_received:"新投稿已进入私密审核队列。",submission_high_risk:"只有 Owner 可以审核此高风险投稿。",user_report_received:"新举报或反馈已进入私密队列。"},openQueue:"打开审核队列",markRead:"标记已读",start:"开始处理",resolve:"标记已处理",totp:"Authenticator 验证码",verify:"验证并更新状态",cancel:"取消",saving:"正在验证…",saved:"通知状态已更新并记入审计。",actionError:"状态未更新。请检查验证码、权限和当前状态。",dateLocale:"zh-CN"},
  en:{title:"Staff notifications",intro:"Only notifications for your staff account are shown. Move each item from unread to read, in progress and resolved; status changes require recent TOTP and are audited. Records are retained for 90 days.",loading:"Loading notifications…",reload:"Reload",empty:"There are no notifications.",error:"Could not load notifications. Check staff access, migration status and TOTP.",normal:"Normal",important:"Important",critical:"Critical",unread:"Unread",read:"Read",in_progress:"In progress",resolved:"Resolved",submission_received:"A new submission was received",submission_high_risk:"A submission was marked high risk and requires Owner review",user_report_received:"A new report or feedback item was received",eventMessage:{submission_received:"A new submission is waiting in the private review queue.",submission_high_risk:"Only Owners can review this high-risk submission.",user_report_received:"A new report or feedback item is waiting in the private queue."},openQueue:"Open review queue",markRead:"Mark as read",start:"Start work",resolve:"Mark resolved",totp:"Authenticator code",verify:"Verify and update",cancel:"Cancel",saving:"Verifying…",saved:"Notification status updated and audited.",actionError:"The status was not updated. Check the code, access and current status.",dateLocale:"en-MY"},
  ms:{title:"Pemberitahuan kakitangan",intro:"Hanya pemberitahuan untuk akaun kakitangan anda dipaparkan. Urutan status ialah belum dibaca, dibaca, sedang diproses dan selesai; perubahan memerlukan TOTP terkini dan direkodkan dalam audit. Rekod disimpan selama 90 hari.",loading:"Memuatkan pemberitahuan…",reload:"Muat semula",empty:"Tiada pemberitahuan.",error:"Pemberitahuan tidak dapat dimuatkan. Semak akses kakitangan, migrasi dan TOTP.",normal:"Biasa",important:"Penting",critical:"Kritikal",unread:"Belum dibaca",read:"Dibaca",in_progress:"Sedang diproses",resolved:"Selesai",submission_received:"Penghantaran baharu diterima",submission_high_risk:"Penghantaran ditandakan berisiko tinggi dan memerlukan semakan Owner",user_report_received:"Laporan atau maklum balas baharu diterima",eventMessage:{submission_received:"Penghantaran baharu sedang menunggu dalam baris gilir semakan peribadi.",submission_high_risk:"Hanya Owner boleh menyemak penghantaran berisiko tinggi ini.",user_report_received:"Laporan atau maklum balas baharu menunggu dalam baris gilir peribadi."},openQueue:"Buka baris gilir semakan",markRead:"Tandakan dibaca",start:"Mula mengendalikan",resolve:"Tandakan selesai",totp:"Kod aplikasi pengesah",verify:"Sahkan dan kemas kini",cancel:"Batal",saving:"Sedang mengesahkan…",saved:"Status pemberitahuan dikemas kini dan direkodkan dalam audit.",actionError:"Status tidak dikemas kini. Semak kod, akses dan status semasa.",dateLocale:"ms-MY"},
};

function isNotification(value:unknown):value is Notification{
  if(!value||typeof value!=="object")return false;
  const row=value as Record<string,unknown>;
  return typeof row.id==="string"&&typeof row.entity_id==="string"
    &&(row.event_type==="submission_received"||row.event_type==="submission_high_risk"||row.event_type==="user_report_received")
    &&(row.priority==="normal"||row.priority==="important"||row.priority==="critical")
    &&(row.status==="unread"||row.status==="read"||row.status==="in_progress"||row.status==="resolved")
    &&typeof row.created_at==="string"&&typeof row.updated_at==="string";
}

async function fetchNotifications(){
  const supabase=createSupabaseBrowserClient();
  const {data,error}=await supabase.rpc("list_staff_notifications",{p_limit:100});
  if(error)throw error;
  return Array.isArray(data)?data.filter(isNotification):[];
}

export function StaffNotifications(){
  const {locale}=usePreferences();
  const t=copy[locale];
  const [items,setItems]=useState<Notification[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const load=useCallback(async()=>{
    setLoading(true);setError(false);
    try{setItems(await fetchNotifications());}catch{setError(true);}finally{setLoading(false);}
  },[]);

  useEffect(()=>{
    let active=true;
    void fetchNotifications().then(rows=>{if(active)setItems(rows);}).catch(()=>{if(active)setError(true);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[]);

  return <section className={styles.panel} lang={locale} aria-labelledby="staff-notifications-title">
    <h3 id="staff-notifications-title">{t.title}</h3>
    <p className={styles.intro}>{t.intro}</p>
    <button className={styles.reload} type="button" onClick={()=>void load()} disabled={loading}>{loading?t.loading:t.reload}</button>
    {error?<p className={styles.state} role="alert">{t.error}</p>:loading?<p className={styles.state} role="status">{t.loading}</p>:items.length===0?<p className={styles.state} role="status">{t.empty}</p>:<ul className={styles.list}>{items.map(item=><NotificationItem key={item.id} item={item} t={t} onUpdated={load}/>)}</ul>}
  </section>;
}

function NotificationItem({item,t,onUpdated}:{item:Notification;t:Copy;onUpdated:()=>Promise<void>}){
  const [target,setTarget]=useState<"read"|"in_progress"|"resolved"|null>(null);
  const [code,setCode]=useState("");
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState("");
  const eventTitle=t[item.event_type];
  const nextStatus=item.status==="unread"?"read":item.status==="read"?"in_progress":item.status==="in_progress"?"resolved":null;

  async function updateStatus(){
    if(!target||code.length!==6||busy)return;
    setBusy(true);setFeedback("");
    try{
      const supabase=createSupabaseBrowserClient();
      const {data:factors,error:listError}=await supabase.auth.mfa.listFactors();
      if(listError)throw listError;
      const factor=factors.totp.find(value=>value.status==="verified");
      if(!factor)throw new Error("No verified TOTP factor");
      const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:factor.id});
      if(challengeError||!challenge)throw challengeError??new Error("TOTP challenge failed");
      const {error:verifyError}=await supabase.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code});
      if(verifyError)throw verifyError;
      const {data,error}=await supabase.rpc("update_staff_notification_status",{p_notification_id:item.id,p_status:target});
      if(error||data!==true)throw error??new Error("Notification transition rejected");
      setTarget(null);setCode("");setFeedback(t.saved);await onUpdated();
    }catch{setFeedback(t.actionError);setCode("");}
    finally{setBusy(false);}
  }

  return <li className={styles.item} data-priority={item.priority}>
    <div className={styles.heading}><h4>{eventTitle}</h4><span className={styles.priority}>{t[item.priority]}</span></div>
    <p className={styles.message}>{t.eventMessage[item.event_type]}</p>
    <div className={styles.meta}><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(t.dateLocale)}</time><span className={styles.status}>{t[item.status]}</span></div>
    <div className={styles.actions}><a className={styles.action} href={item.event_type==="user_report_received"?"#staff-report-queue-title":"#staff-submission-queue-title"}>{t.openQueue}</a></div>
    {nextStatus&&<div className={styles.actions}><button className={styles.action} type="button" onClick={()=>{setTarget(nextStatus);setFeedback("");}} disabled={busy}>{nextStatus==="read"?t.markRead:nextStatus==="in_progress"?t.start:t.resolve}</button></div>}
    {target&&<div className={styles.totp}>
      <label>{t.totp}<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))}/></label>
      <button className={styles.confirm} type="button" onClick={()=>void updateStatus()} disabled={busy||code.length!==6}>{busy?t.saving:t.verify}</button>
      <button className={styles.cancel} type="button" onClick={()=>{setTarget(null);setCode("");}} disabled={busy}>{t.cancel}</button>
    </div>}
    {feedback&&<p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>}
  </li>;
}
