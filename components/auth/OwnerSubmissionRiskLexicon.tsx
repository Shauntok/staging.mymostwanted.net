"use client";

import {useCallback,useEffect,useState} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import styles from "./OwnerSubmissionRiskLexicon.module.css";

type Language="any"|"en"|"zh-CN"|"ms";
type RiskLevel="ordinary"|"high";
type Rule={id:string;term:string;language:Language;risk_level:RiskLevel;active:boolean;updated_at:string};
type Audit={id:number;actor_user_id:string|null;action:"created"|"updated";reason:string;before_value:Record<string,unknown>|null;after_value:Record<string,unknown>;occurred_at:string};
type ScannerAudit={id:number;actor_user_id:string|null;enabled_before:boolean;enabled_after:boolean;reason:string;occurred_at:string};
type FormState={id:string|null;term:string;language:Language;risk:RiskLevel;active:boolean;reason:string};

const emptyForm:FormState={id:null,term:"",language:"any",risk:"ordinary",active:true,reason:""};
const copy={
  "zh-CN":{
    title:"投稿风险词库",intro:"仅 Owner 可维护的内部规则表。当前只保存规则和变更审计；没有投稿匹配、自动标记、拦截、拒绝或通知功能。匹配须等投稿风控明确启用并完成验证后才会运行。",loading:"正在读取词库…",reload:"刷新",empty:"还没有词条。",error:"无法读取词库。请确认迁移已应用且近期 TOTP 仍有效。",add:"添加词条",edit:"编辑",term:"词条",termHint:"请添加用于人工审核提示的短语，不要添加不必要的个人资料。",language:"适用语言",any:"所有语言",en:"英语",zh:"简体中文",ms:"马来语",risk:"人工审核级别",ordinary:"普通审核提示",high:"高风险（仅 Owner 可审核）",active:"启用此规则",reason:"变更原因（必填）",reasonPlaceholder:"说明新增或修改原因",totp:"Authenticator 验证码",save:"验证并保存",saving:"正在验证并保存…",cancel:"取消",saved:"规则和审计记录已保存。",saveError:"未能保存。检查词条重复、权限、原因和 TOTP。",required:"词条至少 2 个字符，原因必填，并输入 6 位验证码。",enabled:"启用",disabled:"停用",updated:"最后修改",auditTitle:"最近变更审计",auditEmpty:"暂无变更记录。",created:"新增",changed:"修改",actor:"操作人",auditError:"无法读取审计记录。",notMatching:"风险词匹配目前关闭；启用词条不会扫描现有或新投稿。",dateLocale:"zh-CN"
  },
  en:{
    title:"Submission risk lexicon",intro:"A private rule list maintained by Owners. This stores rules and change audits only; it does not match submissions, assign risk, block, reject or notify anyone. Matching will run only after submission risk detection is explicitly enabled and verified.",loading:"Loading rules…",reload:"Reload",empty:"There are no rules yet.",error:"Could not load the lexicon. Confirm the migration is applied and recent TOTP is valid.",add:"Add rule",edit:"Edit",term:"Term",termHint:"Use a short phrase for human review guidance; avoid unnecessary personal information.",language:"Language",any:"Any language",en:"English",zh:"Simplified Chinese",ms:"Malay",risk:"Review level",ordinary:"Ordinary review hint",high:"High risk (Owner review only)",active:"Enable this rule",reason:"Reason for change (required)",reasonPlaceholder:"Explain why this rule is being added or changed",totp:"Authenticator code",save:"Verify and save",saving:"Verifying and saving…",cancel:"Cancel",saved:"Rule and audit record saved.",saveError:"Could not save. Check for duplicate terms, access, reason and TOTP.",required:"Enter a term of at least 2 characters, a reason and the 6-digit code.",enabled:"Active",disabled:"Inactive",updated:"Updated",auditTitle:"Recent change audit",auditEmpty:"There are no change records yet.",created:"Created",changed:"Updated",actor:"Actor",auditError:"Could not load the audit history.",notMatching:"Risk matching is currently off. Enabling a rule will not scan existing or new submissions.",dateLocale:"en-MY"
  },
  ms:{
    title:"Kamus risiko penghantaran",intro:"Senarai peraturan peribadi yang diselenggara oleh Owner. Modul ini hanya menyimpan peraturan dan audit perubahan; ia tidak memadankan penghantaran, menetapkan risiko, menyekat, menolak atau menghantar pemberitahuan. Pemadanan hanya berjalan selepas pengesanan risiko diaktifkan dan disahkan secara jelas.",loading:"Memuatkan peraturan…",reload:"Muat semula",empty:"Belum ada peraturan.",error:"Kamus tidak dapat dimuatkan. Sahkan migrasi telah digunakan dan TOTP terkini masih sah.",add:"Tambah peraturan",edit:"Edit",term:"Istilah",termHint:"Gunakan frasa ringkas untuk panduan semakan manusia; elakkan maklumat peribadi yang tidak perlu.",language:"Bahasa",any:"Semua bahasa",en:"Bahasa Inggeris",zh:"Bahasa Cina ringkas",ms:"Bahasa Melayu",risk:"Tahap semakan",ordinary:"Petunjuk semakan biasa",high:"Risiko tinggi (semakan Owner sahaja)",active:"Aktifkan peraturan ini",reason:"Sebab perubahan (wajib)",reasonPlaceholder:"Terangkan sebab peraturan ditambah atau diubah",totp:"Kod aplikasi pengesah",save:"Sahkan dan simpan",saving:"Mengesahkan dan menyimpan…",cancel:"Batal",saved:"Peraturan dan rekod audit disimpan.",saveError:"Tidak dapat menyimpan. Semak istilah pendua, akses, sebab dan TOTP.",required:"Masukkan istilah sekurang-kurangnya 2 aksara, sebab dan kod 6 digit.",enabled:"Aktif",disabled:"Tidak aktif",updated:"Dikemas kini",auditTitle:"Audit perubahan terkini",auditEmpty:"Tiada rekod perubahan.",created:"Dicipta",changed:"Dikemas kini",actor:"Pelaku",auditError:"Sejarah audit tidak dapat dimuatkan.",notMatching:"Pemadanan risiko dimatikan. Mengaktifkan peraturan tidak akan mengimbas penghantaran sedia ada atau baharu.",dateLocale:"ms-MY"
  }
} as const;

