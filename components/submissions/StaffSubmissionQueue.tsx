"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import Link from "@/components/shell/LocalizedLink";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {StaffEvidenceAccess} from "@/components/submissions/StaffEvidenceAccess";
import {OwnerEvidenceVisibility} from "@/components/submissions/OwnerEvidenceVisibility";
import {StaffSubmissionPublisher} from "@/components/submissions/StaffSubmissionPublisher";
import styles from "./StaffSubmissionQueue.module.css";

type Status="received"|"reviewing"|"needs_more_information"|"rejected"|"closed";
type RiskSignal="duplicate_open_description"|"missing_clean_image";
type QueueItem={id:string;submitted_title:string;status:Status;risk_level:"unassessed"|"ordinary"|"high";created_at:string;risk_signals?:RiskSignal[]};
type Detail=QueueItem&{original_source:string;internal_reviewer_notes:string|null;safe_reviewer_response:string|null};
type ReviewDecision="reviewing"|"needs_more_information"|"reject"|"approve"|"close";
type ReviewHistory={decision:ReviewDecision;risk_level:"unassessed"|"ordinary"|"high";internal_notes:string|null;safe_response:string|null;created_at:string};

const copy={
  "zh-CN":{title:"投稿审核",intro:"私密队列仅供完成 TOTP 验证的 Owner/Admin 使用。每次打开队列、查看投稿和更新处理状态都会记入审计。附件预览默认关闭；若单独启用，只能通过受控短时链接查看已扫描通过且标为内部的附件。投稿上传仍关闭。",load:"正在读取…",reload:"重新载入",empty:"目前没有待处理的投稿。",error:"无法读取审核队列。请检查后台权限、数据库迁移和近期 TOTP 验证。",open:"查看投稿",opening:"正在读取投稿…",opened:"投稿详情",status:"处理状态",received:"新收到",reviewing:"审核中",needs_more_information:"需要补充资料",rejected:"拒绝",closed:"已关闭",risk:"风险等级",unassessed:"尚未评估",ordinary:"一般",high:"高风险（仅 Owner）",submitted:"收到时间",source:"投稿资料与来源",history:"审核历史",historyEmpty:"尚无审核历史。",historyError:"审核历史无法读取，请重新打开投稿。",reviewedAt:"处理时间",previousNote:"上次审核记录",response:"给投稿人的安全回复（可选）",responseHint:"只写适合发送给投稿人的内容。",internal:"内部审核说明（必填）",internalHint:"写明本次决定与理由；仅限后台查看。",save:"保存审核状态",saving:"正在保存…",saved:"状态已更新，审核记录与审计已保存。",detailError:"无法打开投稿详情。该记录可能已变化，或当前账号无权查看。",saveError:"无法保存。请确认状态、说明，并重新完成近期 TOTP 验证。",dateLocale:"zh-CN",decisions:{reviewing:"审核中",needs_more_information:"需要补充资料",reject:"拒绝",approve:"批准",close:"关闭"}},
  en:{title:"Submission review",intro:"This private queue is for Owners/Admins with verified TOTP. Queue access, opening a submission, and status changes are audited. Evidence previews are disabled by default; if separately enabled, only clean, internal-only files can be opened through a gated, short-lived link. Submission uploads remain off.",load:"Loading…",reload:"Reload",empty:"There are no submissions awaiting review.",error:"Could not load the review queue. Check staff access, database migrations, and recent TOTP verification.",open:"Open submission",opening:"Loading submission…",opened:"Submission details",status:"Review status",received:"Received",reviewing:"In review",needs_more_information:"More information needed",rejected:"Rejected",closed:"Closed",risk:"Risk level",unassessed:"Unassessed",ordinary:"Ordinary",high:"High risk (Owner only)",submitted:"Received",source:"Submission and source",history:"Review history",historyEmpty:"There is no review history yet.",historyError:"Could not load review history. Reopen this submission to try again.",reviewedAt:"Reviewed",previousNote:"Previous review note",response:"Safe reply to submitter (optional)",responseHint:"Only include content suitable to send to the submitter.",internal:"Internal review note (required)",internalHint:"Record this decision and its reason; staff only.",save:"Save review status",saving:"Saving…",saved:"Status, review history, and audit were saved.",detailError:"Could not open this submission. It may have changed or your account may not have access.",saveError:"Could not save. Check the status and notes, then complete recent TOTP verification again.",dateLocale:"en-MY",decisions:{reviewing:"In review",needs_more_information:"More information needed",reject:"Rejected",approve:"Approved",close:"Closed"}},
  ms:{title:"Semakan hantaran",intro:"Baris gilir peribadi ini hanya untuk Owner/Admin dengan pengesahan TOTP. Akses baris gilir, pembukaan hantaran dan perubahan status direkodkan dalam audit. Pratonton bukti dilumpuhkan secara lalai; jika diaktifkan secara berasingan, hanya fail bersih yang ditandakan untuk kegunaan dalaman boleh dibuka melalui pautan terkawal dan sementara. Muat naik hantaran kekal dimatikan.",load:"Sedang memuatkan…",reload:"Muat semula",empty:"Tiada hantaran menunggu semakan.",error:"Baris gilir tidak dapat dimuatkan. Semak akses kakitangan, migrasi pangkalan data dan pengesahan TOTP terkini.",open:"Buka hantaran",opening:"Memuatkan hantaran…",opened:"Butiran hantaran",status:"Status semakan",received:"Diterima",reviewing:"Dalam semakan",needs_more_information:"Maklumat tambahan diperlukan",rejected:"Ditolak",closed:"Ditutup",risk:"Tahap risiko",unassessed:"Belum dinilai",ordinary:"Biasa",high:"Risiko tinggi (Owner sahaja)",submitted:"Diterima pada",source:"Hantaran dan sumber",history:"Sejarah semakan",historyEmpty:"Belum ada sejarah semakan.",historyError:"Sejarah semakan tidak dapat dimuatkan. Buka semula hantaran ini untuk mencuba lagi.",reviewedAt:"Disemak",previousNote:"Catatan semakan terdahulu",response:"Balasan selamat kepada penghantar (pilihan)",responseHint:"Hanya tulis kandungan yang sesuai dihantar kepada penghantar.",internal:"Catatan semakan dalaman (wajib)",internalHint:"Catat keputusan dan sebab; untuk kakitangan sahaja.",save:"Simpan status semakan",saving:"Sedang menyimpan…",saved:"Status, sejarah semakan dan audit telah disimpan.",detailError:"Butiran tidak dapat dibuka. Rekod mungkin telah berubah atau akaun anda tiada akses.",saveError:"Tidak dapat menyimpan. Semak status dan catatan, kemudian sahkan TOTP terkini sekali lagi.",dateLocale:"ms-MY",decisions:{reviewing:"Dalam semakan",needs_more_information:"Maklumat tambahan diperlukan",reject:"Ditolak",approve:"Diluluskan",close:"Ditutup"}}
} as const;
type Copy=(typeof copy)[keyof typeof copy];

