"use client";

import {useCallback,useEffect,useState} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import type {Locale} from "@/lib/i18n/catalog";
import styles from "./OwnerCriticalSecurityEmail.module.css";

type AuditRow={id:number;actor_user_id:string|null;enabled_before:boolean;enabled_after:boolean;reason:string;occurred_at:string};
const copy:Record<Locale,{
  title:string;intro:string;enabled:string;disabled:string;loading:string;reload:string;reason:string;placeholder:string;totp:string;
  save:string;saving:string;saved:string;loadError:string;saveError:string;required:string;on:string;off:string;audit:string;empty:string;actor:string;
  serverGate:string;
}>={
  "zh-CN":{title:"关键安全邮件",intro:"目前唯一已接入的登录告警来源是工作人员恢复码连续失败达到阈值。备份失败/校验失败和严重生产安全事件尚未接入事件来源，不会触发邮件。邮件只发给有效且邮箱已确认的 Owner；普通登录失败、其他登录异常、举报与日常后台通知不会发送邮件。邮件不包含报告正文、证据、IP 或账号资料。",enabled:"数据库策略：开启",disabled:"数据库策略：关闭",loading:"正在读取设置…",reload:"刷新",reason:"变更原因（必填）",placeholder:"说明启用或关闭的原因",totp:"6 位 Authenticator TOTP",save:"验证并更新",saving:"正在验证并更新…",saved:"设置与审计已更新。实际发送还要求服务器邮件开关、SMTP 和独立调度密钥均已配置。",loadError:"无法读取设置。请确认迁移已应用，并重新验证 Owner TOTP。",saveError:"设置未更新。请检查 Owner 权限、TOTP、原因和迁移状态。",required:"填写原因并输入 6 位验证码。",on:"开启",off:"关闭",audit:"最近设置审计",empty:"暂无变更。",actor:"操作人",serverGate:"实际发送默认关闭；Owner 开启此数据库策略并不会单独触发邮件。服务器配置缺失、迁移未应用或调度密钥无效时，发送器会停止。关闭策略会取消尚未发送的队列邮件；邮件服务已接受的邮件无法撤回。"},
  en:{title:"Critical security email",intro:"The only connected sign-in alert source is the staff recovery-code failure threshold. Backup failures or validation failures and severe production-security incidents have no connected event sources yet and will not trigger email. Messages go only to active Owners with confirmed email addresses. Ordinary sign-in failures, other sign-in anomalies, reports and routine staff notifications do not send email. Messages contain no report text, evidence, IP address or account profile data.",enabled:"Database policy: enabled",disabled:"Database policy: disabled",loading:"Loading settings…",reload:"Reload",reason:"Reason for change (required)",placeholder:"Explain why the setting should change",totp:"6-digit authenticator TOTP",save:"Verify and update",saving:"Verifying and updating…",saved:"Setting and audit updated. Actual delivery also requires the server email flag, SMTP and a separate dispatch secret.",loadError:"Could not read the setting. Confirm the migration is applied and verify Owner TOTP again.",saveError:"Setting was not updated. Check Owner access, TOTP, reason and migration status.",required:"Enter a reason and the 6-digit code.",on:"Enable",off:"Disable",audit:"Recent setting audit",empty:"No changes yet.",actor:"Actor",serverGate:"Actual sending is off by default. Enabling this database policy does not send mail by itself. The sender stops if server configuration, the migration or dispatch secret is missing. Disabling the policy cancels queued mail; a message already accepted by the mail provider cannot be recalled."},
  ms:{title:"E-mel keselamatan kritikal",intro:"Satu-satunya sumber amaran log masuk yang telah disambungkan ialah ambang kegagalan kod pemulihan kakitangan. Kegagalan sandaran/pengesahan dan insiden keselamatan Production yang serius belum mempunyai sumber peristiwa yang disambungkan, jadi tidak mencetuskan e-mel. E-mel hanya dihantar kepada Owner aktif dengan alamat e-mel yang disahkan. Kegagalan log masuk biasa, anomali log masuk lain, laporan dan pemberitahuan rutin tidak menghantar e-mel. Mesej tidak mengandungi teks laporan, bukti, alamat IP atau profil akaun.",enabled:"Dasar pangkalan data: aktif",disabled:"Dasar pangkalan data: tidak aktif",loading:"Memuatkan tetapan…",reload:"Muat semula",reason:"Sebab perubahan (wajib)",placeholder:"Terangkan sebab tetapan perlu diubah",totp:"TOTP pengesah 6 digit",save:"Sahkan dan kemas kini",saving:"Mengesahkan dan mengemas kini…",saved:"Tetapan dan audit dikemas kini. Penghantaran sebenar juga memerlukan suis e-mel pelayan, SMTP dan rahsia penghantaran berasingan.",loadError:"Tetapan tidak dapat dibaca. Sahkan migrasi telah digunakan dan sahkan semula TOTP Owner.",saveError:"Tetapan tidak dikemas kini. Semak akses Owner, TOTP, sebab dan status migrasi.",required:"Masukkan sebab dan kod 6 digit.",on:"Aktifkan",off:"Nyahaktifkan",audit:"Audit tetapan terkini",empty:"Belum ada perubahan.",actor:"Pelaku",serverGate:"Penghantaran sebenar dimatikan secara lalai. Mengaktifkan dasar pangkalan data ini tidak menghantar e-mel dengan sendiri. Penghantar akan berhenti jika konfigurasi pelayan, migrasi atau rahsia tiada. Menyahaktifkan dasar membatalkan e-mel dalam baris gilir; mesej yang telah diterima oleh penyedia e-mel tidak boleh ditarik balik."}
};

