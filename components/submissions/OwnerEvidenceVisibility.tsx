"use client";

import {useCallback,useEffect,useId,useState} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import styles from "./StaffEvidenceAccess.module.css";

type Visibility="internal_only"|"public_thumbnail";
type Evidence={id:string;mime_type:string;created_at:string;visibility:Visibility};
type Payload={enabled?:unknown;items?:unknown};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const copy={
  "zh-CN":{title:"附件可见性（Owner）",off:"Owner 附件可见性管理默认关闭。",empty:"没有可管理的已扫描通过附件。",load:"正在读取附件…",error:"无法读取附件可见性。请检查 Owner 权限、迁移和近期 TOTP。",intro:"准备公开的附件仍存放在私有隔离桶中；只有关联到正式公开内容且扫描通过后，才会进入公开投影。内部附件不会公开。每次切换都需要近期 TOTP、原因并写入不可变审计。",current:"当前状态",public:"准备公开",internal:"仅内部",reason:"变更原因（必填）",totp:"Authenticator 验证码",save:"验证并保存",saving:"正在验证并保存…",saved:"可见性已更改并记入审计。",unchanged:"可见性没有变化。",failed:"无法更改可见性。请检查 Owner 权限、扫描状态、原因和 TOTP。",dateLocale:"zh-CN"},
  en:{title:"Evidence visibility (Owner)",off:"Owner evidence visibility controls are disabled by default.",empty:"There are no clean scanned attachments to manage.",load:"Loading attachments…",error:"Could not read evidence visibility. Check Owner access, migrations and recent TOTP.",intro:"Attachments prepared for publication remain in the private quarantine bucket. They enter a public projection only after they are linked to published content and have passed scanning. Internal attachments are never public. Every change requires recent TOTP and a reason, and is recorded in an immutable audit.",current:"Current state",public:"Prepared for publication",internal:"Internal only",reason:"Reason for change (required)",totp:"Authenticator code",save:"Verify and save",saving:"Verifying and saving…",saved:"Visibility changed and audited.",unchanged:"Visibility did not change.",failed:"Could not change visibility. Check Owner access, scan state, reason and TOTP.",dateLocale:"en-MY"},
  ms:{title:"Keterlihatan bukti (Owner)",off:"Kawalan keterlihatan bukti Owner dilumpuhkan secara lalai.",empty:"Tiada lampiran bersih yang telah diimbas untuk diurus.",load:"Memuatkan lampiran…",error:"Keterlihatan bukti tidak dapat dibaca. Semak akses Owner, migrasi dan TOTP terkini.",intro:"Lampiran yang disediakan untuk penerbitan kekal dalam stor kuarantin peribadi. Lampiran hanya masuk ke paparan awam selepas dipautkan kepada kandungan yang diterbitkan dan lulus imbasan. Lampiran dalaman tidak akan dipaparkan kepada umum. Setiap perubahan memerlukan TOTP terkini dan sebab serta direkodkan dalam audit tidak boleh ubah.",current:"Status semasa",public:"Disediakan untuk penerbitan",internal:"Dalaman sahaja",reason:"Sebab perubahan (wajib)",totp:"Kod pengesah",save:"Sahkan dan simpan",saving:"Mengesahkan dan menyimpan…",saved:"Keterlihatan diubah dan direkodkan dalam audit.",unchanged:"Keterlihatan tidak berubah.",failed:"Keterlihatan tidak dapat diubah. Semak akses Owner, status imbasan, sebab dan TOTP.",dateLocale:"ms-MY"}
} as const;

