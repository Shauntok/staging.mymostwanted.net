"use client";

import Link from "@/components/shell/LocalizedLink";
import {useEffect,useState} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {TurnstileWidget} from "@/components/security/TurnstileWidget";
import styles from "./ReportCenter.module.css";

type Kind="report"|"feedback";
type Suggestion={post_id:string;primary_name:string;approved_title:string;public_area_name:string};
type Completion={reference:string;telegramUrl:string|null;telegramText:string};
type ReportResponse=Partial<Completion>&{error?:string};
const copy={
  "zh-CN":{eyebrow:"MMWR · 社区支持",title:"反馈与举报",intro:"在这里举报一篇已公开内容，或向团队提交产品反馈。所有提交均进入站内记录；举报不会自动隐藏帖子。",report:"举报公开内容",feedback:"产品反馈",search:"搜索要举报的公开内容",searchHint:"输入姓名或标题，选择匹配的帖子。",noTargets:"没有找到当前公开内容。",reason:"原因",reasons:{inaccurate_information:"信息可能有误",privacy:"隐私问题",safety:"安全风险",spam:"垃圾或重复内容",suggestion:"建议",accessibility:"无障碍体验",technical_issue:"技术问题",other:"其他"},message:"补充说明",messageHint:"只填写处理此问题所需的信息。请勿填写密码、银行卡号或无关的个人资料。",removeSelection:"移除已选帖子",submit:"提交到站内",sending:"正在提交…",signin:"请先登录后再提交。",signinLink:"登录并返回此页",restricted:"此账号目前不能提交反馈或举报。",captchaMissing:"安全验证尚未配置，暂时无法提交。",captchaError:"请先完成安全验证后重试。",captchaUnavailable:"安全验证暂时不可用，请稍后再试。",sent:"已保存到 MMWR 站内记录。",reference:"参考编号",telegram:"打开 Telegram 并自行选择收件人",telegramMissing:"当前没有可公开访问的 HTTPS 网站地址，因此无法生成 Telegram 分享链接。你可以复制参考文字，再自行决定是否发送及发给谁。",copy:"复制参考文字",copied:"已复制",error:"提交失败。请稍后重试。",rateLimited:"提交过于频繁，请一小时后再试。",loading:"正在查找…",unavailable:"暂时无法搜索公开内容。",feedbackNotice:"此入口不是紧急求助或法律请求渠道；申诉、更正与撤下请求渠道尚未开放。",securityCheck:"提交前请完成防滥用安全验证。",back:"返回首页"},
  en:{eyebrow:"MMWR · COMMUNITY SUPPORT",title:"Feedback & reports",intro:"Report a currently public post or send product feedback. Every submission is recorded on MMWR; reports do not automatically hide posts.",report:"Report public content",feedback:"Product feedback",search:"Search for a public post",searchHint:"Enter a name or title, then choose the matching post.",noTargets:"No currently public posts were found.",reason:"Reason",reasons:{inaccurate_information:"Possibly inaccurate information",privacy:"Privacy concern",safety:"Safety concern",spam:"Spam or duplicate content",suggestion:"Suggestion",accessibility:"Accessibility",technical_issue:"Technical issue",other:"Other"},message:"Details",messageHint:"Include only information needed to review this issue. Do not include passwords, payment card numbers, or unrelated personal data.",removeSelection:"Remove selected post",submit:"Submit privately",sending:"Submitting…",signin:"Sign in before sending a report or feedback.",signinLink:"Sign in and return here",restricted:"This account cannot submit reports or feedback right now.",captchaMissing:"Security verification is not configured, so submissions are unavailable.",captchaError:"Complete the security check and try again.",captchaUnavailable:"Security verification is temporarily unavailable. Try again later.",sent:"Saved to MMWR's private records.",reference:"Reference",telegram:"Open Telegram and choose a recipient yourself",telegramMissing:"No public HTTPS site URL is available, so we cannot create a Telegram share link. You can copy the reference text and decide whether and where to send it.",copy:"Copy reference text",copied:"Copied",error:"Submission failed. Please try again later.",rateLimited:"Too many submissions. Please try again in an hour.",loading:"Searching…",unavailable:"Public content search is temporarily unavailable.",feedbackNotice:"This form is not an emergency or legal request channel. Appeal, correction and takedown channels are not open.",securityCheck:"Complete the anti-abuse security check before submitting.",back:"Back to home"},
  ms:{eyebrow:"MMWR · SOKONGAN KOMUNITI",title:"Maklum balas & laporan",intro:"Laporkan hantaran yang sedang awam atau hantar maklum balas produk. Setiap penghantaran direkodkan di MMWR; laporan tidak menyembunyikan hantaran secara automatik.",report:"Laporkan kandungan awam",feedback:"Maklum balas produk",search:"Cari hantaran awam untuk dilaporkan",searchHint:"Masukkan nama atau tajuk, kemudian pilih hantaran yang sepadan.",noTargets:"Tiada kandungan awam semasa ditemui.",reason:"Sebab",reasons:{inaccurate_information:"Maklumat mungkin tidak tepat",privacy:"Isu privasi",safety:"Isu keselamatan",spam:"Spam atau kandungan pendua",suggestion:"Cadangan",accessibility:"Kebolehcapaian",technical_issue:"Isu teknikal",other:"Lain-lain"},message:"Butiran",messageHint:"Berikan maklumat yang diperlukan untuk menyemak isu ini sahaja. Jangan sertakan kata laluan, nombor kad pembayaran atau data peribadi yang tidak berkaitan.",removeSelection:"Alih keluar hantaran dipilih",submit:"Hantar secara peribadi",sending:"Sedang menghantar…",signin:"Log masuk sebelum menghantar laporan atau maklum balas.",signinLink:"Log masuk dan kembali ke sini",restricted:"Akaun ini tidak boleh menghantar maklum balas atau laporan sekarang.",captchaMissing:"Pengesahan keselamatan belum dikonfigurasi, jadi penghantaran tidak tersedia.",captchaError:"Lengkapkan semakan keselamatan dan cuba lagi.",captchaUnavailable:"Pengesahan keselamatan tidak tersedia buat sementara waktu. Cuba lagi kemudian.",sent:"Disimpan dalam rekod peribadi MMWR.",reference:"Rujukan",telegram:"Buka Telegram dan pilih penerima sendiri",telegramMissing:"Tiada alamat HTTPS awam tersedia, jadi pautan perkongsian Telegram tidak dapat dijana. Anda boleh menyalin teks rujukan dan memilih sama ada serta kepada siapa hendak menghantarnya.",copy:"Salin teks rujukan",copied:"Disalin",error:"Penghantaran gagal. Cuba lagi kemudian.",rateLimited:"Terlalu banyak penghantaran. Cuba lagi dalam masa sejam.",loading:"Sedang mencari…",unavailable:"Carian kandungan awam tidak tersedia buat sementara waktu.",feedbackNotice:"Borang ini bukan saluran kecemasan atau permintaan undang-undang. Saluran rayuan, pembetulan dan penarikan kandungan belum dibuka.",securityCheck:"Lengkapkan pengesahan keselamatan anti-penyalahgunaan sebelum menghantar.",back:"Kembali ke laman utama"},
} as const;

