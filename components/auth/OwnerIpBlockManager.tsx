"use client";

import {useCallback,useState} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import {addOwnerIpBlock,liftOwnerIpBlock,listOwnerIpBlocks} from "@/app/admin/owner-ip-block-actions";
import type {Locale} from "@/lib/i18n/catalog";
import styles from "./OwnerIpBlockManager.module.css";

type ActiveBlock={block_id:string;fingerprint_suffix:string;reason:string;actor_username:string|null;created_at:string;expires_at:string};
type AuditRow={event_id:number;block_id:string;action:"created"|"lifted"|"expired";reason:string;actor_username:string|null;occurred_at:string;expires_at:string};
const copy:Record<Locale,{
  title:string;intro:string;coverage:string;configReady:string;configMissing:string;enforcementOn:string;enforcementOff:string;address:string;addressHint:string;expiry:string;days1:string;days3:string;days7:string;days30:string;custom:string;customDate:string;reason:string;totp:string;add:string;adding:string;refresh:string;refreshing:string;loadFirst:string;required:string;badAddress:string;badExpiry:string;saved:string;failed:string;selfBlock:string;sourceUnavailable:string;duplicate:string;active:string;none:string;fingerprint:string;created:string;expires:string;by:string;lift:string;liftReason:string;lifting:string;lifted:string;history:string;actionCreated:string;actionLifted:string;actionExpired:string;automaticReason:string;historyEmpty:string;retention:string;
}>={
  "zh-CN":{title:"Owner IP 封锁",intro:"仅封锁单个 IPv4 或 IPv6 地址。封锁需要近期 TOTP、理由和到期时间；Admin 无权查看或操作。数据库只在封锁有效期间保存专用 HMAC 指纹，审计记录不保存 IP 或指纹。",coverage:"此功能可在 Next.js Proxy 检查网站请求，并在独立数据库开关启用后检查直连 Supabase Data API。数据库端还需在 Vault 保存与服务器相同的 HMAC 密钥。它不覆盖 Supabase Auth、Storage 或 Realtime；所有实际使用路径须先在 Staging 验证代理 IP 来源和覆盖范围。",configReady:"所需配置项已填写，但这不证明代理头来自可信入口或无法被绕过；启用前仍须在 Staging 验证完整请求路径。数据库开关也需单独验证。",configMissing:"部署尚未配置可信代理 IP 头、至少 32 字节的专用 HMAC 密钥、Supabase URL 或服务端 SUPABASE_SECRET_KEY；当前拦截保持关闭。",enforcementOn:"Next.js 请求 IP 检查：已启用；Data API 另有数据库开关",enforcementOff:"Next.js 请求 IP 检查：关闭",address:"IPv4 或 IPv6 地址",addressHint:"仅接受单个 IP，不接受网段。原始地址不会写入数据库。",expiry:"到期时间",days1:"1 天",days3:"3 天",days7:"7 天",days30:"30 天",custom:"自定义时间",customDate:"选择到期日期与时间",reason:"封锁理由（必填）",totp:"6 位 Authenticator TOTP",add:"验证并封锁",adding:"正在验证并保存…",refresh:"验证并刷新记录",refreshing:"正在验证并读取…",loadFirst:"输入 TOTP 后刷新，读取当前封锁和审计记录。",required:"请填写地址、理由并输入 6 位验证码。",badAddress:"请输入有效的单个 IPv4 或 IPv6 地址。",badExpiry:"请选择未来的到期时间。",saved:"封锁已记录。实际拦截仍需分别配置并验证网站与数据库开关。",failed:"操作未完成。请检查 Owner 权限、近期 TOTP、迁移状态和配置。",selfBlock:"不能封锁当前访问地址，以免把自己锁在后台之外。",sourceUnavailable:"无法确认当前可信访问地址，暂不能创建封锁。请先检查代理头配置。",duplicate:"该地址已有有效封锁，或数据库迁移尚未应用。",active:"当前有效封锁",none:"没有有效封锁。",fingerprint:"HMAC 指纹末 8 位",created:"创建时间",expires:"到期",by:"操作人",lift:"解除封锁",liftReason:"解除理由（必填）",lifting:"正在验证并解除…",lifted:"封锁已解除并记录。",history:"最近审计（不含 IP 指纹）",actionCreated:"已封锁",actionLifted:"已解除",actionExpired:"自动到期",automaticReason:"限制到期并自动清除指纹。",historyEmpty:"暂无记录。",retention:"到期后清除活动指纹；审计保留操作者、理由、事件和时间，不保留 IP 或指纹。"
  },
  en:{title:"Owner IP blocks",intro:"Block one IPv4 or IPv6 address at a time. Each block needs recent TOTP, a reason and an expiry; Admins cannot view or manage this panel. The dedicated HMAC fingerprint is stored only while the block is active. Audit events contain no IP address or fingerprint.",coverage:"This feature checks website requests in the Next.js Proxy and can check direct Supabase Data API requests after its separate database gate is enabled. The database also needs the same HMAC secret stored in Vault. Supabase Auth, Storage and Realtime are outside this check; validate the trusted client IP and every used request path in Staging first.",configReady:"The required settings are present, but this does not prove the ingress header is trustworthy or cannot be bypassed. Verify the full request path in Staging before enabling either gate; the database gate also requires separate verification.",configMissing:"The deployment needs a trusted client-IP header, a dedicated HMAC key of at least 32 bytes, a Supabase URL and the server-only SUPABASE_SECRET_KEY. Enforcement remains off.",enforcementOn:"Next.js request IP check: enabled; Data API has a separate database gate",enforcementOff:"Next.js request IP check: off",address:"IPv4 or IPv6 address",addressHint:"Enter one address only; CIDR ranges are not supported. The raw address is never stored in the database.",expiry:"Expiry",days1:"1 day",days3:"3 days",days7:"7 days",days30:"30 days",custom:"Custom date and time",customDate:"Choose expiry date and time",reason:"Reason for block (required)",totp:"6-digit authenticator TOTP",add:"Verify and block",adding:"Verifying and saving…",refresh:"Verify and refresh records",refreshing:"Verifying and loading…",loadFirst:"Enter a TOTP code and refresh to view active blocks and audit history.",required:"Enter an address, reason and 6-digit code.",badAddress:"Enter one valid IPv4 or IPv6 address.",badExpiry:"Choose an expiry in the future.",saved:"Block recorded. Website and database enforcement gates require separate setup.",failed:"The action could not be completed. Check Owner access, recent TOTP, migration status and configuration.",selfBlock:"You cannot block the address currently being used to access this panel.",sourceUnavailable:"The current trusted client address could not be confirmed, so no block was created. Check the proxy header configuration.",duplicate:"An active block already exists for that address, or the database migration is not applied.",active:"Active blocks",none:"No active blocks.",fingerprint:"Last 8 HMAC fingerprint characters",created:"Created",expires:"Expires",by:"Actor",lift:"Lift block",liftReason:"Reason for lifting (required)",lifting:"Verifying and lifting…",lifted:"Block lifted and recorded.",history:"Recent audit (no IP fingerprints)",actionCreated:"Blocked",actionLifted:"Lifted",actionExpired:"Expired automatically",automaticReason:"The restriction expired and its fingerprint was cleared.",historyEmpty:"No audit events yet.",retention:"Expired active fingerprints are cleared. Audit retains the actor, reason, event and time, without an IP address or fingerprint."},
  ms:{title:"Sekatan IP Owner",intro:"Sekat satu alamat IPv4 atau IPv6 pada satu masa. Setiap sekatan memerlukan TOTP terkini, sebab dan tarikh tamat; Admin tidak boleh melihat atau mengurus panel ini. Cap jari HMAC khusus disimpan hanya semasa sekatan aktif. Rekod audit tidak mengandungi alamat IP atau cap jari.",coverage:"Ciri ini memeriksa permintaan laman dalam Next.js Proxy dan boleh memeriksa permintaan terus ke Supabase Data API selepas suis pangkalan data berasingan diaktifkan. Pangkalan data juga memerlukan kunci HMAC yang sama dalam Vault. Supabase Auth, Storage dan Realtime tidak diliputi; sahkan IP klien dipercayai dan semua laluan permintaan dalam Staging terlebih dahulu.",configReady:"Tetapan yang diperlukan telah diisi, tetapi ini tidak membuktikan header ingress dipercayai atau tidak boleh dipintas. Sahkan laluan permintaan penuh dalam Staging sebelum mengaktifkan mana-mana suis; suis pangkalan data juga memerlukan pengesahan berasingan.",configMissing:"Deployment memerlukan header IP klien dipercayai, kunci HMAC khusus sekurang-kurangnya 32 bait, URL Supabase dan SUPABASE_SECRET_KEY sisi pelayan. Penguatkuasaan kekal dimatikan.",enforcementOn:"Pemeriksaan IP permintaan Next.js: aktif; Data API mempunyai suis pangkalan data berasingan",enforcementOff:"Pemeriksaan IP permintaan Next.js: tidak aktif",address:"Alamat IPv4 atau IPv6",addressHint:"Masukkan satu alamat sahaja; julat CIDR tidak disokong. Alamat asal tidak disimpan dalam pangkalan data.",expiry:"Tarikh tamat",days1:"1 hari",days3:"3 hari",days7:"7 hari",days30:"30 hari",custom:"Tarikh dan masa tersuai",customDate:"Pilih tarikh dan masa tamat",reason:"Sebab sekatan (wajib)",totp:"TOTP pengesah 6 digit",add:"Sahkan dan sekat",adding:"Mengesahkan dan menyimpan…",refresh:"Sahkan dan muat semula rekod",refreshing:"Mengesahkan dan memuatkan…",loadFirst:"Masukkan kod TOTP dan muat semula untuk melihat sekatan aktif serta sejarah audit.",required:"Masukkan alamat, sebab dan kod 6 digit.",badAddress:"Masukkan satu alamat IPv4 atau IPv6 yang sah.",badExpiry:"Pilih tarikh tamat pada masa hadapan.",saved:"Sekatan direkodkan. Suis penguatkuasaan laman dan pangkalan data perlu disediakan secara berasingan.",failed:"Tindakan tidak dapat diselesaikan. Semak akses Owner, TOTP terkini, status migrasi dan konfigurasi.",selfBlock:"Anda tidak boleh menyekat alamat yang sedang digunakan untuk mengakses panel ini.",sourceUnavailable:"Alamat klien dipercayai semasa tidak dapat disahkan, jadi sekatan tidak dibuat. Semak konfigurasi header proksi.",duplicate:"Sekatan aktif sudah wujud untuk alamat itu, atau migrasi pangkalan data belum digunakan.",active:"Sekatan aktif",none:"Tiada sekatan aktif.",fingerprint:"8 aksara terakhir cap jari HMAC",created:"Dicipta",expires:"Tamat",by:"Pelaku",lift:"Tarik balik sekatan",liftReason:"Sebab penarikan balik (wajib)",lifting:"Mengesahkan dan menarik balik…",lifted:"Sekatan ditarik balik dan direkodkan.",history:"Audit terkini (tanpa cap jari IP)",actionCreated:"Disekat",actionLifted:"Ditarik balik",actionExpired:"Tamat secara automatik",automaticReason:"Sekatan tamat dan cap jarinya telah dipadam.",historyEmpty:"Belum ada rekod audit.",retention:"Cap jari aktif dipadam selepas tamat. Audit menyimpan pelaku, sebab, peristiwa dan masa tanpa alamat IP atau cap jari."}
};

