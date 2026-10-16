"use client";

import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import type {Locale} from "@/lib/i18n/catalog";
import styles from "./OwnerHomeTagSettings.module.css";

type SortMode="manual"|"most_posts"|"smart_mix";
type Tag={tag_id:string;tag_label:string;public_post_count:number};
type Settings={sort_mode:SortMode;manual_tag_ids:string[];tags:Tag[]};

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const copy:Record<Locale,{title:string;intro:string;loading:string;unavailable:string;mode:string;manual:string;most:string;smart:string;manualHint:string;manualList:string;addTag:string;add:string;remove:string;up:string;down:string;noTags:string;reason:string;reasonHint:string;totp:string;save:string;saving:string;saved:string;saveError:string;tagCount:string;limit:string}>= {
  "zh-CN":{title:"首页 Tags 排序",intro:"设置首页 12 个公开 Tag 的排序。手动模式按你的顺序置顶，不足 12 个的位置由公开量较高的 Tag 补齐。每次保存都要重新验证 TOTP、填写原因并记入审计。",loading:"正在载入公开 Tags…",unavailable:"无法读取首页 Tag 设置。请确认 Supabase 迁移已应用，并通过 Owner TOTP 验证。",mode:"首页排序方式",manual:"手动排序",most:"公开帖子最多优先",smart:"Smart Mix（稳定混排）",manualHint:"将最多 12 个 Tag 加入手动顺序；上方的 Tag 会优先显示。剩余位置按公开帖子数补齐。",manualList:"手动置顶顺序",addTag:"添加公开 Tag",add:"添加",remove:"移除",up:"上移",down:"下移",noTags:"目前还没有可排序的已审核公开 Tag。",reason:"变更原因（必填）",reasonHint:"说明这次首页排序调整的原因",totp:"6 位 Authenticator TOTP",save:"保存排序设置",saving:"正在保存…",saved:"首页 Tag 排序已保存并记入审计。",saveError:"无法保存。请检查 Owner 权限、TOTP、原因及迁移状态。",tagCount:"篇公开帖子",limit:"最多 12 个"},
  en:{title:"Homepage Tag order",intro:"Choose how the 12 public Tags on the homepage are ordered. Manual mode puts your chosen Tags first; remaining slots are filled by public post count. Every save requires a fresh TOTP challenge, a reason and an audit entry.",loading:"Loading public Tags…",unavailable:"Could not load homepage Tag settings. Confirm the Supabase migration is applied and Owner TOTP access is valid.",mode:"Homepage order",manual:"Manual order",most:"Most public posts first",smart:"Smart Mix (stable mix)",manualHint:"Add up to 12 Tags to the manual order. Tags nearer the top appear first; remaining slots are filled by public post count.",manualList:"Manual priority order",addTag:"Add a public Tag",add:"Add",remove:"Remove",up:"Move up",down:"Move down",noTags:"There are no reviewed public Tags to order yet.",reason:"Reason for change (required)",reasonHint:"Explain why the homepage Tag order is changing",totp:"6-digit authenticator TOTP",save:"Save Tag order",saving:"Saving…",saved:"Homepage Tag order saved and audited.",saveError:"Could not save. Check Owner access, TOTP, reason and migration status.",tagCount:"public posts",limit:"Up to 12 Tags"},
  ms:{title:"Susunan Tag laman utama",intro:"Pilih susunan 12 Tag awam di laman utama. Mod manual meletakkan Tag pilihan anda dahulu; ruang selebihnya diisi mengikut jumlah hantaran awam. Setiap simpanan memerlukan cabaran TOTP baharu, sebab dan rekod audit.",loading:"Sedang memuatkan Tag awam…",unavailable:"Tetapan Tag laman utama tidak dapat dimuatkan. Sahkan migrasi Supabase dan akses TOTP Owner.",mode:"Susunan laman utama",manual:"Susunan manual",most:"Jumlah hantaran awam tertinggi dahulu",smart:"Smart Mix (campuran stabil)",manualHint:"Tambah sehingga 12 Tag dalam susunan manual. Tag di bahagian atas dipaparkan dahulu; ruang selebihnya diisi mengikut jumlah hantaran awam.",manualList:"Susunan keutamaan manual",addTag:"Tambah Tag awam",add:"Tambah",remove:"Buang",up:"Alih ke atas",down:"Alih ke bawah",noTags:"Belum ada Tag awam yang disemak untuk disusun.",reason:"Sebab perubahan (wajib)",reasonHint:"Terangkan sebab susunan Tag laman utama diubah",totp:"TOTP aplikasi pengesah 6 digit",save:"Simpan susunan Tag",saving:"Sedang menyimpan…",saved:"Susunan Tag laman utama disimpan dan direkodkan dalam audit.",saveError:"Tetapan tidak dapat disimpan. Semak akses Owner, TOTP, sebab dan status migrasi.",tagCount:"hantaran awam",limit:"Sehingga 12 Tag"},
};

