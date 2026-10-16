"use client";

import {useState} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {clarificationCopy} from "@/components/clarifications/copy";
import styles from "./ClarificationRequestDraft.module.css";

type Selected={post_id:string;approved_title:string;primary_name:string;public_area_name:string;content_type:"story"};
type Suggestion=Selected;

export function ClarificationRequestDraft({supportUrl,canonicalOrigin,initialPost}:{supportUrl:string|null;canonicalOrigin:string|null;initialPost:Selected|null}){
  const {locale}=usePreferences();const t=clarificationCopy[locale];
  const [query,setQuery]=useState("");const [matches,setMatches]=useState<Suggestion[]>([]);const [selected,setSelected]=useState<Selected|null>(initialPost);
  const [explanation,setExplanation]=useState("");const [copied,setCopied]=useState(false);
  async function search(){
    const safe=query.trim().slice(0,120);if(safe.length<2)return;
    try{const response=await fetch("/api/search/suggestions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:safe,contentType:"story"}),cache:"no-store"});
      if(!response.ok){setMatches([]);return;}const payload=await response.json() as {suggestions?:unknown};
      const rows=Array.isArray(payload.suggestions)?payload.suggestions as Suggestion[]:[];
      setMatches(rows.filter(row=>row.content_type==="story"&&/^[0-9a-f-]{36}$/i.test(row.post_id)).slice(0,5));
    }catch{setMatches([]);}
  }
  const caseId=selected?.post_id??"";
  const draftText=selected?[
    locale==="zh-CN"?"澄清请求":locale==="ms"?"Permintaan penjelasan":"Clarification request",
    `Case ID: ${selected.post_id}`,`Post: ${selected.approved_title}`,...(canonicalOrigin?[`URL: ${new URL(`/posts/${selected.post_id}`,canonicalOrigin).toString()}`]:[]),"",
    locale==="zh-CN"?"请说明希望澄清的内容：":locale==="ms"?"Sila nyatakan perkara yang ingin dijelaskan:":"Please explain what you would like clarified:",explanation.trim(),
  ].join("\n"):"";
  const telegramUrl=supportUrl&&selected&&canonicalOrigin?`${supportUrl}?text=${encodeURIComponent(draftText)}`:null;
  async function copyDraft(){try{await navigator.clipboard.writeText(draftText);setCopied(true);window.setTimeout(()=>setCopied(false),2500);}catch{setCopied(false);}}
  return <section className={styles.panel} id="request" aria-labelledby="clarification-request-title">
    <h2 id="clarification-request-title">{t.requestTitle}</h2><p>{t.requestIntro}</p>
    {!supportUrl?<p className={styles.unavailable} role="status">{t.supportUnavailable}</p>:<>
      {!selected&&<div className={styles.search}><label htmlFor="clarification-son-search">{t.searchSon}</label><div><input id="clarification-son-search" maxLength={120} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();void search();}}}/><button type="button" className="button" onClick={()=>void search()}>{t.searchSon}</button></div>
        {matches.length>0&&<ul>{matches.map(item=><li key={item.post_id}><button type="button" onClick={()=>{setSelected(item);setMatches([]);}}><strong>{item.approved_title}</strong><span>{item.primary_name} · {item.public_area_name}</span></button></li>)}</ul>}
      </div>}
      {selected&&<div className={styles.selected}><p><strong>{selected.approved_title}</strong><span>{selected.primary_name} · {selected.public_area_name}</span></p><button type="button" className={styles.change} onClick={()=>{setSelected(null);setExplanation("");}}>{t.searchSon}</button></div>}
      {selected&&<><label className={styles.explanation} htmlFor="clarification-explanation">{t.reason}<textarea id="clarification-explanation" value={explanation} maxLength={2000} onChange={event=>setExplanation(event.target.value)}/><small>{t.reasonHint}</small></label>
        {telegramUrl?<a className="button button-primary" href={telegramUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t.requestInTelegram}</a>:<p className={styles.unavailable} role="status">{t.originUnavailable}</p>}
        <button type="button" className={styles.copy} onClick={()=>void copyDraft()} disabled={!draftText}>{copied?t.copied:t.copyDraft}</button><p className={styles.notice}>{t.requestNotSaved}</p>
      </>}
    </>}
    {caseId&&<span className={styles.srOnly}>Case ID {caseId}</span>}
  </section>;
}