const scannerCopy={
  "zh-CN":{title:"自动风险提示",enabled:"开启：扫描新投稿标题",disabled:"关闭：不自动匹配",description:"仅匹配之后新投稿的标题。词条语言是管理标记；因为投稿没有语言字段，匹配会检查所有启用词条。命中结果只供人工审核，不判断真假、不拦截或拒绝；既有投稿不会重新扫描。",reason:"开关变更原因（必填）",placeholder:"说明启用或关闭的原因",save:"验证并更新",saving:"正在验证并更新…",saved:"设置与审计已保存。",error:"无法更新。请确认 Owner 权限、原因和近期 TOTP。",required:"请填写原因并输入 6 位 Authenticator 验证码。",audit:"开关变更记录",empty:"暂无设置变更。",actor:"操作人",on:"开启",off:"关闭"},
  en:{title:"Automatic risk hints",enabled:"On: match new submission titles",disabled:"Off: no automatic matching",description:"Only future submission titles are matched. Rule language is a management label; because submissions have no language field, all active terms are checked. Results guide human review; they do not determine truth, block, or reject. Existing submissions are not rescanned.",reason:"Reason for changing the setting (required)",placeholder:"Explain why you are enabling or disabling matching",save:"Verify and update",saving:"Verifying and updating…",saved:"Setting and audit saved.",error:"Could not update. Confirm Owner access, reason and recent TOTP.",required:"Enter a reason and the 6-digit Authenticator code.",audit:"Setting change history",empty:"There are no setting changes yet.",actor:"Actor",on:"On",off:"Off"},
  ms:{title:"Petunjuk risiko automatik",enabled:"Hidup: padankan tajuk hantaran baharu",disabled:"Mati: tiada padanan automatik",description:"Hanya tajuk hantaran akan datang dipadankan. Bahasa istilah ialah label pengurusan; kerana hantaran tidak menyimpan bahasa, semua istilah aktif diperiksa. Hasil membantu semakan manusia; ia tidak menentukan kebenaran, menyekat atau menolak. Hantaran sedia ada tidak diimbas semula.",reason:"Sebab perubahan tetapan (wajib)",placeholder:"Terangkan sebab menghidupkan atau mematikan padanan",save:"Sahkan dan kemas kini",saving:"Mengesahkan dan mengemas kini…",saved:"Tetapan dan audit disimpan.",error:"Tidak dapat mengemas kini. Sahkan akses Owner, sebab dan TOTP terkini.",required:"Masukkan sebab dan kod aplikasi pengesah 6 digit.",audit:"Sejarah perubahan tetapan",empty:"Belum ada perubahan tetapan.",actor:"Pelaku",on:"Hidup",off:"Mati"}
} as const;
const introCopy={
  "zh-CN":"Owner 可维护内部规则和级别。自动匹配只提供审核提示，不判断真伪、不拦截或拒绝投稿。",
  en:"Owners maintain the private terms and review levels. Automatic matching provides review hints only; it does not determine truth, block, or reject submissions.",
  ms:"Owner menyelenggara istilah dan tahap semakan peribadi. Padanan automatik hanya memberi panduan semakan; ia tidak menentukan kebenaran, menyekat atau menolak hantaran."
} as const;