export function OwnerHomeTagSettings(){
  const {locale}=usePreferences();
  const t=copy[locale];
  const [settings,setSettings]=useState<Settings|null>(null);
  const [mode,setMode]=useState<SortMode>("smart_mix");
  const [manualIds,setManualIds]=useState<string[]>([]);
  const [addId,setAddId]=useState("");
  const [reason,setReason]=useState("");
  const [code,setCode]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [failed,setFailed]=useState(false);
  const [message,setMessage]=useState("");

  const load=useCallback(async()=>{
    try{
      const supabase=createSupabaseBrowserClient();
      const {data,error}=await supabase.rpc("owner_get_home_tag_settings");
      if(error||!data||typeof data!=="object")throw error??new Error("Invalid settings response");
      const payload=data as Record<string,unknown>;
      const tags=Array.isArray(payload.tags)?payload.tags.filter((item):item is Tag=>{
        if(!item||typeof item!=="object")return false;
        const row=item as Record<string,unknown>;
        return typeof row.tag_id==="string"&&uuidPattern.test(row.tag_id)&&typeof row.tag_label==="string"&&row.tag_label.length>0&&row.tag_label.length<=100&&Number.isFinite(Number(row.public_post_count))&&Number(row.public_post_count)>0;
      }).map(row=>({...row,public_post_count:Number(row.public_post_count)})):[];
      const validIds=new Set(tags.map(tag=>tag.tag_id.toLowerCase()));
      const rawIds=Array.isArray(payload.manual_tag_ids)?payload.manual_tag_ids:[];
      const nextIds=[...new Set(rawIds.filter((id):id is string=>typeof id==="string"&&uuidPattern.test(id)&&validIds.has(id.toLowerCase())).map(id=>id.toLowerCase()))].slice(0,12);
      const nextMode=payload.sort_mode==="manual"||payload.sort_mode==="most_posts"||payload.sort_mode==="smart_mix"?payload.sort_mode:"smart_mix";
      setSettings({sort_mode:nextMode,manual_tag_ids:nextIds,tags});setMode(nextMode);setManualIds(nextIds);setFailed(false);
    }catch{setFailed(true);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{
    let active=true;
    void (async()=>{
      try{
        const supabase=createSupabaseBrowserClient();
        const {data,error}=await supabase.rpc("owner_get_home_tag_settings");
        if(error||!data||typeof data!=="object")throw error??new Error("Invalid settings response");
        const payload=data as Record<string,unknown>;
        const tags=Array.isArray(payload.tags)?payload.tags.filter((item):item is Tag=>{
          if(!item||typeof item!=="object")return false;
          const row=item as Record<string,unknown>;
          return typeof row.tag_id==="string"&&uuidPattern.test(row.tag_id)&&typeof row.tag_label==="string"&&row.tag_label.length>0&&row.tag_label.length<=100&&Number.isFinite(Number(row.public_post_count))&&Number(row.public_post_count)>0;
        }).map(row=>({...row,public_post_count:Number(row.public_post_count)})):[];
        const validIds=new Set(tags.map(tag=>tag.tag_id.toLowerCase()));
        const rawIds=Array.isArray(payload.manual_tag_ids)?payload.manual_tag_ids:[];
        const nextIds=[...new Set(rawIds.filter((id):id is string=>typeof id==="string"&&uuidPattern.test(id)&&validIds.has(id.toLowerCase())).map(id=>id.toLowerCase()))].slice(0,12);
        const nextMode=payload.sort_mode==="manual"||payload.sort_mode==="most_posts"||payload.sort_mode==="smart_mix"?payload.sort_mode:"smart_mix";
        if(!active)return;
        setSettings({sort_mode:nextMode,manual_tag_ids:nextIds,tags});setMode(nextMode);setManualIds(nextIds);setFailed(false);
      }catch{if(active)setFailed(true);}
      finally{if(active)setLoading(false);}
    })();
    return ()=>{active=false;};
  },[]);
  const tagById=useMemo(()=>new Map(settings?.tags.map(tag=>[tag.tag_id.toLowerCase(),tag])??[]),[settings]);
  const availableTags=(settings?.tags??[]).filter(tag=>!manualIds.includes(tag.tag_id.toLowerCase()));

  function move(index:number,offset:-1|1){
    const next=index+offset;
    if(next<0||next>=manualIds.length)return;
    setManualIds(current=>{const reordered=[...current];[reordered[index],reordered[next]]=[reordered[next],reordered[index]];return reordered;});
  }

  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||!reason.trim()||reason.trim().length>500||!/^[0-9]{6}$/.test(code))return;
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
      const {data,error}=await supabase.rpc("owner_update_home_tag_settings",{
        p_sort_mode:mode,p_manual_tag_ids:manualIds,p_reason:reason.trim(),
      });
      if(error||data!==true)throw error??new Error("Settings update rejected");
      setMessage(t.saved);setReason("");setCode("");
      await load();
    }catch{setCode("");setMessage(t.saveError);}
    finally{setBusy(false);}
  }

  return <section className={styles.panel} lang={locale} aria-labelledby="owner-home-tags-title">
    <p className={styles.eyebrow}>MMWR · OWNER</p>
    <h2 id="owner-home-tags-title">{t.title}</h2>
    <p className={styles.intro}>{t.intro}</p>
    {loading?<p className={styles.status} role="status">{t.loading}</p>:failed?<p className={styles.status} role="alert">{t.unavailable}</p>:!settings||settings.tags.length===0?<p className={styles.status} role="status">{t.noTags}</p>:<form onSubmit={save}>
      <label className={styles.field}>{t.mode}<select value={mode} onChange={event=>setMode(event.target.value as SortMode)}><option value="manual">{t.manual}</option><option value="most_posts">{t.most}</option><option value="smart_mix">{t.smart}</option></select></label>
      {mode==="manual"&&<div className={styles.manual}>
        <p>{t.manualHint}</p>
        <div className={styles.addRow}><label className={styles.field}>{t.addTag}<select value={addId} onChange={event=>setAddId(event.target.value)}><option value="">{t.limit}</option>{availableTags.map(tag=><option value={tag.tag_id} key={tag.tag_id}>{tag.tag_label} · {tag.public_post_count}</option>)}</select></label><button type="button" className={styles.add} disabled={!addId||manualIds.length>=12} onClick={()=>{setManualIds(ids=>[...ids,addId.toLowerCase()]);setAddId("");}}>{t.add}</button></div>
        <h3>{t.manualList} · {manualIds.length}/12</h3>
        <ol className={styles.list}>{manualIds.map((id,index)=>{const tag=tagById.get(id);if(!tag)return null;return <li key={id}><span className={styles.position}>{index+1}</span><span className={styles.tagCopy}><strong>{tag.tag_label}</strong><small>{tag.public_post_count} {t.tagCount}</small></span><div className={styles.reorder}><button type="button" aria-label={`${t.up}: ${tag.tag_label}`} disabled={index===0} onClick={()=>move(index,-1)}>↑</button><button type="button" aria-label={`${t.down}: ${tag.tag_label}`} disabled={index===manualIds.length-1} onClick={()=>move(index,1)}>↓</button><button type="button" aria-label={`${t.remove}: ${tag.tag_label}`} onClick={()=>setManualIds(ids=>ids.filter(item=>item!==id))}>×</button></div></li>;})}</ol>
      </div>}
      <label className={styles.field}>{t.reason}<input value={reason} maxLength={500} onChange={event=>setReason(event.target.value)} placeholder={t.reasonHint}/></label>
      <label className={styles.field}>{t.totp}<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))}/></label>
      <button className={styles.save} type="submit" disabled={busy||!reason.trim()||!/^[0-9]{6}$/.test(code)}>{busy?t.saving:t.save}</button>
      {message&&<p className={styles.feedback} role="status">{message}</p>}
    </form>}
  </section>;
}
