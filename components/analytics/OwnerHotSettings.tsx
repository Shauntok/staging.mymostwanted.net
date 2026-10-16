"use client";

import {useCallback,useEffect,useState,type FormEvent} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import type {Locale} from "@/lib/i18n/catalog";
import styles from "./OwnerHotSettings.module.css";

const copy:Record<Locale,{title:string;intro:string;defaultOff:string;loading:string;unavailable:string;minimum:string;reason:string;reasonHint:string;totp:string;save:string;saving:string;saved:string;error:string;invalid:string}>={
  "zh-CN":{title:"Hot 有效阅读门槛",intro:"设置帖子进入自然热榜前，过去 24 小时所需的最低有效阅读数。评分使用 1 小时、6 小时和 24 小时窗口；此设置不会启用阅读采集或公开热榜。",defaultOff:"当前 Valid Read 采集和 Hot 排名仍关闭。更改门槛只会写入设置并记录审计。",loading:"正在读取 Owner 设置…",unavailable:"无法读取或保存 Hot 门槛。请确认 Owner 身份、TOTP 及本地迁移状态。",minimum:"过去 24 小时最低有效阅读数",reason:"变更原因（必填）",reasonHint:"说明调整门槛的原因",totp:"6 位 Authenticator TOTP",save:"保存门槛",saving:"正在验证并保存…",saved:"Hot 门槛已保存并记入审计。采集和榜单仍关闭。",error:"保存失败。请检查 Owner 权限、近期 TOTP 和迁移状态。",invalid:"门槛须为 1 至 100,000 的整数；原因最多 500 字。"},
  en:{title:"Hot valid-read threshold",intro:"Set the minimum number of valid reads a post needs in the last 24 hours to qualify for the natural Hot ranking. The score uses 1-hour, 6-hour and 24-hour windows. This setting does not enable collection or the public ranking.",defaultOff:"Valid Read collection and Hot ranking are currently off. Changing this threshold only saves the setting and an audit record.",loading:"Loading Owner settings…",unavailable:"Could not read or save the Hot threshold. Check Owner access, TOTP and the local migration state.",minimum:"Minimum valid reads in the last 24 hours",reason:"Reason for change (required)",reasonHint:"Explain why the threshold is changing",totp:"6-digit authenticator TOTP",save:"Save threshold",saving:"Verifying and saving…",saved:"Hot threshold saved and audited. Collection and ranking remain off.",error:"Save failed. Check Owner access, recent TOTP and migration state.",invalid:"Use an integer from 1 to 100,000 and a reason of at most 500 characters."},
  ms:{title:"Ambang bacaan sah Hot",intro:"Tetapkan bilangan minimum bacaan sah dalam 24 jam yang diperlukan untuk melayakkan hantaran ke kedudukan Hot semula jadi. Skor menggunakan tetingkap 1 jam, 6 jam dan 24 jam. Tetapan ini tidak mengaktifkan pengumpulan atau kedudukan awam.",defaultOff:"Pengumpulan Valid Read dan kedudukan Hot masih dimatikan. Perubahan ambang hanya menyimpan tetapan dan rekod audit.",loading:"Memuatkan tetapan Owner…",unavailable:"Ambang Hot tidak dapat dibaca atau disimpan. Semak akses Owner, TOTP dan status migrasi setempat.",minimum:"Bacaan sah minimum dalam 24 jam terakhir",reason:"Sebab perubahan (wajib)",reasonHint:"Terangkan sebab ambang diubah",totp:"TOTP aplikasi pengesah 6 digit",save:"Simpan ambang",saving:"Mengesahkan dan menyimpan…",saved:"Ambang Hot disimpan dan diaudit. Pengumpulan dan kedudukan masih dimatikan.",error:"Simpanan gagal. Semak akses Owner, TOTP terkini dan status migrasi.",invalid:"Gunakan integer 1 hingga 100,000 dan sebab maksimum 500 aksara."},
};

export function OwnerHotSettings(){
  const {locale}=usePreferences();
  const t=copy[locale];
  const [minimum,setMinimum]=useState("100");
  const [reason,setReason]=useState("");
  const [code,setCode]=useState("");
  const [loading,setLoading]=useState(true);
  const [failed,setFailed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const load=useCallback(async()=>{
    try{
      const {data,error}=await createSupabaseBrowserClient().rpc("owner_get_hot_read_minimum");
      const value=Number(data);
      if(error||!Number.isSafeInteger(value)||value<1||value>100000)throw error??new Error("Invalid Hot threshold");
      setMinimum(String(value));setFailed(false);
    }catch{setFailed(true);}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{let active=true;void Promise.resolve().then(()=>active?load():undefined);return()=>{active=false;};},[load]);

  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const parsed=Number(minimum);
    if(busy||!Number.isSafeInteger(parsed)||parsed<1||parsed>100000||!reason.trim()||reason.trim().length>500||!/^\d{6}$/.test(code))return;
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
      const {data,error}=await supabase.rpc("owner_update_hot_read_minimum",{p_minimum:parsed,p_reason:reason.trim()});
      if(error||data!==true)throw error??new Error("Threshold update rejected");
      setMessage(t.saved);setReason("");setCode("");
      await load();
    }catch{setCode("");setMessage(t.error);}
    finally{setBusy(false);}
  }

  return <section className={styles.panel} lang={locale} aria-labelledby="owner-hot-settings-title">
    <p className={styles.eyebrow}>MMWR · OWNER</p>
    <h2 id="owner-hot-settings-title">{t.title}</h2>
    <p className={styles.intro}>{t.intro}</p>
    <p className={styles.guardrail}>{t.defaultOff}</p>
    {loading?<p className={styles.status} role="status">{t.loading}</p>:failed?<p className={styles.status} role="alert">{t.unavailable}</p>:<form onSubmit={save}>
      <label className={styles.field}>{t.minimum}<input type="number" min={1} max={100000} step={1} inputMode="numeric" value={minimum} onChange={event=>setMinimum(event.target.value)}/></label>
      <label className={styles.field}>{t.reason}<input maxLength={500} value={reason} onChange={event=>setReason(event.target.value)} placeholder={t.reasonHint}/></label>
      <label className={styles.field}>{t.totp}<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))}/></label>
      <button className={styles.save} type="submit" disabled={busy||!Number.isSafeInteger(Number(minimum))||Number(minimum)<1||Number(minimum)>100000||!reason.trim()||!/^\d{6}$/.test(code)}>{busy?t.saving:t.save}</button>
      {message&&<p className={styles.feedback} role="status">{message}</p>}
      <p className={styles.hint}>{t.invalid}</p>
    </form>}
  </section>;
}
