"use client";

import {useCallback,useEffect,useState,type FormEvent} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import type {Locale} from "@/lib/i18n/catalog";
import styles from "./OwnerPostLifecycle.module.css";

type Post={post_id:string;approved_title:string;primary_name:string;area_name:string;status:"published"|"temporarily_hidden";last_published_at:string};
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const copy:Record<Locale,{title:string;intro:string;loading:string;loadError:string;empty:string;noMatches:string;published:string;hidden:string;area:string;listed:string;reason:string;reasonPlaceholder:string;totp:string;hide:string;restore:string;remove:string;working:string;changed:string;failed:string;hiddenMessage:string;restoredMessage:string;removedMessage:string;confirmRemove:string;removeWarning:string;limit:string;search:string;searchLabel:string;searchPlaceholder:string;shortSearch:string;keepClarification:string}>= {
  "zh-CN":{title:"公开内容紧急管理",intro:"仅 Owner 可操作。列表只返回公开标题、名称、地区和状态，不包含正文、投稿人或证据资料。隐藏、恢复和永久删除都要求重新验证 TOTP、填写原因，并写入审计记录。",loading:"正在载入…",loadError:"无法读取公开内容。请确认迁移已应用，并重新验证 Owner TOTP。",empty:"目前没有可管理的已发布或暂时隐藏内容。",noMatches:"没有找到匹配的公开内容。",published:"公开中",hidden:"已紧急隐藏",area:"地区",listed:"最近上架",reason:"操作原因（必填）",reasonPlaceholder:"请简要说明原因",totp:"6 位 Authenticator TOTP",hide:"紧急隐藏",restore:"恢复上架",remove:"永久删除",working:"正在处理…",changed:"操作成功，公开列表已刷新。",failed:"操作未完成。请检查 Owner 权限、TOTP、原因及迁移状态。",hiddenMessage:"内容已隐藏并从公开投影中移除。",restoredMessage:"内容已恢复上架并记入审计。",removedMessage:"内容已永久下架并记入审计。",confirmRemove:"确定永久移除此公开内容吗？此操作不可恢复公开状态。",removeWarning:"永久删除会移除所有公开入口；后台记录依照保留政策处理。",limit:"最多显示 100 条匹配记录；请缩小关键词以查找更多内容。",search:"搜索",searchLabel:"搜索公开标题、对象名称或地区",searchPlaceholder:"至少输入 3 个字符；留空显示最近更新内容",shortSearch:"请输入至少 3 个字符，或清空搜索。",keepClarification:"仅当当前帖子是澄清所关联的原帖时，此选项才控制保留澄清公开"},
  en:{title:"Public content emergency controls",intro:"Owner only. The list returns public title, name, area and status; it excludes full text, submitter and evidence details. Hiding, restoring and permanent removal each require a fresh TOTP challenge, a reason and an audit entry.",loading:"Loading…",loadError:"Could not load public content. Confirm the migration is applied and verify Owner TOTP again.",empty:"There are no published or temporarily hidden posts to manage.",noMatches:"No matching public content was found.",published:"Published",hidden:"Emergency hidden",area:"Area",listed:"Last listed",reason:"Reason for action (required)",reasonPlaceholder:"Briefly explain the reason",totp:"6-digit authenticator TOTP",hide:"Emergency hide",restore:"Restore listing",remove:"Permanently remove",working:"Processing…",changed:"Action completed and the public list was refreshed.",failed:"Action failed. Check Owner access, TOTP, reason and migration status.",hiddenMessage:"Post hidden and removed from public projections.",restoredMessage:"Post restored and recorded in the audit log.",removedMessage:"Post permanently removed from public listing and recorded.",confirmRemove:"Permanently remove this public post? Its public state cannot be restored.",removeWarning:"Permanent removal removes every public entry; retained staff records follow the retention policy.",limit:"Showing up to 100 matching records. Narrow the search to find other posts.",search:"Search",searchLabel:"Search public title, name or area",searchPlaceholder:"Enter at least 3 characters; leave blank for recent posts",shortSearch:"Enter at least 3 characters, or clear the search.",keepClarification:"This only controls linked Clarifications when the current post is their original story"},
  ms:{title:"Kawalan kecemasan kandungan awam",intro:"Untuk Owner sahaja. Senarai ini hanya memaparkan tajuk awam, nama, kawasan dan status; teks penuh, penghantar dan bukti tidak disertakan. Tindakan menyembunyikan, memulihkan dan membuang secara kekal memerlukan pengesahan TOTP baharu, sebab dan rekod audit.",loading:"Sedang memuatkan…",loadError:"Kandungan awam tidak dapat dimuatkan. Sahkan migrasi dan sahkan semula TOTP Owner.",empty:"Tiada hantaran diterbitkan atau disembunyikan buat sementara untuk diurus.",noMatches:"Tiada kandungan awam yang sepadan ditemui.",published:"Diterbitkan",hidden:"Disembunyikan segera",area:"Kawasan",listed:"Senarai terakhir",reason:"Sebab tindakan (wajib)",reasonPlaceholder:"Terangkan sebab secara ringkas",totp:"TOTP aplikasi pengesah 6 digit",hide:"Sembunyikan segera",restore:"Pulihkan senarai",remove:"Buang secara kekal",working:"Sedang diproses…",changed:"Tindakan selesai dan senarai awam dimuat semula.",failed:"Tindakan gagal. Semak akses Owner, TOTP, sebab dan status migrasi.",hiddenMessage:"Hantaran disembunyikan dan dikeluarkan daripada paparan awam.",restoredMessage:"Hantaran dipulihkan dan direkodkan dalam audit.",removedMessage:"Hantaran dikeluarkan secara kekal daripada paparan awam dan direkodkan.",confirmRemove:"Buang hantaran awam ini secara kekal? Status awamnya tidak boleh dipulihkan.",removeWarning:"Pembuangan kekal mengalih keluar semua paparan awam; rekod kakitangan tertakluk pada dasar penyimpanan.",limit:"Memaparkan sehingga 100 rekod yang sepadan. Kecilkan carian untuk rekod lain.",search:"Cari",searchLabel:"Cari tajuk awam, nama atau kawasan",searchPlaceholder:"Masukkan sekurang-kurangnya 3 aksara; kosongkan untuk hantaran terkini",shortSearch:"Masukkan sekurang-kurangnya 3 aksara atau kosongkan carian.",keepClarification:"Tetapan ini hanya mengawal penjelasan berkaitan jika hantaran ini ialah hantaran asal"}
};