const nextStatuses:Status[]=["reviewing","needs_more_information","rejected","closed"];
const riskSignalCopy={
  "zh-CN":{duplicate_open_description:"一般风险信号：与未结案投稿的规范化说明一致",missing_clean_image:"一般风险信号：未发现已扫描通过的图片"},
  en:{duplicate_open_description:"Ordinary risk signal: normalized description matches an open submission",missing_clean_image:"Ordinary risk signal: no image has passed scanning"},
  ms:{duplicate_open_description:"Isyarat risiko biasa: keterangan yang dinormalkan sepadan dengan hantaran yang belum selesai",missing_clean_image:"Isyarat risiko biasa: tiada imej yang lulus imbasan"}
} as const;
const riskSignalNote={
  "zh-CN":"这些提示仅供人工参考，不判断资料真伪，也不会自动拦截或拒绝投稿。",
  en:"These signals are advisory only. They do not assess whether information is true and never automatically block or reject a submission.",
  ms:"Isyarat ini untuk rujukan semakan manusia sahaja. Ia tidak menentukan kebenaran maklumat dan tidak menyekat atau menolak hantaran secara automatik."
} as const;

async function fetchStaffSubmissions(){
  const supabase=createSupabaseBrowserClient();
  const {data,error}=await supabase.rpc("list_staff_submissions",{p_limit:50});
  if(error)throw error;
  return (data??[]) as QueueItem[];
}