export function ReportCenter({signedIn,active,turnstileSiteKey}:{signedIn:boolean;active:boolean;turnstileSiteKey:string|null}){
  const {locale}=usePreferences();const t=copy[locale];
  const [kind,setKind]=useState<Kind>("report");
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState<Suggestion|null>(null);
  const [suggestions,setSuggestions]=useState<Suggestion[]>([]);
  const [searchStatus,setSearchStatus]=useState<"idle"|"loading"|"ready"|"empty"|"unavailable">("idle");
  const [reason,setReason]=useState("");
  const [message,setMessage]=useState("");
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState(false);
  const [rateLimited,setRateLimited]=useState(false);
  const [completion,setCompletion]=useState<Completion|null>(null);
  const [copied,setCopied]=useState(false);
  const [turnstileToken,setTurnstileToken]=useState("");
  const [turnstileReset,setTurnstileReset]=useState(0);
  const [turnstileFailed,setTurnstileFailed]=useState(false);
  const [turnstileRejected,setTurnstileRejected]=useState(false);

  useEffect(()=>{
    const normalized=query.trim();
    if(kind!=="report"||selected||normalized.length<2)return;
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      setSearchStatus("loading");
      try{
        const response=await fetch("/api/search/suggestions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:normalized}),signal:controller.signal});
        if(!response.ok)throw new Error("search unavailable");
        const data=await response.json() as {suggestions?:Suggestion[]};
        if(controller.signal.aborted)return;
        setSuggestions(Array.isArray(data.suggestions)?data.suggestions:[]);
        setSearchStatus(data.suggestions?.length?"ready":"empty");
      }catch{if(!controller.signal.aborted){setSuggestions([]);setSearchStatus("unavailable");}}
    },350);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[kind,query,selected]);

  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setError(false);setRateLimited(false);setCompletion(null);setCopied(false);
    if(!signedIn||!active||!reason||!message.trim()||(kind==="report"&&!selected))return;
    if(!turnstileSiteKey){setTurnstileFailed(true);return;}
    if(!turnstileToken){setTurnstileRejected(true);return;}
    const token=turnstileToken;
    setTurnstileToken("");setTurnstileReset(value=>value+1);setTurnstileRejected(false);
    setSubmitting(true);
    try{
      const response=await fetch("/api/reports",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind,locale,postId:kind==="report"?selected?.post_id:null,reason,message:message.trim(),turnstileToken:token})});
      const data=await response.json() as ReportResponse;
      if(response.status===400&&data.error==="captcha_invalid"){setTurnstileRejected(true);return;}
      if(response.status===503&&data.error==="captcha_unavailable"){setTurnstileFailed(true);return;}
      if(response.status===429&&data.error==="rate_limited"){setRateLimited(true);return;}
      if(!response.ok||typeof data.reference!=="string"||typeof data.telegramText!=="string")throw new Error("submission failed");
      setCompletion({reference:data.reference,telegramUrl:typeof data.telegramUrl==="string"?data.telegramUrl:null,telegramText:data.telegramText});
      setMessage("");
    }catch{setError(true);}finally{setSubmitting(false);}
  }

  async function copyReference(){
    if(!completion)return;
    try{await navigator.clipboard.writeText(completion.telegramText);setCopied(true);}catch{setCopied(false);}
  }

  const reasonOptions=kind==="report"?["inaccurate_information","privacy","safety","spam","other"] as const:["suggestion","accessibility","technical_issue","other"] as const;
  const searchHint=searchStatus==="loading"?t.loading:searchStatus==="unavailable"?t.unavailable:searchStatus==="empty"?t.noTargets:"";
  const changeKind=(next:Kind)=>{setKind(next);setReason("");setMessage("");setSelected(null);setQuery("");setSuggestions([]);setSearchStatus("idle");};
  const changeSearchQuery=(next:string)=>{setQuery(next);setSelected(null);setSuggestions([]);setSearchStatus("idle");};

  return <div className={styles.page} lang={locale}><div className={styles.panel}>
    <p className={styles.eyebrow}>{t.eyebrow}</p><h1>{t.title}</h1><p className={styles.intro}>{t.intro}</p>
    {!signedIn?<section className={styles.gate}><p>{t.signin}</p><Link href="/account?next=%2Freport">{t.signinLink} →</Link></section>:!active?<p className={styles.gate} role="status">{t.restricted}</p>:completion?<section className={styles.success} role="status"><h2>{t.sent}</h2><p>{t.reference}: <bdi>{completion.reference}</bdi></p>{completion.telegramUrl?<a className={styles.submit} href={completion.telegramUrl} target="_blank" rel="noreferrer">{t.telegram} ↗</a>:<><p>{t.telegramMissing}</p><textarea readOnly value={completion.telegramText} aria-label={t.copy}/><button type="button" className={styles.secondary} onClick={copyReference}>{copied?t.copied:t.copy}</button></>}</section>:<>
      <div className={styles.tabs} role="group" aria-label={t.title}><button type="button" aria-pressed={kind==="report"} onClick={()=>changeKind("report")}>{t.report}</button><button type="button" aria-pressed={kind==="feedback"} onClick={()=>changeKind("feedback")}>{t.feedback}</button></div>
      <form className={styles.form} onSubmit={submit}>
        {kind==="report"&&<div className={styles.field}><label htmlFor="report-search">{t.search}</label><input id="report-search" type="search" value={query} maxLength={120} minLength={2} placeholder={t.searchHint} onChange={event=>changeSearchQuery(event.target.value)}/><p className={styles.hint}>{t.searchHint}</p>{selected?<div className={styles.selected}><strong>{selected.primary_name}</strong><span>{selected.approved_title}</span><small>{selected.public_area_name}</small><button type="button" onClick={()=>changeSearchQuery("")} aria-label={t.removeSelection}>×</button></div>:suggestions.length>0?<ul className={styles.suggestions} aria-label={t.search}>{suggestions.map(item=><li key={item.post_id}><button type="button" onClick={()=>{setSelected(item);setQuery(`${item.primary_name} — ${item.approved_title}`);setSuggestions([]);setSearchStatus("idle");}}><strong>{item.primary_name}</strong><span>{item.approved_title}</span><small>{item.public_area_name}</small></button></li>)}</ul>:searchHint&&<p className={styles.status} role="status">{searchHint}</p>}</div>}
        <div className={styles.field}><label htmlFor="report-reason">{t.reason}</label><select id="report-reason" value={reason} required onChange={event=>setReason(event.target.value)}><option value="" disabled>—</option>{reasonOptions.map(option=><option value={option} key={option}>{t.reasons[option]}</option>)}</select></div>
        <div className={styles.field}><label htmlFor="report-message">{t.message}</label><textarea id="report-message" value={message} maxLength={2000} required rows={6} onChange={event=>setMessage(event.target.value)}/><p className={styles.hint}>{t.messageHint} · {message.length}/2000</p></div>
        <div className={styles.challenge}><p className={styles.hint}>{t.securityCheck}</p>{turnstileSiteKey?<TurnstileWidget siteKey={turnstileSiteKey} action="mmwr_report" resetKey={turnstileReset} onToken={token=>{setTurnstileToken(token);if(token){setTurnstileFailed(false);setTurnstileRejected(false);}}} onError={()=>setTurnstileFailed(true)}/>:<p className={styles.error} role="status">{t.captchaMissing}</p>}</div>
        {turnstileRejected&&<p className={styles.error} role="alert">{t.captchaError}</p>}{turnstileFailed&&<p className={styles.error} role="alert">{turnstileSiteKey?t.captchaUnavailable:t.captchaMissing}</p>}
        <p className={styles.notice}>{t.feedbackNotice}</p>{rateLimited&&<p className={styles.error} role="alert">{t.rateLimited}</p>}{error&&<p className={styles.error} role="alert">{t.error}</p>}
        <button className={styles.submit} type="submit" disabled={submitting||!reason||!message.trim()||(kind==="report"&&!selected)||!turnstileSiteKey}>{submitting?t.sending:t.submit}</button>
      </form>
    </>}
    <Link className={styles.back} href="/">{t.back} ↗</Link>
  </div></div>;
}