function isRule(value:unknown):value is Rule{
  if(!value||typeof value!=="object")return false;
  const row=value as Record<string,unknown>;
  return typeof row.id==="string"&&typeof row.term==="string"
    &&(row.language==="any"||row.language==="en"||row.language==="zh-CN"||row.language==="ms")
    &&(row.risk_level==="ordinary"||row.risk_level==="high")&&typeof row.active==="boolean"&&typeof row.updated_at==="string";
}
function isAudit(value:unknown):value is Audit{
  if(!value||typeof value!=="object")return false;
  const row=value as Record<string,unknown>;
  return typeof row.id==="number"&&(row.action==="created"||row.action==="updated")&&typeof row.reason==="string"
    &&typeof row.after_value==="object"&&row.after_value!==null&&typeof row.occurred_at==="string";
}

async function loadData(){
  const supabase=createSupabaseBrowserClient();
  const [rules,audit,scanner,scannerAudit]=await Promise.all([
    supabase.rpc("owner_list_submission_risk_lexicon"),
    supabase.rpc("owner_list_submission_risk_lexicon_audit",{p_limit:30}),
    supabase.rpc("owner_get_submission_risk_scanning_status"),
    supabase.rpc("owner_list_submission_risk_scanner_audit",{p_limit:30})
  ]);
  if(rules.error)throw rules.error;
  if(audit.error)throw audit.error;
  if(scanner.error||typeof scanner.data!=="boolean")throw scanner.error??new Error("Scanner status unavailable");
  if(scannerAudit.error)throw scannerAudit.error;
  const parsedScannerAudit=(Array.isArray(scannerAudit.data)?scannerAudit.data:[]).filter((value):value is ScannerAudit=>Boolean(value&&typeof value==="object"&&typeof (value as ScannerAudit).id==="number"&&typeof (value as ScannerAudit).reason==="string"&&typeof (value as ScannerAudit).enabled_after==="boolean"&&typeof (value as ScannerAudit).occurred_at==="string"));
  return {rules:Array.isArray(rules.data)?rules.data.filter(isRule):[],audit:Array.isArray(audit.data)?audit.data.filter(isAudit):[],scannerEnabled:scanner.data,scannerAudit:parsedScannerAudit};
}