export function OwnerIpBlockManager({configurationPresent,enforcementEnabled}:{configurationPresent:boolean;enforcementEnabled:boolean}){
  const {locale}=usePreferences();const t=copy[locale];
  const [address,setAddress]=useState("");const [preset,setPreset]=useState("7");const [customExpiry,setCustomExpiry]=useState("");
  const [reason,setReason]=useState("");const [code,setCode]=useState("");const [liftReasons,setLiftReasons]=useState<Record<string,string>>({});
  const [rows,setRows]=useState<ActiveBlock[]>([]);const [audit,setAudit]=useState<AuditRow[]>([]);const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");

  const reload=useCallback(async()=>{
    setBusy(true);setMessage("");
    try{
      await verify(code);
      // TOTP is challenged by this component before the server action checks
      // AAL2 and private.has_recent_totp() again at the database boundary.
      const data=await listOwnerIpBlocks();
      if(!data.ok)throw new Error("Owner IP block records unavailable");
      setRows(data.rows);setAudit(data.audit);setLoaded(true);setCode("");
    }catch{setMessage(t.failed);setCode("");}
    finally{setBusy(false);}
  },[code,t.failed]);

  async function verify(codeValue:string){
    const supabase=createSupabaseBrowserClient();
    const {data:factors,error:listError}=await supabase.auth.mfa.listFactors();
    if(listError)throw listError;
    const factor=factors.totp.find(item=>item.status==="verified");
    if(!factor)throw new Error("Verified TOTP unavailable");
    const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:factor.id});
    if(challengeError||!challenge)throw challengeError??new Error("TOTP challenge unavailable");
    const {error:verifyError}=await supabase.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:codeValue});
    if(verifyError)throw verifyError;
  }

  function getExpiry(){
    if(preset==="custom")return customExpiry?new Date(customExpiry):null;
    const days=Number(preset);return [1,3,7,30].includes(days)?new Date(Date.now()+days*86400000):null;
  }

  async function add(){
    if(busy)return;
    const expiry=getExpiry();
    if(!address.trim()||!reason.trim()||code.length!==6){setMessage(t.required);return;}
    if(!expiry||!Number.isFinite(expiry.getTime())||expiry.getTime()<=Date.now()){setMessage(t.badExpiry);return;}
    setBusy(true);setMessage("");
    try{
      await verify(code);
      const result=await addOwnerIpBlock({address:address.trim(),expiresAt:expiry.toISOString(),reason:reason.trim()});
      if(!result.ok){setMessage(result.selfBlock?t.selfBlock:result.sourceUnavailable?t.sourceUnavailable:result.invalidAddress?t.badAddress:t.duplicate);setCode("");return;}
      setAddress("");setReason("");setCode("");setMessage(t.saved);await refreshAfterWrite();
    }catch{setMessage(t.failed);setCode("");}
    finally{setBusy(false);}
  }

  async function lift(block:ActiveBlock){
    if(busy)return;
    const liftReason=liftReasons[block.block_id]?.trim()??"";
    if(!liftReason||code.length!==6){setMessage(t.required);return;}
    setBusy(true);setMessage("");
    try{
      await verify(code);
      const result=await liftOwnerIpBlock({blockId:block.block_id,reason:liftReason});
      if(!result.ok)throw new Error("Lift rejected");
      setLiftReasons(current=>({...current,[block.block_id]:""}));setCode("");setMessage(t.lifted);await refreshAfterWrite();
    }catch{setMessage(t.failed);setCode("");}
    finally{setBusy(false);}
  }

  async function refreshAfterWrite(){
    const result=await listOwnerIpBlocks();
    if(!result.ok){setLoaded(false);return;}
    setRows(result.rows);setAudit(result.audit);setLoaded(true);
  }

  return <section className={styles.panel} lang={locale} aria-labelledby="owner-ip-block-title">
    <header><h2 id="owner-ip-block-title">{t.title}</h2><p className={styles.intro}>{t.intro}</p></header>
    <p className={styles.notice}>{t.coverage}</p>
    <p className={styles.notice} data-configured={configurationPresent}>{configurationPresent?t.configReady:t.configMissing}</p>
    <p className={styles.policy} data-enabled={enforcementEnabled}>{enforcementEnabled?t.enforcementOn:t.enforcementOff}</p>
    <div className={styles.form}>
      <label>{t.address}<input autoComplete="off" spellCheck={false} value={address} onChange={event=>setAddress(event.target.value)} disabled={busy}/><small>{t.addressHint}</small></label>
      <label>{t.expiry}<select value={preset} onChange={event=>setPreset(event.target.value)} disabled={busy}><option value="1">{t.days1}</option><option value="3">{t.days3}</option><option value="7">{t.days7}</option><option value="30">{t.days30}</option><option value="custom">{t.custom}</option></select></label>
      {preset==="custom"&&<label>{t.customDate}<input type="datetime-local" value={customExpiry} onChange={event=>setCustomExpiry(event.target.value)} disabled={busy}/></label>}
      <label>{t.reason}<textarea maxLength={500} value={reason} onChange={event=>setReason(event.target.value)} disabled={busy}/></label>
      <label>{t.totp}<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))} disabled={busy}/></label>
      <div className={styles.actions}><button type="button" className="button button-primary" onClick={()=>void add()} disabled={busy||!configurationPresent||!address.trim()||!reason.trim()||code.length!==6}>{busy?t.adding:t.add}</button><button type="button" className="button" onClick={()=>void reload()} disabled={busy||code.length!==6}>{busy?t.refreshing:t.refresh}</button></div>
    </div>
    {message&&<p className={styles.status} role="status" aria-live="polite">{message}</p>}
    <section className={styles.list}><h3>{t.active}</h3>{!loaded?<p>{t.loadFirst}</p>:rows.length===0?<p>{t.none}</p>:<ul>{rows.map(row=><li key={row.block_id}>
      <div className={styles.heading}><strong>{t.fingerprint}: …{row.fingerprint_suffix}</strong><span>{t.expires}: <time dateTime={row.expires_at}>{new Date(row.expires_at).toLocaleString(locale)}</time></span></div>
      <p><b>{t.reason}:</b> {row.reason}</p><p><b>{t.by}:</b> {row.actor_username??"—"} · {new Date(row.created_at).toLocaleString(locale)}</p>
      <label>{t.liftReason}<textarea maxLength={500} value={liftReasons[row.block_id]??""} onChange={event=>setLiftReasons(current=>({...current,[row.block_id]:event.target.value}))} disabled={busy}/></label>
      <button type="button" className="button" onClick={()=>void lift(row)} disabled={busy||!liftReasons[row.block_id]?.trim()||code.length!==6}>{busy?t.lifting:t.lift}</button>
    </li>)}</ul>}</section>
    <section className={styles.list}><h3>{t.history}</h3>{!loaded?<p>{t.loadFirst}</p>:audit.length===0?<p>{t.historyEmpty}</p>:<ul>{audit.map(row=><li key={row.event_id}>
      <div className={styles.heading}><strong>{row.action==="created"?t.actionCreated:row.action==="lifted"?t.actionLifted:t.actionExpired}</strong><time dateTime={row.occurred_at}>{new Date(row.occurred_at).toLocaleString(locale)}</time></div>
      <p><b>{t.reason}:</b> {row.action==="expired"?t.automaticReason:row.reason}</p><p><b>{t.by}:</b> {row.actor_username??"—"} · {t.expires}: {new Date(row.expires_at).toLocaleString(locale)}</p>
    </li>)}</ul>}</section>
    <p className={styles.note}>{t.retention}</p>
  </section>;
}
