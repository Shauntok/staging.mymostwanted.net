"use client";

import {useCallback,useEffect,useState,type FormEvent} from "react";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import type {Locale} from "@/lib/i18n/catalog";
import {ReactionGlyph,type ReactionIconId} from "@/components/public-posts/ReactionGlyph";
import styles from "./OwnerReactionIconSettings.module.css";

type ReactionKey="helpful"|"thanks"|"support";
type IconSettings=Record<ReactionKey,ReactionIconId>;
const defaults:IconSettings={helpful:"spark",thanks:"heart",support:"hands"};
const iconIds:ReactionIconId[]=["spark","heart","thumbs_up","hands","check","lightbulb"];
const copy:Record<Locale,{title:string;intro:string;guardrail:string;loading:string;unavailable:string;helpful:string;thanks:string;support:string;reason:string;reasonHint:string;totp:string;save:string;saving:string;saved:string;error:string;icons:Record<ReactionIconId,string>}>={
  "zh-CN":{title:"Reaction 图标",intro:"为帖子上的三种 Reaction 选择统一图标。仅可使用内置图标，不开放上传；Reaction 类型和统计保持不变。每次保存需近期 TOTP、填写原因并写入审计。",guardrail:"这些设置只更换显示图形，不改变反应含义、数据或可用权限。",loading:"正在读取 Reaction 图标…",unavailable:"无法读取图标设置。请确认本地数据库迁移已应用。",helpful:"有帮助",thanks:"谢谢",support:"支持",reason:"变更原因（必填）",reasonHint:"说明图标更改原因",totp:"6 位 Authenticator TOTP",save:"保存图标",saving:"正在验证并保存…",saved:"Reaction 图标已保存并记入审计。",error:"保存失败。请检查 Owner 权限、近期 TOTP 和迁移状态。",icons:{spark:"星芒",heart:"爱心",thumbs_up:"赞同",hands:"关怀",check:"确认",lightbulb:"灵感"}},
  en:{title:"Reaction icons",intro:"Choose a consistent built-in icon for each post reaction. Uploads are not enabled; reaction types and counts stay unchanged. Every save requires recent TOTP, a reason and an audit entry.",guardrail:"These settings only change the displayed glyph. They do not change reaction meaning, data or access.",loading:"Loading reaction icons…",unavailable:"Could not read icon settings. Confirm the local database migration is applied.",helpful:"Helpful",thanks:"Thanks",support:"Support",reason:"Reason for change (required)",reasonHint:"Explain why the icons are changing",totp:"6-digit authenticator TOTP",save:"Save icons",saving:"Verifying and saving…",saved:"Reaction icons saved and audited.",error:"Save failed. Check Owner access, recent TOTP and migration status.",icons:{spark:"Spark",heart:"Heart",thumbs_up:"Thumbs up",hands:"Care",check:"Check",lightbulb:"Idea"}},
  ms:{title:"Ikon reaksi",intro:"Pilih ikon terbina dalam yang seragam untuk setiap reaksi hantaran. Muat naik tidak dibuka; jenis dan jumlah reaksi kekal. Setiap simpanan memerlukan TOTP terkini, sebab dan rekod audit.",guardrail:"Tetapan ini hanya menukar ikon paparan. Maksud, data dan akses reaksi tidak berubah.",loading:"Memuatkan ikon reaksi…",unavailable:"Tetapan ikon tidak dapat dibaca. Sahkan migrasi pangkalan data setempat.",helpful:"Berguna",thanks:"Terima kasih",support:"Sokongan",reason:"Sebab perubahan (wajib)",reasonHint:"Terangkan sebab ikon ditukar",totp:"TOTP aplikasi pengesah 6 digit",save:"Simpan ikon",saving:"Mengesahkan dan menyimpan…",saved:"Ikon reaksi disimpan dan diaudit.",error:"Simpanan gagal. Semak akses Owner, TOTP terkini dan status migrasi.",icons:{spark:"Bintang",heart:"Hati",thumbs_up:"Suka",hands:"Prihatin",check:"Semak",lightbulb:"Idea"}},
};
const keys:ReactionKey[]=["helpful","thanks","support"];