export function OwnerEvidenceVisibility({submissionId,configured}:{submissionId:string;configured:boolean}){
  const {locale}=usePreferences();const t=copy[locale];const id=useId();
  const [items,setItems]=useState<Evidence[]>([]);const [enabled,setEnabled]=useState(false);const [loadedFor,setLoadedFor]=useState<string|null>(null);const [failed,setFailed]=useState(false);
  const [editing,setEditing]=useState<string|null>(null);const [next,setNext]=useState<Visibility>("internal_only");const [reason,setReason]=useState("");const [code,setCode]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const load=useCallback(async()=>{
    if(!configured)return{enabled:false,items:[] as Evidence[]};
    const supabase=createSupabaseBrowserClient();const {data,error}=await supabase.rpc("owner_list_submission_evidence",{p_submission_id:submissionId});
    if(error||!data||typeof data!=="object")throw error??new Error("No evidence visibility response");
    const payload=data as Payload;
    const parsed=Array.isArray(payload.items)?payload.items.flatMap((value:unknown)=>{
      if(!value||typeof value!=="object")return[];const item=value as Record<string,unknown>;
      if(typeof item.id!=="string"||!uuid.test(item.id)||typeof item.mime_type!=="string"||typeof item.created_at!=="string"||!Number.isFinite(Date.parse(item.created_at))||(item.visibility!=="internal_only"&&item.visibility!=="public_thumbnail"))return[];
      return[{id:item.id,mime_type:item.mime_type,created_at:item.created_at,visibility:item.visibility} as Evidence];
    }):[];
    return{enabled:payload.enabled===true,items:parsed};
  },[configured,submissionId]);
  useEffect(()=>{
    let active=true;
    if(configured){void load().then(result=>{if(active){setEnabled(result.enabled);setItems(result.items);setFailed(false);setLoadedFor(submissionId);}}).catch(()=>{if(active){setFailed(true);setItems([]);setEnabled(false);setLoadedFor(submissionId);}});}
    return()=>{active=false;};
  },[configured,load,submissionId]);

  async function save(evidence:Evidence){
    if(busy||!reason.trim()||reason.trim().length>500||!/^[0-9]{6}$/.test(code))return;
    setBusy(true);setMessage("");
    try{
      const supabase=createSupabaseBrowserClient();const {data:factors,error:listError}=await supabase.auth.mfa.listFactors();if(listError)throw listError;
      const factor=factors.totp.find(value=>value.status==="verified");if(!factor)throw new Error("TOTP unavailable");
      const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:factor.id});if(challengeError||!challenge)throw challengeError??new Error("TOTP challenge unavailable");
      const {error:verifyError}=await supabase.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code});if(verifyError)throw verifyError;
      const {data,error}=await supabase.rpc("owner_set_submission_evidence_visibility",{p_evidence_id:evidence.id,p_visibility:next,p_reason:reason.trim()});
      if(error||typeof data!=="boolean")throw error??new Error("Visibility change rejected");
      setMessage(data?t.saved:t.unchanged);setEditing(null);setReason("");setCode("");const latest=await load();setEnabled(latest.enabled);setItems(latest.items);setFailed(false);setLoadedFor(submissionId);
    }catch{setMessage(t.failed);setCode("");}
    finally{setBusy(false);}
  }

  return <section className={styles.panel} aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>{t.title}</h3>
    {!configured?<p>{t.off}</p>:loadedFor!==submissionId?<p>{t.load}</p>:failed?<p role="alert">{t.error}</p>:!enabled?<p>{t.off}</p>:items.length===0?<p>{t.empty}</p>:<>
      <p>{t.intro}</p><ul>{items.map(item=><li key={item.id}><span>{new Date(item.created_at).toLocaleDateString(t.dateLocale)} · {item.visibility==="public_thumbnail"?t.public:t.internal}</span>
        {editing===item.id?<div className={styles.visibilityForm}>
          <label htmlFor={`${id}-${item.id}-visibility`}>{t.current}<select id={`${id}-${item.id}-visibility`} value={next} onChange={event=>setNext(event.target.value as Visibility)}><option value="public_thumbnail">{t.public}</option><option value="internal_only">{t.internal}</option></select></label>
          <label htmlFor={`${id}-${item.id}-reason`}>{t.reason}<textarea id={`${id}-${item.id}-reason`} value={reason} maxLength={500} onChange={event=>setReason(event.target.value)}/></label>
          <label htmlFor={`${id}-${item.id}-totp`}>{t.totp}<input id={`${id}-${item.id}-totp`} autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))}/></label>
          <button type="button" disabled={busy||!reason.trim()||code.length!==6} onClick={()=>void save(item)}>{busy?t.saving:t.save}</button>
        </div>:<button type="button" onClick={()=>{setEditing(item.id);setNext(item.visibility==="public_thumbnail"?"internal_only":"public_thumbnail");setReason("");setCode("");setMessage("");}}>{t.current}: {item.visibility==="public_thumbnail"?t.public:t.internal}</button>}
      </li>)}</ul>
    </>}
    {message&&<p role="status" aria-live="polite">{message}</p>}
  </section>;
}