export function OwnerCriticalSecurityEmail(){
  const {locale}=usePreferences();
  const t=copy[locale];
  const [enabled,setEnabled]=useState(false);
  const [target,setTarget]=useState(false);
  const [audit,setAudit]=useState<AuditRow[]>([]);
  const [reason,setReason]=useState("");
  const [code,setCode]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [failed,setFailed]=useState(false);
  const [message,setMessage]=useState("");

  const reload=useCallback(async()=>{
    setLoading(true);setFailed(false);
    try{
      const supabase=createSupabaseBrowserClient();
      const [setting,history]=await Promise.all([
        supabase.rpc("owner_get_critical_security_email"),
        supabase.rpc("owner_list_critical_security_email_audit",{p_limit:30})
      ]);
      if(setting.error||typeof setting.data!=="boolean"||history.error)throw setting.error??history.error??new Error("Settings unavailable");
      const rows=Array.isArray(history.data)?history.data.filter((row):row is AuditRow=>Boolean(row&&typeof row==="object"&&typeof (row as AuditRow).id==="number"&&typeof (row as AuditRow).reason==="string"&&typeof (row as AuditRow).enabled_after==="boolean"&&typeof (row as AuditRow).occurred_at==="string")):[];
      setEnabled(setting.data);setTarget(setting.data);setAudit(rows);
    }catch{setFailed(true);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{
    let active=true;
    const loadInitial=async()=>{
      try{
        const supabase=createSupabaseBrowserClient();
        const [setting,history]=await Promise.all([
          supabase.rpc("owner_get_critical_security_email"),
          supabase.rpc("owner_list_critical_security_email_audit",{p_limit:30})
        ]);
        if(setting.error||typeof setting.data!=="boolean"||history.error)throw setting.error??history.error??new Error("Settings unavailable");
        const rows=Array.isArray(history.data)?history.data.filter((row):row is AuditRow=>Boolean(row&&typeof row==="object"&&typeof (row as AuditRow).id==="number"&&typeof (row as AuditRow).reason==="string"&&typeof (row as AuditRow).enabled_after==="boolean"&&typeof (row as AuditRow).occurred_at==="string")):[];
        if(active){setEnabled(setting.data);setTarget(setting.data);setAudit(rows);}
      }catch{if(active)setFailed(true);}
      finally{if(active)setLoading(false);}
    };
    void loadInitial();
    return()=>{active=false;};
  },[]);

  async function save(){
    if(busy)return;
    if(!reason.trim()||code.length!==6){setMessage(t.required);return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createSupabaseBrowserClient();
      const {data:factors,error:listError}=await supabase.auth.mfa.listFactors();
      if(listError)throw listError;
      const factor=factors.totp.find(item=>item.status==="verified");
      if(!factor)throw new Error("Verified TOTP unavailable");
      const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:factor.id});
      if(challengeError||!challenge)throw challengeError??new Error("TOTP challenge unavailable");
      const {error:verifyError}=await supabase.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code});
      if(verifyError)throw verifyError;
      const {data,error}=await supabase.rpc("owner_set_critical_security_email",{p_enabled:target,p_reason:reason.trim()});
      if(error||data!==true)throw error??new Error("Update rejected");
      setReason("");setCode("");setMessage(t.saved);await reload();
    }catch{setCode("");setMessage(t.saveError);}
    finally{setBusy(false);}
  }

  return <section className={styles.panel} lang={locale} aria-labelledby="critical-security-email-title">
    <header><h2 id="critical-security-email-title">{t.title}</h2><p className={styles.intro}>{t.intro}</p></header>
    {loading?<p className={styles.status} role="status">{t.loading}</p>:failed?<p className={styles.error} role="alert">{t.loadError}</p>:<>
      <p className={styles.policy} data-enabled={enabled}>{enabled?t.enabled:t.disabled}</p>
      <p className={styles.notice}>{t.serverGate}</p>
      <label className={styles.check}><input type="checkbox" checked={target} onChange={event=>setTarget(event.target.checked)} disabled={busy}/>{target?t.on:t.off}</label>
      <div className={styles.form}>
        <label>{t.reason}<textarea maxLength={500} value={reason} onChange={event=>setReason(event.target.value)} placeholder={t.placeholder}/></label>
        <label>{t.totp}<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))}/></label>
        <button type="button" className="button button-primary" onClick={()=>void save()} disabled={busy||target===enabled||!reason.trim()||code.length!==6}>{busy?t.saving:target?t.save:t.save}</button>
        <button type="button" className="button" onClick={()=>void reload()} disabled={busy}>{t.reload}</button>
      </div>
      <section className={styles.audit}><h3>{t.audit}</h3>{audit.length===0?<p>{t.empty}</p>:<ol>{audit.map(row=><li key={row.id}><div><strong>{row.enabled_after?t.on:t.off}</strong><time dateTime={row.occurred_at}>{new Date(row.occurred_at).toLocaleString(locale)}</time></div><p>{row.reason}</p><small>{t.actor}: {row.actor_user_id??"—"}</small></li>)}</ol>}</section>
    </>}
    {message&&<p className={styles.status} role="status" aria-live="polite">{message}</p>}
  </section>;
}
