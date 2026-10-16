"use client";

import {useState, type FormEvent} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import styles from "./StaffSanctionManager.module.css";

type SanctionAction="warning"|"submission_suspension"|"account_suspension"|"permanent_ban";
type Target={target_user_id:string;username:string};
type Sanction={sanction_event_id:number;target_username:string;action:SanctionAction;reason:string;actor_username:string|null;occurred_at:string;expires_at:string|null;event_state:"active"|"expired"|"lifted"|"recorded";lifted_at:string|null;lift_reason:string|null};

const copy={
  "zh-CN":{
    title:"账号处罚与限制",intro:"仅搜索有效普通账号。警告、暂停投稿和临时暂停账号由 Admin 或 Owner 执行；永久封禁仅 Owner 可执行。每项操作都需近期 TOTP、填写理由并追加写入审计记录。临时限制按到期时间自动失效；暂停账号仍可阅读，但不能投稿或使用 Reaction。",
    searchLabel:"按用户名搜索",searchPlaceholder:"输入至少 3 个字符",search:"搜索账号与记录",searching:"正在检查 TOTP 并搜索…",queryTooShort:"用户名至少输入 3 个字符。",noTargets:"没有匹配的有效普通账号。",noEvents:"没有找到相关处罚记录。",action:"处罚动作",actions:{warning:"警告",submission_suspension:"暂停投稿",account_suspension:"临时暂停账号",permanent_ban:"永久封禁"},duration:"限制时长",chooseDuration:"选择时长",days1:"1 天",days3:"3 天",days7:"7 天",days30:"30 天",custom:"自定义到期时间",customTime:"到期时间",reason:"理由（必填）",reasonHint:"仅填写审核所需的事实理由，不要放入无关个人资料。",totp:"Authenticator 验证码",apply:"执行处罚",applying:"正在验证并保存…",warningDone:"警告已记录。",sanctionDone:"限制已记录。",banConfirm:"确认永久封禁此账号？该操作会立即阻止账号继续使用站内功能。",actionError:"操作未完成。请检查权限、原因、期限与近期 TOTP。",savedHistoryError:"操作已记录，但记录列表刷新失败；请重新验证 TOTP 后搜索。",eventTitle:"处罚记录",eventReason:"理由",issuedBy:"执行人",issuedAt:"记录时间",expiresAt:"到期",noExpiry:"永久",states:{active:"生效中",expired:"已到期",lifted:"已解除",recorded:"已记录"},liftReason:"解除理由（必填）",lift:"解除限制",lifting:"正在解除…",liftedDone:"限制已解除并记录。",liftError:"无法解除该限制。请检查权限、TOTP 和原因。",invalidDuration:"请选择有效期限。",invalidCode:"请输入 6 位验证码。",requestsPolicyNote:"申诉、更正与撤下请求渠道目前关闭；政策确认前不要收集这类申请资料。",loadError:"无法读取处罚记录。请重新通过 TOTP 并重试。"
  },
  en:{
    title:"Account sanctions",intro:"Search active standard accounts. Admins and Owners can warn, suspend submissions or temporarily suspend accounts; only Owners can permanently ban. Every action requires recent TOTP, a reason and an append-only audit event. Timed restrictions expire based on their timestamp. Suspended accounts can still read but cannot submit or use Reactions.",
    searchLabel:"Search by username",searchPlaceholder:"Enter at least 3 characters",search:"Search accounts and records",searching:"Verifying TOTP and searching…",queryTooShort:"Enter at least 3 characters.",noTargets:"No matching active standard accounts were found.",noEvents:"No matching sanction records were found.",action:"Action",actions:{warning:"Warning",submission_suspension:"Suspend submissions",account_suspension:"Temporarily suspend accounts",permanent_ban:"Permanent ban"},duration:"Restriction length",chooseDuration:"Choose a duration",days1:"1 day",days3:"3 days",days7:"7 days",days30:"30 days",custom:"Custom expiry",customTime:"Expiry date and time",reason:"Reason (required)",reasonHint:"Include only facts needed for review; do not add unrelated personal information.",totp:"Authenticator code",apply:"Apply action",applying:"Verifying and saving…",warningDone:"Warning recorded.",sanctionDone:"Restriction recorded.",banConfirm:"Permanently ban this account? This immediately blocks use of MMWR features.",actionError:"The action could not be completed. Check your permissions, reason, duration and recent TOTP.",savedHistoryError:"Action recorded, but history did not refresh. Verify TOTP and search again.",eventTitle:"Sanction history",eventReason:"Reason",issuedBy:"Issued by",issuedAt:"Recorded",expiresAt:"Expires",noExpiry:"No expiry",states:{active:"Active",expired:"Expired",lifted:"Lifted",recorded:"Recorded"},liftReason:"Reason for lifting (required)",lift:"Lift restriction",lifting:"Lifting…",liftedDone:"Restriction lifted and recorded.",liftError:"The restriction could not be lifted. Check permissions, TOTP and reason.",invalidDuration:"Choose a valid expiry.",invalidCode:"Enter the 6-digit code.",requestsPolicyNote:"Appeal, correction and takedown channels are closed while policy is pending. Do not collect request details.",loadError:"Sanction records could not be loaded. Verify TOTP again and retry."
  },
  ms:{
    title:"Sekatan akaun",intro:"Cari akaun biasa yang aktif. Admin dan Owner boleh memberi amaran, menggantung penghantaran atau menggantung akaun buat sementara; hanya Owner boleh menyekat akaun secara kekal. Setiap tindakan memerlukan TOTP terkini, sebab dan rekod audit tambahan yang tidak boleh diubah. Sekatan sementara tamat mengikut masa yang ditetapkan. Akaun digantung masih boleh membaca tetapi tidak boleh menghantar hantaran atau menggunakan Reaction.",
    searchLabel:"Cari melalui nama pengguna",searchPlaceholder:"Masukkan sekurang-kurangnya 3 aksara",search:"Cari akaun dan rekod",searching:"Mengesahkan TOTP dan mencari…",queryTooShort:"Masukkan sekurang-kurangnya 3 aksara.",noTargets:"Tiada akaun biasa aktif yang sepadan.",noEvents:"Tiada rekod sekatan yang sepadan.",action:"Tindakan",actions:{warning:"Amaran",submission_suspension:"Gantung penghantaran",account_suspension:"Gantung akaun sementara",permanent_ban:"Sekat secara kekal"},duration:"Tempoh sekatan",chooseDuration:"Pilih tempoh",days1:"1 hari",days3:"3 hari",days7:"7 hari",days30:"30 hari",custom:"Tarikh tamat tersuai",customTime:"Tarikh dan masa tamat",reason:"Sebab (wajib)",reasonHint:"Masukkan fakta yang diperlukan untuk semakan sahaja; jangan sertakan maklumat peribadi yang tidak berkaitan.",totp:"Kod pengesah",apply:"Laksanakan tindakan",applying:"Mengesahkan dan menyimpan…",warningDone:"Amaran direkodkan.",sanctionDone:"Sekatan direkodkan.",banConfirm:"Sekat akaun ini secara kekal? Tindakan ini akan menyekat penggunaan ciri MMWR dengan serta-merta.",actionError:"Tindakan tidak dapat diselesaikan. Semak kebenaran, sebab, tempoh dan TOTP terkini.",savedHistoryError:"Tindakan telah direkodkan tetapi sejarah gagal dimuat semula. Sahkan TOTP dan cari semula.",eventTitle:"Sejarah sekatan",eventReason:"Sebab",issuedBy:"Dilaksanakan oleh",issuedAt:"Direkodkan",expiresAt:"Tamat",noExpiry:"Tiada tamat tempoh",states:{active:"Aktif",expired:"Tamat tempoh",lifted:"Ditarik balik",recorded:"Direkodkan"},liftReason:"Sebab penarikan balik (wajib)",lift:"Tarik balik sekatan",lifting:"Sedang menarik balik…",liftedDone:"Sekatan ditarik balik dan direkodkan.",liftError:"Sekatan tidak dapat ditarik balik. Semak kebenaran, TOTP dan sebab.",invalidDuration:"Pilih tempoh tamat yang sah.",invalidCode:"Masukkan kod 6 digit.",requestsPolicyNote:"Saluran rayuan, pembetulan dan penarikan kandungan ditutup sementara menunggu dasar. Jangan kumpulkan butiran permintaan.",loadError:"Rekod sekatan tidak dapat dibaca. Sahkan semula TOTP dan cuba lagi."
  }
} as const;