export function StaffSubmissionQueue({isOwner,ownerVisibilityConfigured,publicationConfigured}:{isOwner:boolean;ownerVisibilityConfigured:boolean;publicationConfigured:boolean}){
  const {locale}=usePreferences();const t=copy[locale];
  const [items,setItems]=useState<QueueItem[]>([]);const [selected,setSelected]=useState<Detail|null>(null);
  const selectedIdRef=useRef<string|null>(null);const openRequestRef=useRef(0);const [openingId,setOpeningId]=useState<string|null>(null);
  const [publishedPostId,setPublishedPostId]=useState<string|null>(null);
  const [history,setHistory]=useState<ReviewHistory[]>([]);const [historyError,setHistoryError]=useState(false);
  const [loading,setLoading]=useState(true);const [error,setError]=useState(false);const [detailError,setDetailError]=useState(false);
  const load=useCallback(async()=>{
    setLoading(true);setError(false);
    try{setItems(await fetchStaffSubmissions());}
    catch{setError(true);}finally{setLoading(false);}
  },[]);
  useEffect(()=>{
    const openRequest=openRequestRef;
    const selectedId=selectedIdRef;
    let active=true;
    void fetchStaffSubmissions().then((rows)=>{if(active)setItems(rows);}).catch(()=>{if(active)setError(true);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;openRequest.current++;selectedId.current=null;};
  },[]);

  async function open(item:QueueItem){
    const requestId=++openRequestRef.current;selectedIdRef.current=null;setOpeningId(item.id);setSelected(null);setHistory([]);setHistoryError(false);setDetailError(false);
    let loadingStage:"detail"|"history"="detail";
    try{
      const supabase=createSupabaseBrowserClient();
      const {data,error}=await supabase.rpc("get_staff_submission",{p_submission_id:item.id});
      if(requestId!==openRequestRef.current)return;
      if(error)throw error;
      const detail=Array.isArray(data)?data[0]:data;
      if(!detail)throw new Error("Submission unavailable");
      loadingStage="history";
      const {data:historyData,error:historyRpcError}=await supabase.rpc("get_staff_submission_review_history",{p_submission_id:item.id});
      if(requestId!==openRequestRef.current)return;
      if(historyRpcError){setHistoryError(true);return;}
      selectedIdRef.current=item.id;setSelected(detail as Detail);setHistory((historyData??[]) as ReviewHistory[]);
    }catch{if(requestId===openRequestRef.current){if(loadingStage==="history")setHistoryError(true);else setDetailError(true);}}
    finally{if(requestId===openRequestRef.current)setOpeningId(null);}
  }

  return <section className={styles.page} lang={locale} aria-labelledby="staff-submission-queue-title"><div className={styles.panel}>
    <p className="eyebrow">MMWR · STAFF</p><h1 id="staff-submission-queue-title">{t.title}</h1><p className={styles.intro}>{t.intro}</p>
    <button className={styles.reload} type="button" onClick={()=>void load()} disabled={loading}>{loading?t.load:t.reload}</button>
    {error?<p className={styles.state} role="alert">{t.error}</p>:loading?<p className={styles.state} role="status">{t.load}</p>:items.length===0?<p className={styles.state} role="status">{t.empty}</p>:<ul className={styles.list} aria-busy={openingId!==null}>{items.map(item=><li className={styles.card} key={item.id}>
      <div className={styles.heading}><strong>{item.submitted_title}</strong><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(t.dateLocale)}</time></div>
      <div className={styles.badges}><span>{t[item.status]}</span><span>{t[item.risk_level]}</span>{item.risk_signals?.map(signal=><span key={signal}>{riskSignalCopy[locale][signal]}</span>)}</div>
      <button className={styles.open} type="button" onClick={()=>void open(item)} disabled={openingId!==null}>{openingId===item.id?t.opening:t.open}</button>
    </li>)}</ul>}
    {detailError&&<p className={styles.state} role="alert">{t.detailError}</p>}
    {historyError&&!selected&&<p className={styles.state} role="alert">{t.historyError}</p>}
    {publishedPostId&&<p className={styles.state} role="status">{locale==="zh-CN"?"已发布帖子：":locale==="ms"?"Hantaran diterbitkan: ":"Published post: "}<Link href={`/posts/${publishedPostId}`}>{publishedPostId}</Link></p>}
    {selected&&<SubmissionReview detail={selected} history={history} historyError={historyError} t={t} locale={locale} isOwner={isOwner} ownerVisibilityConfigured={ownerVisibilityConfigured} publicationConfigured={publicationConfigured} onPublished={(postId)=>{openRequestRef.current++;selectedIdRef.current=null;setOpeningId(null);setSelected(null);setPublishedPostId(postId);void load();}} onSaved={async(status,notes,response)=>{if(selectedIdRef.current===selected.id){setSelected(current=>current?.id===selected.id?{...current,status,internal_reviewer_notes:notes,safe_reviewer_response:response}:current);const requestId=++openRequestRef.current;try{const supabase=createSupabaseBrowserClient();const {data,error}=await supabase.rpc("get_staff_submission_review_history",{p_submission_id:selected.id});if(error)throw error;if(requestId===openRequestRef.current&&selectedIdRef.current===selected.id){setHistory((data??[]) as ReviewHistory[]);setHistoryError(false);}}catch{if(requestId===openRequestRef.current&&selectedIdRef.current===selected.id)setHistoryError(true);}}await load();}}/>}
  </div></section>;
}

