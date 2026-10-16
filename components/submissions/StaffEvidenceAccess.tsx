"use client";

import {useEffect,useState} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {createStaffEvidencePreviewUrl,getStaffSubmissionEvidence,type StaffEvidenceItem} from "@/app/admin/evidence-actions";
import styles from "./StaffEvidenceAccess.module.css";

const copy={
  "zh-CN":{title:"内部附件",closed:"内部附件预览默认关闭。",empty:"没有可预览的已扫描附件。",unavailable:"附件列表暂时无法读取。",load:"正在读取附件…",open:"短时查看",opening:"正在准备…",expires:"链接仅 60 秒有效；请勿复制或转发。",error:"无法安全生成预览链接，请重新验证后台权限后重试。",image:"图片",pdf:"PDF 文件",audio:"音频",document:"文档",attachment:"个附件",dateLocale:"zh-CN"},
  en:{title:"Internal attachments",closed:"Internal attachment preview is disabled by default.",empty:"There are no clean, scanned attachments available to preview.",unavailable:"The attachment list is temporarily unavailable.",load:"Loading attachments…",open:"Open temporary preview",opening:"Preparing…",expires:"This link expires after 60 seconds. Do not copy or share it.",error:"A secure preview link could not be created. Recheck staff access and try again.",image:"Image",pdf:"PDF file",audio:"Audio",document:"Document",attachment:"attachments",dateLocale:"en-MY"},
  ms:{title:"Lampiran dalaman",closed:"Pratonton lampiran dalaman dilumpuhkan secara lalai.",empty:"Tiada lampiran bersih yang telah diimbas untuk pratonton.",unavailable:"Senarai lampiran tidak dapat dibaca buat sementara waktu.",load:"Memuatkan lampiran…",open:"Buka pratonton sementara",opening:"Sedang menyediakan…",expires:"Pautan ini tamat selepas 60 saat. Jangan salin atau kongsikannya.",error:"Pautan pratonton selamat tidak dapat dibuat. Semak akses kakitangan dan cuba lagi.",image:"Imej",pdf:"Fail PDF",audio:"Audio",document:"Dokumen",attachment:"lampiran",dateLocale:"ms-MY"}
} as const;

function kind(mime:string,t:typeof copy[keyof typeof copy]){
  if(mime.startsWith("image/"))return t.image;
  if(mime==="application/pdf")return t.pdf;
  if(mime.startsWith("audio/"))return t.audio;
  return t.document;
}

export function StaffEvidenceAccess({submissionId}:{submissionId:string}){
  const {locale}=usePreferences();const t=copy[locale];
  const [items,setItems]=useState<StaffEvidenceItem[]>([]);const [enabled,setEnabled]=useState(false);const [loading,setLoading]=useState(true);const [failed,setFailed]=useState(false);const [busy,setBusy]=useState<string|null>(null);const [links,setLinks]=useState<Record<string,string>>({});const [error,setError]=useState(false);
  useEffect(()=>{let active=true;void getStaffSubmissionEvidence(submissionId).then(result=>{if(!active)return;setFailed(!result.ok);setEnabled(result.enabled);setItems(result.items);}).catch(()=>{if(active)setFailed(true);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[submissionId]);
  useEffect(()=>{if(!Object.keys(links).length)return;const timer=window.setTimeout(()=>setLinks({}),65000);return()=>window.clearTimeout(timer);},[links]);
  async function open(itemId:string){if(busy)return;setBusy(itemId);setError(false);setLinks(current=>{const next={...current};delete next[itemId];return next;});try{const result=await createStaffEvidencePreviewUrl(itemId);if(!result.ok||!result.url)throw new Error("Preview unavailable");setLinks(current=>({...current,[itemId]:result.url!}));}catch{setError(true);}finally{setBusy(null);}}
  return <section className={styles.panel} aria-labelledby="staff-evidence-title"><h3 id="staff-evidence-title">{t.title}</h3>
    {loading?<p>{t.load}</p>:failed?<p role="alert">{t.unavailable}</p>:!enabled?<p>{t.closed}</p>:items.length===0?<p>{t.empty}</p>:<ul>{items.map(item=><li key={item.id}><span>{kind(item.mimeType,t)} · {new Date(item.createdAt).toLocaleDateString(t.dateLocale)}</span>{links[item.id]?<a href={links[item.id]} target="_blank" rel="noreferrer" referrerPolicy="no-referrer">{t.open}</a>:<button type="button" onClick={()=>void open(item.id)} disabled={busy!==null}>{busy===item.id?t.opening:t.open}</button>}</li>)}</ul>}
    {enabled&&items.length>0&&<p className={styles.note}>{t.expires}</p>}{error&&<p className={styles.error} role="alert">{t.error}</p>}
  </section>;
}