function parseIcons(value:unknown):IconSettings|null{
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const record=value as Record<string,unknown>;
  if(keys.some(key=>!iconIds.includes(record[key] as ReactionIconId)))return null;
  return {helpful:record.helpful as ReactionIconId,thanks:record.thanks as ReactionIconId,support:record.support as ReactionIconId};
}

export function OwnerReactionIconSettings(){
  const {locale}=usePreferences();const t=copy[locale];
  const [icons,setIcons]=useState<IconSettings>(defaults);const [reason,setReason]=useState("");const [code,setCode]=useState("");
  const [loading,setLoading]=useState(true);const [failed,setFailed]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const load=useCallback(async()=>{
    try{const {data,error}=await createSupabaseBrowserClient().rpc("owner_get_reaction_icon_settings");const parsed=parseIcons(data);if(error||!parsed)throw error??new Error("Invalid reaction icon settings");setIcons(parsed);setFailed(false);}
    catch{setFailed(true);}finally{setLoading(false);}
  },[]);
  useEffect(()=>{let active=true;void (async()=>{try{const {data,error}=await createSupabaseBrowserClient().rpc("owner_get_reaction_icon_settings");const parsed=parseIcons(data);if(error||!parsed)throw error??new Error("Invalid reaction icon settings");if(active){setIcons(parsed);setFailed(false);}}catch{if(active)setFailed(true);}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[]);

  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy||!reason.trim()||reason.trim().length>500||!/^[0-9]{6}$/.test(code))return;setBusy(true);setMessage("");
    try{const supabase=createSupabaseBrowserClient();const {data:factors,error:listError}=await supabase.auth.mfa.listFactors();if(listError)throw listError;const factor=factors.totp.find(item=>item.status==="verified");if(!factor)throw new Error("Verified TOTP unavailable");const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:factor.id});if(challengeError||!challenge)throw challengeError??new Error("TOTP challenge unavailable");const {error:verifyError}=await supabase.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code});if(verifyError)throw verifyError;
      const {data,error}=await supabase.rpc("owner_update_reaction_icon_settings",{p_helpful_icon:icons.helpful,p_thanks_icon:icons.thanks,p_support_icon:icons.support,p_reason:reason.trim()});if(error||data!==true)throw error??new Error("Reaction icon update rejected");setMessage(t.saved);setReason("");setCode("");await load();
    }catch{setCode("");setMessage(t.error);}finally{setBusy(false);}
  }

  return <section className={styles.panel} lang={locale} aria-labelledby="owner-reaction-icons-title"><div><p className={styles.eyebrow}>MMWR · OWNER</p><h2 id="owner-reaction-icons-title">{t.title}</h2></div><p className={styles.intro}>{t.intro}</p><p className={styles.guardrail}>{t.guardrail}</p>
    {loading?<p className={styles.status} role="status">{t.loading}</p>:failed?<p className={styles.status} role="alert">{t.unavailable}</p>:<form onSubmit={save}><div className={styles.rows}>{keys.map(key=><label className={styles.row} key={key}><strong>{t[key]}</strong><select value={icons[key]} onChange={event=>setIcons(current=>({...current,[key]:event.target.value as ReactionIconId}))}>{iconIds.map(iconId=><option value={iconId} key={iconId}>{t.icons[iconId]}</option>)}</select><span className={styles.preview}><ReactionGlyph iconId={icons[key]}/></span></label>)}</div>
      <label className={styles.field}>{t.reason}<input value={reason} maxLength={500} onChange={event=>setReason(event.target.value)} placeholder={t.reasonHint}/></label><label className={styles.field}>{t.totp}<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))}/></label><button className={styles.save} type="submit" disabled={busy||!reason.trim()||!/^[0-9]{6}$/.test(code)}>{busy?t.saving:t.save}</button>{message&&<p className={styles.feedback} role="status">{message}</p>}</form>}
  </section>;
}