export function OwnerSubmissionRiskLexicon(){
  const {locale}=usePreferences();
  const t=copy[locale];
  const scanText=scannerCopy[locale];
  const intro=introCopy[locale];
  const [rules,setRules]=useState<Rule[]>([]);
  const [audit,setAudit]=useState<Audit[]>([]);
  const [scannerAudit,setScannerAudit]=useState<ScannerAudit[]>([]);
  const [scannerEnabled,setScannerEnabled]=useState(false);
  const [targetScannerEnabled,setTargetScannerEnabled]=useState(false);
  const [scannerReason,setScannerReason]=useState("");
  const [scannerCode,setScannerCode]=useState("");
  const [scannerBusy,setScannerBusy]=useState(false);
  const [scannerFeedback,setScannerFeedback]=useState("");
  const [form,setForm]=useState<FormState>(emptyForm);
  const [code,setCode]=useState("");
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState(false);
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState("");
  const reload=useCallback(async()=>{
    setLoading(true);setLoadError(false);
    try{const data=await loadData();setRules(data.rules);setAudit(data.audit);setScannerEnabled(data.scannerEnabled);setTargetScannerEnabled(data.scannerEnabled);setScannerAudit(data.scannerAudit);}
    catch{setLoadError(true);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{let active=true;void loadData().then(data=>{if(active){setRules(data.rules);setAudit(data.audit);setScannerEnabled(data.scannerEnabled);setTargetScannerEnabled(data.scannerEnabled);setScannerAudit(data.scannerAudit);}}).catch(()=>{if(active)setLoadError(true);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);

  async function saveScannerSetting(){
    if(scannerBusy)return;
    if(!scannerReason.trim()||scannerCode.length!==6){setScannerFeedback(scanText.required);return;}
    setScannerBusy(true);setScannerFeedback("");
    try{
      const supabase=createSupabaseBrowserClient();
      const {data:factors,error:listError}=await supabase.auth.mfa.listFactors();
      if(listError)throw listError;
      const factor=factors.totp.find(value=>value.status==="verified");
      if(!factor)throw new Error("No verified TOTP factor");
      const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:factor.id});
      if(challengeError||!challenge)throw challengeError??new Error("TOTP challenge failed");
      const {error:verifyError}=await supabase.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:scannerCode});
      if(verifyError)throw verifyError;
      const {data,error}=await supabase.rpc("owner_set_submission_risk_scanning",{
        p_enabled:targetScannerEnabled,p_reason:scannerReason.trim()
      });
      if(error||data!==true)throw error??new Error("Setting update rejected");
      setScannerEnabled(targetScannerEnabled);setScannerReason("");setScannerCode("");setScannerFeedback(scanText.saved);await reload();
    }catch{setScannerFeedback(scanText.error);setScannerCode("");}
    finally{setScannerBusy(false);}
  }

  function startEdit(rule?:Rule){
    setFeedback("");setCode("");
    setForm(rule?{id:rule.id,term:rule.term,language:rule.language,risk:rule.risk_level,active:rule.active,reason:""}:{...emptyForm});
    setEditing(true);
  }

  async function save(){
    if(busy)return;
    if(form.term.trim().length<2||!form.reason.trim()||code.length!==6){setFeedback(t.required);return;}
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
      const {data,error}=await supabase.rpc("owner_save_submission_risk_rule",{
        p_rule_id:form.id,p_term:form.term.trim(),p_language:form.language,p_risk_level:form.risk,
        p_active:form.active,p_reason:form.reason.trim()
      });
      if(error||typeof data!=="string")throw error??new Error("Rule save was rejected");
      setEditing(false);setForm({...emptyForm});setCode("");setFeedback(t.saved);await reload();
    }catch{setFeedback(t.saveError);setCode("");}
    finally{setBusy(false);}
  }

  return <section className={styles.panel} lang={locale} aria-labelledby="owner-risk-lexicon-title">
    <div className={styles.heading}><h3 id="owner-risk-lexicon-title">{t.title}</h3><button className={styles.button} type="button" onClick={()=>void reload()} disabled={loading}>{loading?t.loading:t.reload}</button></div>
    <p className={styles.intro}>{intro}</p><p className={styles.notice} role="note">{scanText.description}</p>
    <section className={styles.form} aria-label={scanText.title}>
      <strong>{scanText.title}</strong>
      <label className={styles.check}><input type="checkbox" checked={targetScannerEnabled} onChange={event=>setTargetScannerEnabled(event.target.checked)} disabled={loading||loadError||scannerBusy}/>{targetScannerEnabled?scanText.enabled:scanText.disabled}</label>
      <small>{scanText.description}</small>
      <label>{scanText.reason}<input maxLength={500} value={scannerReason} onChange={event=>setScannerReason(event.target.value)} placeholder={scanText.placeholder}/></label>
      <label>{t.totp}<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={scannerCode} onChange={event=>setScannerCode(event.target.value.replace(/\D/g,"").slice(0,6))}/></label>
      <div className={styles.actions}><button className="button button-primary" type="button" onClick={()=>void saveScannerSetting()} disabled={loading||loadError||scannerBusy||targetScannerEnabled===scannerEnabled||!scannerReason.trim()||scannerCode.length!==6}>{scannerBusy?scanText.saving:scanText.save}</button>{scannerFeedback&&<span role="status">{scannerFeedback}</span>}</div>
      <div className={styles.audit}><h4>{scanText.audit}</h4>{scannerAudit.length===0?<p className={styles.state}>{scanText.empty}</p>:<ol className={styles.auditList}>{scannerAudit.map(entry=><li key={entry.id}><div><strong>{entry.enabled_after?scanText.on:scanText.off}</strong><time dateTime={entry.occurred_at}>{new Date(entry.occurred_at).toLocaleString(t.dateLocale)}</time></div><p>{entry.reason}</p><small>{scanText.actor}: {entry.actor_user_id??"—"}</small></li>)}</ol>}</div>
    </section>
    {loadError?<p className={styles.state} role="alert">{t.error}</p>:loading?<p className={styles.state} role="status">{t.loading}</p>:rules.length===0?<p className={styles.state} role="status">{t.empty}</p>:<ul className={styles.list}>{rules.map(rule=><li className={styles.item} key={rule.id}>
      <div className={styles.ruleHead}><strong>{rule.term}</strong><span data-risk={rule.risk_level}>{rule.risk_level==="high"?t.high:t.ordinary}</span></div>
      <div className={styles.meta}><span>{t[rule.language==="zh-CN"?"zh":rule.language]}</span><span>{rule.active?t.enabled:t.disabled}</span><time dateTime={rule.updated_at}>{t.updated}: {new Date(rule.updated_at).toLocaleString(t.dateLocale)}</time></div>
      <button className={styles.button} type="button" onClick={()=>startEdit(rule)}>{t.edit}</button>
    </li>)}</ul>}
    <div className={styles.actions}><button className="button button-primary" type="button" onClick={()=>startEdit()}>{t.add}</button></div>
    {editing&&<div className={styles.form}>
      <label>{t.term}<input maxLength={120} value={form.term} onChange={event=>setForm(current=>({...current,term:event.target.value}))}/><small>{t.termHint}</small></label>
      <label>{t.language}<select value={form.language} onChange={event=>setForm(current=>({...current,language:event.target.value as Language}))}><option value="any">{t.any}</option><option value="en">{t.en}</option><option value="zh-CN">{t.zh}</option><option value="ms">{t.ms}</option></select></label>
      <label>{t.risk}<select value={form.risk} onChange={event=>setForm(current=>({...current,risk:event.target.value as RiskLevel}))}><option value="ordinary">{t.ordinary}</option><option value="high">{t.high}</option></select></label>
      <label className={styles.check}><input type="checkbox" checked={form.active} onChange={event=>setForm(current=>({...current,active:event.target.checked}))}/>{t.active}</label>
      <label>{t.reason}<textarea maxLength={500} value={form.reason} onChange={event=>setForm(current=>({...current,reason:event.target.value}))} placeholder={t.reasonPlaceholder}/></label>
      <label>{t.totp}<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))}/></label>
      <div className={styles.actions}><button className="button button-primary" type="button" onClick={()=>void save()} disabled={busy||form.term.trim().length<2||!form.reason.trim()||code.length!==6}>{busy?t.saving:t.save}</button><button className={styles.button} type="button" onClick={()=>{setEditing(false);setCode("");setFeedback("");}} disabled={busy}>{t.cancel}</button></div>
    </div>}
    {feedback&&<p className={styles.feedback} role="status" aria-live="polite">{feedback}</p>}
    <section className={styles.audit} aria-labelledby="owner-risk-audit-title"><h4 id="owner-risk-audit-title">{t.auditTitle}</h4>
      {loadError?<p className={styles.state} role="alert">{t.auditError}</p>:audit.length===0?<p className={styles.state}>{t.auditEmpty}</p>:<ol className={styles.auditList}>{audit.map(entry=>{
        const after=entry.after_value as Record<string,unknown>;
        const before=entry.before_value as Record<string,unknown>|null;
        const term=typeof after.term==="string"?after.term:"";
        const changed=entry.action==="created"?t.created:t.changed;
        const beforeRisk=before?.risk_level;
        const afterRisk=after.risk_level;
        return <li key={entry.id}><div><strong>{changed}: {term}</strong><time dateTime={entry.occurred_at}>{new Date(entry.occurred_at).toLocaleString(t.dateLocale)}</time></div><p>{entry.reason}</p>{beforeRisk!==undefined&&beforeRisk!==afterRisk&&<small>{String(beforeRisk)} → {String(afterRisk)}</small>}<small>{t.actor}: {entry.actor_user_id??"—"}</small></li>;
      })}</ol>}
    </section>
  </section>;
}