function SubmissionReview({detail,history,historyError,t,locale,isOwner,ownerVisibilityConfigured,publicationConfigured,onPublished,onSaved}:{detail:Detail;history:ReviewHistory[];historyError:boolean;t:Copy;locale:"zh-CN"|"en"|"ms";isOwner:boolean;ownerVisibilityConfigured:boolean;publicationConfigured:boolean;onPublished:(postId:string)=>void;onSaved:(status:Status,notes:string,response:string|null)=>Promise<void>}){
  const [status,setStatus]=useState<Status>(detail.status);const [notes,setNotes]=useState("");const [response,setResponse]=useState(detail.safe_reviewer_response??"");const [busy,setBusy]=useState(false);const [feedback,setFeedback]=useState("");const [showPublisher,setShowPublisher]=useState(false);const riskSignals=detail.risk_signals??[];
  async function save(){
    if(!notes.trim()||notes.trim().length>1000||response.length>2000||busy)return;setBusy(true);setFeedback("");
    try{const supabase=createSupabaseBrowserClient();const {data,error}=await supabase.rpc("update_staff_submission_triage",{p_submission_id:detail.id,p_next_status:status,p_internal_notes:notes.trim(),p_safe_response:response.trim()||null});if(error||data!==true)throw error??new Error("Review update rejected");const savedNotes=notes.trim();const savedResponse=response.trim()||null;setNotes("");setFeedback(t.saved);await onSaved(status,savedNotes,savedResponse);}
    catch{setFeedback(t.saveError);}finally{setBusy(false);}
  }
  return <section className={styles.review} aria-labelledby="submission-review-title"><h2 id="submission-review-title">{t.opened}: {detail.submitted_title}</h2>
    <dl className={styles.details}><div><dt>{t.status}</dt><dd>{t[detail.status]}</dd></div><div><dt>{t.risk}</dt><dd>{t[detail.risk_level]}</dd></div><div><dt>{t.submitted}</dt><dd><time dateTime={detail.created_at}>{new Date(detail.created_at).toLocaleString(t.dateLocale)}</time></dd></div></dl>
    {riskSignals.length>0&&<div className={styles.body}><span>{locale==="zh-CN"?"一般风险信号":locale==="ms"?"Isyarat risiko biasa":"Ordinary risk signals"}</span><ul>{riskSignals.map(signal=><li key={signal}>{riskSignalCopy[locale][signal]}</li>)}</ul><p>{riskSignalNote[locale]}</p></div>}
    <div className={styles.body}><span>{t.source}</span><p>{detail.original_source}</p></div>
    {detail.internal_reviewer_notes&&<div className={styles.body}><span>{t.previousNote}</span><p>{detail.internal_reviewer_notes}</p></div>}
    <StaffEvidenceAccess submissionId={detail.id}/>
    {isOwner&&<OwnerEvidenceVisibility submissionId={detail.id} configured={ownerVisibilityConfigured}/>}
    {publicationConfigured?<div className={styles.actions}><button type="button" onClick={()=>setShowPublisher(value=>!value)} disabled={busy}>{locale==="zh-CN"?"打开审核发布面板":locale==="ms"?"Buka panel semakan penerbitan":"Open publication review"}</button></div>:<p className={styles.state}>{locale==="zh-CN"?"投稿发布功能保持关闭。":locale==="ms"?"Penerbitan hantaran kekal ditutup.":"Submission publication remains closed."}</p>}
    {showPublisher&&publicationConfigured&&<StaffSubmissionPublisher submissionId={detail.id} isOwner={isOwner} onCancel={()=>setShowPublisher(false)} onPublished={(postId)=>{setShowPublisher(false);onPublished(postId);}}/>}
    <section className={styles.history} aria-label={t.history}><h3>{t.history}</h3>{historyError?<p role="alert">{t.historyError}</p>:history.length===0?<p>{t.historyEmpty}</p>:<ol>{history.map((entry,index)=><li key={`${entry.created_at}-${index}`}><header><strong>{t.decisions[entry.decision]}</strong><time dateTime={entry.created_at}>{t.reviewedAt}: {new Date(entry.created_at).toLocaleString(t.dateLocale)}</time></header><span>{t.risk}: {t[entry.risk_level]}</span>{entry.internal_notes&&<p>{entry.internal_notes}</p>}{entry.safe_response&&<blockquote>{entry.safe_response}</blockquote>}</li>)}</ol>}</section>
    <label className={styles.field}>{t.status}<select value={status} onChange={event=>setStatus(event.target.value as Status)}>{detail.status==="received"&&<option value="received" disabled>{t.received}</option>}{nextStatuses.map(value=><option value={value} key={value}>{t[value]}</option>)}</select></label>
    <label className={styles.field}>{t.response}<small>{t.responseHint}</small><textarea value={response} maxLength={2000} rows={3} onChange={event=>setResponse(event.target.value)}/></label>
    <label className={styles.field}>{t.internal}<small>{t.internalHint}</small><textarea value={notes} maxLength={1000} rows={4} onChange={event=>setNotes(event.target.value)}/></label>
    <div className={styles.actions}><button type="button" onClick={()=>void save()} disabled={busy||!notes.trim()}>{busy?t.saving:t.save}</button>{feedback&&<span role="status">{feedback}</span>}</div>
  </section>;
}