export function OwnerPostLifecycle(){
  const {locale}=usePreferences();
  const t=copy[locale];
  const [posts,setPosts]=useState<Post[]>([]);
  const [loading,setLoading]=useState(true);
  const [failed,setFailed]=useState(false);
  const [message,setMessage]=useState("");
  const [busyId,setBusyId]=useState<string|null>(null);
  const [query,setQuery]=useState("");
  const [searchedQuery,setSearchedQuery]=useState("");

  const load=useCallback(async(search:string|null=null)=>{
    setLoading(true);setFailed(false);
    try{
      const supabase=createSupabaseBrowserClient();
      const {data,error}=await supabase.rpc("owner_list_post_lifecycle",{p_search:search});
      if(error||!Array.isArray(data))throw error??new Error("Invalid lifecycle response");
      const safeRows=data.filter((item):item is Post=>{
        if(!item||typeof item!=="object")return false;
        const row=item as Record<string,unknown>;
        return typeof row.post_id==="string"&&idPattern.test(row.post_id)
          &&typeof row.approved_title==="string"&&row.approved_title.length<=300
          &&typeof row.primary_name==="string"&&row.primary_name.length<=200
          &&typeof row.area_name==="string"&&row.area_name.length<=120
          &&(row.status==="published"||row.status==="temporarily_hidden")
          &&typeof row.last_published_at==="string"&&Number.isFinite(Date.parse(row.last_published_at));
      });
      setPosts(safeRows);setFailed(false);
    }catch{setFailed(true);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{const timer=window.setTimeout(()=>{void load();},0);return()=>window.clearTimeout(timer);},[load]);

  async function searchPosts(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const normalized=query.trim();
    if(normalized.length>0&&normalized.length<3){setMessage(t.shortSearch);return;}
    setSearchedQuery(normalized);setMessage("");
    await load(normalized||null);
  }

  async function act(post:Post,action:"hide"|"restore"|"remove",reason:string,code:string,keepClarificationPublic=true){
    if(busyId||reason.trim().length===0||reason.trim().length>500||!/^[0-9]{6}$/.test(code))return false;
    if(action==="remove"&&!window.confirm(t.confirmRemove+"\n\n"+t.removeWarning))return null;
    setBusyId(post.post_id);setMessage("");
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
      const rpcName=action==="hide"?"owner_hide_story_with_clarification_decision":action==="restore"?"restore_post":"remove_post";
      const args=action==="hide"?{p_son_post_id:post.post_id,p_keep_mother_public:keepClarificationPublic,p_reason:reason.trim()}:{p_post_id:post.post_id,p_reason:reason.trim()};
      const {data,error}=await supabase.rpc(rpcName,args);
      if(error||data!==true)throw error??new Error("Owner action rejected");
      setMessage(action==="hide"?t.hiddenMessage:action==="restore"?t.restoredMessage:t.removedMessage);
      await load(searchedQuery||null);
      return true;
    }catch{setMessage(t.failed);return false;}
    finally{setBusyId(null);}
  }

  return <section className={styles.panel} lang={locale}>
    <p className={styles.eyebrow}>MMWR · OWNER</p>
    <h2>{t.title}</h2>
    <p className={styles.intro}>{t.intro}</p>
    {message&&<p className={styles.notice} role="status">{message}</p>}
    <form className={styles.search} onSubmit={searchPosts}>
      <label htmlFor="owner-post-query">{t.searchLabel}</label>
      <div><input id="owner-post-query" autoComplete="off" maxLength={120} value={query} onChange={event=>setQuery(event.target.value)} placeholder={t.searchPlaceholder}/><button className="button button-primary" disabled={loading||busyId!==null}>{loading?t.loading:t.search}</button></div>
    </form>
    {loading?<p className={styles.status} role="status">{t.loading}</p>:failed?<p className={styles.status} role="alert">{t.loadError}</p>:posts.length===0?<p className={styles.status}>{searchedQuery?t.noMatches:t.empty}</p>:<>
      <p className={styles.limit}>{t.limit}</p>
      <ul className={styles.list}>{posts.map(post=><LifecycleRow key={post.post_id} post={post} locale={locale} copy={t} busy={busyId===post.post_id||busyId!==null} onAction={act}/>)}</ul>
    </>}
  </section>;
}

function LifecycleRow({post,locale,copy:t,busy,onAction}:{post:Post;locale:Locale;copy:typeof copy[Locale];busy:boolean;onAction:(post:Post,action:"hide"|"restore"|"remove",reason:string,code:string,keepClarificationPublic?:boolean)=>Promise<boolean|null>}){
  const [reason,setReason]=useState("");
  const [code,setCode]=useState("");
  const [message,setMessage]=useState("");
  const [keepClarificationPublic,setKeepClarificationPublic]=useState(true);
  async function act(action:"hide"|"restore"|"remove"){
    if(reason.trim().length===0||reason.trim().length>500||!/^[0-9]{6}$/.test(code)){setMessage(t.failed);return;}
    const changed=await onAction(post,action,reason,code,keepClarificationPublic);
    setCode("");
    if(changed){setReason("");setMessage("");}else if(changed===false)setMessage(t.failed);
  }
  const displayedDate=new Intl.DateTimeFormat(locale==="zh-CN"?"zh-CN":locale==="ms"?"ms-MY":"en-MY",{dateStyle:"medium"}).format(new Date(post.last_published_at));
  return <li className={styles.row}>
    <div className={styles.postHead}><div><h3>{post.approved_title}</h3><p>{post.primary_name} · {post.area_name}</p></div><span className={post.status==="published"?styles.published:styles.hidden}>{post.status==="published"?t.published:t.hidden}</span></div>
    <p className={styles.date}>{t.listed}: {displayedDate}</p>
    <div className={styles.fields}>
      <label>{t.reason}<input maxLength={500} value={reason} onChange={event=>setReason(event.target.value)} placeholder={t.reasonPlaceholder}/></label>
      <label>{t.totp}<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))}/></label>
    </div>
    {post.status==="published"?<><label className={styles.clarificationChoice}><input type="checkbox" checked={keepClarificationPublic} onChange={event=>setKeepClarificationPublic(event.target.checked)}/>{t.keepClarification}</label><button className={styles.hideButton} type="button" disabled={busy} onClick={()=>void act("hide")}>{busy?t.working:t.hide}</button></>:<button className={styles.restoreButton} type="button" disabled={busy} onClick={()=>void act("restore")}>{busy?t.working:t.restore}</button>}
    <button className={styles.removeButton} type="button" disabled={busy} onClick={()=>void act("remove")}>{busy?t.working:t.remove}</button>
    {post.status==="temporarily_hidden"&&<p className={styles.removeWarning}>{t.removeWarning}</p>}
    {message&&<p className={styles.error} role="alert">{message}</p>}
  </li>;
}
