"use client";

import {useEffect,useId,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import type {KeyboardEvent} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {localizedPath} from "@/lib/i18n/routing";
import styles from "./SearchExperience.module.css";

type Suggestion={post_id:string;primary_name:string;approved_title:string;public_area_name:string;content_type?:"story"|"clarification"};

const copy={
  "zh-CN":{label:"搜索姓名、标题、地区、标签或关键词",placeholder:"输入姓名、标题、地区、标签或关键词…",submit:"搜索",suggestions:"搜索建议",loading:"正在查找公开内容…",unavailable:"建议暂时不可用，请提交搜索查看结果。",rateLimited:"搜索请求过于频繁，请稍后再试。",area:"地区",clarification:"澄清"},
  en:{label:"Search a name, title, area, tag, or keyword",placeholder:"Enter a name, title, area, tag, or keyword…",submit:"Search",suggestions:"Search suggestions",loading:"Looking for public content…",unavailable:"Suggestions are temporarily unavailable. Submit the search to view results.",rateLimited:"Too many search requests. Please try again shortly.",area:"Area",clarification:"Clarification"},
  ms:{label:"Cari nama, tajuk, kawasan, tag atau kata kunci",placeholder:"Masukkan nama, tajuk, kawasan, tag atau kata kunci…",submit:"Cari",suggestions:"Cadangan carian",loading:"Mencari kandungan awam…",unavailable:"Cadangan tidak tersedia buat sementara waktu. Hantar carian untuk melihat hasil.",rateLimited:"Terlalu banyak permintaan carian. Cuba lagi sebentar lagi.",area:"Kawasan",clarification:"Penjelasan"},
} as const;

export function SearchBox({initialQuery}:{initialQuery:string}){
  const router=useRouter();
  const {locale}=usePreferences();
  const t=copy[locale];
  const listId=useId();
  const previousQuery=useRef(initialQuery.trim().slice(0,120));
  const [query,setQuery]=useState(initialQuery);
  const [suggestions,setSuggestions]=useState<Suggestion[]>([]);
  const [activeIndex,setActiveIndex]=useState(-1);
  const [focused,setFocused]=useState(false);
  const [requestState,setRequestState]=useState<"idle"|"loading"|"unavailable"|"rate-limited">("idle");

  useEffect(()=>{
    const normalized=query.trim().slice(0,120);
    if(normalized===previousQuery.current)return;
    previousQuery.current=normalized;
    if(normalized.length<2)return;
    const controller=new AbortController();
    const timeout=window.setTimeout(async()=>{
      setRequestState("loading");
      try{
        const response=await fetch("/api/search/suggestions",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({query:normalized}),
          cache:"no-store",
          signal:controller.signal,
        });
        if(response.status===429){setSuggestions([]);setRequestState("rate-limited");return;}
        if(!response.ok){setSuggestions([]);setRequestState("unavailable");return;}
        const data=await response.json() as {suggestions?:unknown};
        const rows=Array.isArray(data.suggestions)?data.suggestions as Suggestion[]:[];
        setSuggestions(rows.slice(0,5));
        setRequestState("idle");
      }catch(error){
        if(error&&typeof error==="object"&&"name" in error&&error.name==="AbortError")return;
        setSuggestions([]);
        setRequestState("unavailable");
      }
    },500);

    return ()=>{window.clearTimeout(timeout);controller.abort();};
  },[query]);

  const updateQuery=(value:string)=>{
    setQuery(value);
    setActiveIndex(-1);
    setSuggestions([]);
    setRequestState("idle");
  };

  const selectSuggestion=(suggestion:Suggestion)=>{
    router.push(localizedPath(suggestion.content_type==="clarification"?`/clarifications/${suggestion.post_id}`:`/posts/${suggestion.post_id}`,locale));
  };

  const onKeyDown=(event:KeyboardEvent<HTMLInputElement>)=>{
    if(event.key==="ArrowDown"&&suggestions.length){
      event.preventDefault();
      setFocused(true);
      setActiveIndex(index=>index<0?0:Math.min(index+1,suggestions.length-1));
    }else if(event.key==="ArrowUp"&&suggestions.length){
      event.preventDefault();
      setActiveIndex(index=>index<0?suggestions.length-1:Math.max(index-1,0));
    }else if(event.key==="Escape"){
      setFocused(false);
      setActiveIndex(-1);
    }else if(event.key==="Enter"&&activeIndex>=0&&suggestions[activeIndex]){
      event.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    }
  };

  const showSuggestions=focused&&(suggestions.length>0||requestState==="loading"||requestState==="unavailable"||requestState==="rate-limited");
  const statusText=requestState==="loading"?t.loading:requestState==="unavailable"?t.unavailable:requestState==="rate-limited"?t.rateLimited:"";

  return <form className={styles.form} role="search" action="/search" method="get" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null)){setFocused(false);setActiveIndex(-1);}}}>
    <label className={styles.srOnly} htmlFor="mmwr-search-query">{t.label}</label>
    <div className={styles.inputWrap}>
    <input id="mmwr-search-query" type="search" name="q" maxLength={120} minLength={2} value={query} placeholder={t.placeholder} role="combobox" aria-autocomplete="list" aria-expanded={showSuggestions&&suggestions.length>0} aria-controls={showSuggestions&&suggestions.length>0?listId:undefined} aria-activedescendant={showSuggestions&&activeIndex>=0?`${listId}-option-${activeIndex}`:undefined} onChange={event=>updateQuery(event.target.value)} onFocus={()=>setFocused(true)} onKeyDown={onKeyDown}/>
      {showSuggestions&&<div className={styles.suggestionPanel}>
        {suggestions.length>0?<div id={listId} role="listbox" aria-label={t.suggestions} className={styles.suggestions}>{suggestions.map((suggestion,index)=><button key={suggestion.post_id} id={`${listId}-option-${index}`} type="button" role="option" tabIndex={-1} aria-selected={index===activeIndex} className={styles.suggestion} onMouseDown={event=>event.preventDefault()} onClick={()=>selectSuggestion(suggestion)}>{suggestion.content_type==="clarification"&&<span className={styles.suggestionArea}>{t.clarification}</span>}<span className={styles.suggestionName}>{suggestion.primary_name}</span><span className={styles.suggestionTitle}>{suggestion.approved_title}</span><span className={styles.suggestionArea}>{t.area} · {suggestion.public_area_name}</span></button>)}</div>:statusText&&<p className={styles.suggestionStatus} role="status">{statusText}</p>}
      </div>}
    </div>
    <button className="button button-primary" type="submit">{t.submit}</button>
  </form>;
}