async function verifyRecentTotp(code:string){
  const supabase=createSupabaseBrowserClient();
  const {data:factors,error:listError}=await supabase.auth.mfa.listFactors();
  if(listError)throw listError;
  const factor=factors.totp.find((item)=>item.status==="verified");
  if(!factor)throw new Error("Verified TOTP unavailable");
  const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:factor.id});
  if(challengeError||!challenge)throw challengeError??new Error("TOTP challenge unavailable");
  const {error:verifyError}=await supabase.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code});
  if(verifyError)throw verifyError;
  return supabase;
}

export function StaffSanctionManager({isOwner}:{isOwner:boolean}){
  const {locale}=usePreferences();
  const t=copy[locale];
  const [query,setQuery]=useState("");
  const [targets,setTargets]=useState<Target[]>([]);
  const [events,setEvents]=useState<Sanction[]>([]);
  const [action,setAction]=useState<SanctionAction>("warning");
  const [duration,setDuration]=useState("");
  const [customExpiry,setCustomExpiry]=useState("");
  const [reason,setReason]=useState("");
  const [liftReason,setLiftReason]=useState("");
  const [code,setCode]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function refreshEvents(term:string){
    const supabase=createSupabaseBrowserClient();
    const {data,error}=await supabase.rpc("staff_list_account_sanctions",{p_username_query:term.trim()||null});
    if(error)throw error;
    setEvents((data??[]) as Sanction[]);
  }

  async function search(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const term=query.trim();
    if(term.length<3){setMessage(t.queryTooShort);return;}
    setBusy(true);setMessage("");setTargets([]);setEvents([]);
    try{
      const supabase=await verifyRecentTotp(code);
      const [{data:found,error:searchError},{data:history,error:historyError}]=await Promise.all([
        supabase.rpc("staff_search_sanction_targets",{p_username_query:term}),
        supabase.rpc("staff_list_account_sanctions",{p_username_query:term})
      ]);
      if(searchError||historyError)throw searchError??historyError;
      setTargets((found??[]) as Target[]);setEvents((history??[]) as Sanction[]);setCode("");
      if((found?.length??0)===0&&(history?.length??0)===0)setMessage(t.noTargets);
    }catch{setMessage(t.loadError);setCode("");}
    finally{setBusy(false);}
  }

  async function apply(target:Target,submittedAt:number){
    if(busy)return;
    if(!reason.trim()||reason.trim().length>500||code.length!==6){setMessage(t.actionError);return;}
    let expiresAt:string|null=null;
    if(action==="submission_suspension"||action==="account_suspension"){
      if(duration==="custom"){
        const parsed=new Date(customExpiry);
        expiresAt=Number.isNaN(parsed.getTime())?null:parsed.toISOString();
      }else{
        const days=Number(duration);
        expiresAt=[1,3,7,30].includes(days)?new Date(submittedAt+days*24*60*60*1000).toISOString():null;
      }
    }
    if(action!=="warning"&&action!=="permanent_ban"&&!expiresAt){setMessage(t.invalidDuration);return;}
    if(action==="permanent_ban"&&!window.confirm(t.banConfirm))return;
    setBusy(true);setMessage("");
    try{
      const supabase=await verifyRecentTotp(code);
      const {data,error}=await supabase.rpc("staff_apply_account_sanction",{p_target_user_id:target.target_user_id,p_action:action,p_expires_at:expiresAt,p_reason:reason.trim()});
      const eventId=typeof data==="number"?data:typeof data==="string"?Number(data):NaN;
      if(error||!Number.isSafeInteger(eventId)||eventId<1)throw error??new Error("Sanction rejected");
      setReason("");setCode("");setMessage(action==="warning"?t.warningDone:t.sanctionDone);
      setTargets((current)=>action==="permanent_ban"?current.filter((item)=>item.target_user_id!==target.target_user_id):current);
      try{await refreshEvents(query);}catch{setMessage(t.savedHistoryError);}
    }catch{setCode("");setMessage(t.actionError);}
    finally{setBusy(false);}
  }

  async function lift(event:Sanction){
    if(busy)return;
    if(!liftReason.trim()||liftReason.trim().length>500||code.length!==6){setMessage(t.liftError);return;}
    setBusy(true);setMessage("");
    try{
      const supabase=await verifyRecentTotp(code);
      const {data,error}=await supabase.rpc("staff_lift_account_sanction",{p_sanction_event_id:event.sanction_event_id,p_reason:liftReason.trim()});
      if(error||data!==true)throw error??new Error("Lift rejected");
      setLiftReason("");setCode("");setMessage(t.liftedDone);
      try{await refreshEvents(query);}catch{setMessage(t.savedHistoryError);}
    }catch{setCode("");setMessage(t.liftError);}
    finally{setBusy(false);}
  }

  const timed=action==="submission_suspension"||action==="account_suspension";
  return <div className={styles.page} lang={locale}>
    <section className={styles.panel}>
      <p className="eyebrow">MMWR · STAFF</p>
      <h1>{t.title}</h1>
      <p className={styles.intro}>{t.intro}</p>
      <form className={styles.search} onSubmit={search}>
        <label htmlFor="sanction-query">{t.searchLabel}</label>
        <div><input id="sanction-query" autoComplete="off" minLength={3} maxLength={24} value={query} onChange={(event)=>setQuery(event.target.value)} placeholder={t.searchPlaceholder}/><button className="button button-primary" disabled={busy}>{busy?t.searching:t.search}</button></div>
        <label htmlFor="sanction-totp">{t.totp}</label><input id="sanction-totp" autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(event)=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))}/>
      </form>
      {message&&<p className={styles.message} role="status">{message}</p>}
      <ul className={styles.targets}>
        {targets.map((target)=><li key={target.target_user_id} className={styles.target}>
          <strong>{target.username}</strong>
          <label>{t.action}<select value={action} onChange={(event)=>setAction(event.target.value as SanctionAction)}><option value="warning">{t.actions.warning}</option><option value="submission_suspension">{t.actions.submission_suspension}</option><option value="account_suspension">{t.actions.account_suspension}</option>{isOwner&&<option value="permanent_ban">{t.actions.permanent_ban}</option>}</select></label>
          {timed&&<><label>{t.duration}<select value={duration} onChange={(event)=>setDuration(event.target.value)}><option value="">{t.chooseDuration}</option><option value="1">{t.days1}</option><option value="3">{t.days3}</option><option value="7">{t.days7}</option><option value="30">{t.days30}</option><option value="custom">{t.custom}</option></select></label>{duration==="custom"&&<label>{t.customTime}<input type="datetime-local" value={customExpiry} onChange={(event)=>setCustomExpiry(event.target.value)}/></label>}</>}
          <label>{t.reason}<textarea maxLength={500} value={reason} onChange={(event)=>setReason(event.target.value)} placeholder={t.reasonHint}/></label>
          <button type="button" className="button button-primary" disabled={busy||!reason.trim()||code.length!==6} onClick={()=>apply(target,Date.now())}>{busy?t.applying:t.apply}</button>
        </li>)}
      </ul>
      <section className={styles.history} aria-labelledby="sanction-history-title">
        <h2 id="sanction-history-title">{t.eventTitle}</h2>
        {events.length===0?<p>{t.noEvents}</p>:<ul className={styles.events}>{events.map((event)=><li key={event.sanction_event_id}>
          <div className={styles.eventHeading}><strong>{event.target_username}</strong><span>{t.actions[event.action]}</span><span data-state={event.event_state}>{t.states[event.event_state]}</span></div>
          <p><b>{t.eventReason}:</b> {event.reason}</p>
          <p><b>{t.issuedBy}:</b> {event.actor_username??"—"} · <b>{t.issuedAt}:</b> {new Date(event.occurred_at).toLocaleString(locale)}</p>
          {event.expires_at&&<p><b>{t.expiresAt}:</b> {new Date(event.expires_at).toLocaleString(locale)}</p>}
          {event.lift_reason&&<p><b>{t.lift}:</b> {event.lift_reason} · {event.lifted_at?new Date(event.lifted_at).toLocaleString(locale):""}</p>}
          {event.event_state==="active"&&(event.action==="submission_suspension"||event.action==="account_suspension"||(isOwner&&event.action==="permanent_ban"))&&<><label>{t.liftReason}<textarea maxLength={500} value={liftReason} onChange={(input)=>setLiftReason(input.target.value)}/></label><button type="button" className="button button-outline" disabled={busy||!liftReason.trim()||code.length!==6} onClick={()=>lift(event)}>{busy?t.lifting:t.lift}</button></>}
        </li>)}</ul>}
      </section>
      <p className={styles.note}>{t.requestsPolicyNote}</p>
    </section>
  </div>;
}
