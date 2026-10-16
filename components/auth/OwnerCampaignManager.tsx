"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import type {Locale} from "@/lib/i18n/catalog";
import styles from "./OwnerCampaignManager.module.css";

type Campaign={campaign_id:string;client_name:string;quote_amount:number|string;quote_currency:"MYR";billing_model:"flat_fee"|"cpm"|"cpc";ad_slot:string;starts_on:string|null;ends_on:string|null;creative_notes:string;status:"draft"|"quoted"|"confirmed"|"completed"|"cancelled";created_at:string;updated_at:string};
type CampaignForm={clientName:string;quoteAmount:string;billingModel:Campaign["billing_model"];adSlot:string;startsOn:string;endsOn:string;creativeNotes:string;status:Campaign["status"]};
const blank:CampaignForm={clientName:"",quoteAmount:"",billingModel:"flat_fee",adSlot:"",startsOn:"",endsOn:"",creativeNotes:"",status:"draft"};
const copy:Record<Locale,{title:string;intro:string;newCampaign:string;client:string;amount:string;model:string;slot:string;start:string;end:string;notes:string;status:string;reason:string;reasonPlaceholder:string;totp:string;create:string;save:string;cancelEdit:string;edit:string;reload:string;loading:string;empty:string;loadError:string;saveError:string;saved:string;required:string;draft:string;quoted:string;confirmed:string;completed:string;cancelled:string;flat:string;cpm:string;cpc:string;noAdvertising:string;accepted:string;filterClient:string;filterSlot:string;fromDate:string;toDate:string;filteredEmpty:string}>={
  "zh-CN":{title:"Campaign 客户与报价",intro:"仅供 Owner 私下记录客户名称与报价，不接触客户联系方式，不创建广告位、不投放、不追踪，也不会自动计费。广告费用只按 MYR 记录为报价。列表最多显示最近 100 条。",newCampaign:"新建报价记录",client:"客户名称",amount:"报价金额（MYR）",model:"报价方式",slot:"拟议广告位置（仅备注）",start:"开始日期（可选）",end:"结束日期（可选）",notes:"素材说明（文字，不上传素材）",status:"状态",reason:"操作原因（必填）",reasonPlaceholder:"说明新增或修改原因",totp:"6 位 Authenticator 验证码",create:"验证并新增",save:"验证并保存",cancelEdit:"取消编辑",edit:"编辑",reload:"刷新列表",loading:"正在读取报价记录…",empty:"还没有报价记录。",loadError:"无法读取报价记录。请确认迁移已应用，并重新验证 Owner TOTP。",saveError:"保存失败。请检查 Owner 权限、TOTP、字段格式和迁移状态。",saved:"报价记录与审计已保存。此操作不会投放广告或收费。",required:"请检查必填字段、日期范围、操作原因及 6 位验证码。",draft:"草稿",quoted:"已报价",confirmed:"已确认（不代表已投放）",completed:"已结束",cancelled:"已取消",flat:"固定费用",cpm:"CPM 报价（不计展示）",cpc:"CPC 报价（不计点击）",noAdvertising:"无联系方式、广告投放、追踪事件或自动计费。报价记录仅 Owner 可见。",accepted:"CRM 数据为私有商业资料。",filterClient:"按客户筛选",filterSlot:"按位置筛选",fromDate:"开始日期",toDate:"结束日期",filteredEmpty:"没有符合条件的报价记录。"},
  en:{title:"Campaign clients and quotes",intro:"Private Owner quote records only. No contact details, ad inventory, ad delivery, tracking or automatic billing. Amounts are quotes recorded in MYR. The list shows up to the latest 100 records.",newCampaign:"New quote record",client:"Client name",amount:"Quote amount (MYR)",model:"Quote model",slot:"Proposed ad slot (notes only)",start:"Start date (optional)",end:"End date (optional)",notes:"Creative notes (text only; no upload)",status:"Status",reason:"Reason for change (required)",reasonPlaceholder:"Explain why this record is added or changed",totp:"6-digit authenticator code",create:"Verify and add",save:"Verify and save",cancelEdit:"Cancel edit",edit:"Edit",reload:"Refresh list",loading:"Loading quote records…",empty:"No quote records yet.",loadError:"Could not load quote records. Confirm the migration is applied and verify Owner TOTP again.",saveError:"Save failed. Check Owner access, TOTP, field formats and migration status.",saved:"Quote record and audit saved. This does not serve ads or charge anyone.",required:"Check required fields, date range, reason and 6-digit code.",draft:"Draft",quoted:"Quoted",confirmed:"Confirmed (does not mean served)",completed:"Ended",cancelled:"Cancelled",flat:"Flat fee",cpm:"CPM quote (no impressions counted)",cpc:"CPC quote (no clicks counted)",noAdvertising:"No contact details, ad delivery, tracking events or automatic billing. Only the Owner can view these records.",accepted:"CRM data is private commercial information.",filterClient:"Filter by client",filterSlot:"Filter by slot",fromDate:"From date",toDate:"To date",filteredEmpty:"No quote records match these filters."},
  ms:{title:"Pelanggan dan sebut harga kempen",intro:"Rekod sebut harga peribadi Owner sahaja. Tiada maklumat hubungan, inventori iklan, penyiaran iklan, penjejakan atau bil automatik. Nilai direkod sebagai sebut harga MYR. Senarai memaparkan sehingga 100 rekod terkini.",newCampaign:"Rekod sebut harga baharu",client:"Nama pelanggan",amount:"Nilai sebut harga (MYR)",model:"Model sebut harga",slot:"Slot iklan dicadangkan (nota sahaja)",start:"Tarikh mula (pilihan)",end:"Tarikh tamat (pilihan)",notes:"Nota bahan kreatif (teks sahaja; tiada muat naik)",status:"Status",reason:"Sebab perubahan (wajib)",reasonPlaceholder:"Terangkan sebab rekod ditambah atau diubah",totp:"Kod pengesah 6 digit",create:"Sahkan dan tambah",save:"Sahkan dan simpan",cancelEdit:"Batal suntingan",edit:"Sunting",reload:"Muat semula senarai",loading:"Memuatkan rekod sebut harga…",empty:"Belum ada rekod sebut harga.",loadError:"Rekod tidak dapat dimuatkan. Sahkan migrasi telah digunakan dan sahkan semula TOTP Owner.",saveError:"Simpanan gagal. Semak akses Owner, TOTP, format medan dan status migrasi.",saved:"Rekod sebut harga dan audit disimpan. Iklan tidak disiarkan dan tiada caj dibuat.",required:"Semak medan wajib, julat tarikh, sebab dan kod 6 digit.",draft:"Draf",quoted:"Disebut harga",confirmed:"Disahkan (tidak bermaksud iklan disiarkan)",completed:"Tamat",cancelled:"Dibatalkan",flat:"Fi tetap",cpm:"Sebut harga CPM (tiada impresi dikira)",cpc:"Sebut harga CPC (tiada klik dikira)",noAdvertising:"Tiada butiran hubungan, penyiaran iklan, peristiwa penjejakan atau bil automatik. Rekod ini hanya boleh dilihat oleh Owner.",accepted:"Data CRM ialah maklumat komersial peribadi.",filterClient:"Tapis mengikut pelanggan",filterSlot:"Tapis mengikut slot",fromDate:"Dari tarikh",toDate:"Hingga tarikh",filteredEmpty:"Tiada rekod sebut harga yang sepadan."}
};
const statusKeys:Campaign["status"][]=["draft","quoted","confirmed","completed","cancelled"];

function parseCampaigns(value:unknown):Campaign[]{
  if(!Array.isArray(value))return [];
  return value.flatMap((item):Campaign[]=>{
    if(!item||typeof item!=="object")return [];
    const row=item as Record<string,unknown>;
    if(typeof row.campaign_id!=="string"||typeof row.client_name!=="string"||typeof row.ad_slot!=="string"
      ||typeof row.quote_currency!=="string"||row.quote_currency!=="MYR"
      ||(row.billing_model!=="flat_fee"&&row.billing_model!=="cpm"&&row.billing_model!=="cpc")
      ||(row.status!=="draft"&&row.status!=="quoted"&&row.status!=="confirmed"&&row.status!=="completed"&&row.status!=="cancelled")
      ||(row.starts_on!==null&&typeof row.starts_on!=="string")||(row.ends_on!==null&&typeof row.ends_on!=="string")
      ||typeof row.creative_notes!=="string"||typeof row.created_at!=="string"||typeof row.updated_at!=="string")return [];
    const amount=typeof row.quote_amount==="string"?row.quote_amount:String(row.quote_amount);
    if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(amount))return [];
    const [whole,fraction=""]=amount.split(".");
    const exactAmount=`${whole}.${fraction.padEnd(2,"0")}`;
    return [{campaign_id:row.campaign_id,client_name:row.client_name,quote_amount:exactAmount,quote_currency:"MYR",billing_model:row.billing_model,
      ad_slot:row.ad_slot,starts_on:row.starts_on as string|null,ends_on:row.ends_on as string|null,creative_notes:row.creative_notes,
      status:row.status,created_at:row.created_at,updated_at:row.updated_at}];
  }).slice(0,100);
}

function formatMyrAmount(value:string|number,locale:Locale){
  const match=String(value).match(/^(\d{1,12})(?:\.(\d{1,2}))?$/);
  if(!match)return `${String(value)} MYR`;
  const fraction=(match[2]??"").padEnd(2,"0");
  const parts=new Intl.NumberFormat(locale,{style:"currency",currency:"MYR",minimumFractionDigits:2,maximumFractionDigits:2})
    .formatToParts(BigInt(match[1]));
  return parts.map(part=>part.type==="fraction"?fraction:part.value).join("");
}

export function OwnerCampaignManager(){
  const {locale}=usePreferences();const t=copy[locale];
  const [rows,setRows]=useState<Campaign[]>([]);const [form,setForm]=useState<CampaignForm>(blank);const [editing,setEditing]=useState<string|null>(null);
  const [clientFilter,setClientFilter]=useState("");const [slotFilter,setSlotFilter]=useState("");const [fromDate,setFromDate]=useState("");const [toDate,setToDate]=useState("");
  const [reason,setReason]=useState("");const [code,setCode]=useState("");const [loading,setLoading]=useState(true);const [failed,setFailed]=useState(false);
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const fetchCampaigns=useCallback(async()=>{const supabase=createSupabaseBrowserClient();const {data,error}=await supabase.rpc("owner_list_campaigns",{p_limit:100});if(error)throw error;return parseCampaigns(data);},[]);
  const reload=useCallback(async()=>{setLoading(true);setFailed(false);try{setRows(await fetchCampaigns());}catch{setFailed(true);}finally{setLoading(false);}},[fetchCampaigns]);
  useEffect(()=>{
    let active=true;
    void fetchCampaigns().then(campaigns=>{if(active){setRows(campaigns);setFailed(false)}}).catch(()=>{if(active)setFailed(true)}).finally(()=>{if(active)setLoading(false)});
    return ()=>{active=false};
  },[fetchCampaigns]);
  function beginEdit(row:Campaign){setEditing(row.campaign_id);setForm({clientName:row.client_name,quoteAmount:String(row.quote_amount),billingModel:row.billing_model,adSlot:row.ad_slot,startsOn:row.starts_on??"",endsOn:row.ends_on??"",creativeNotes:row.creative_notes,status:row.status});setReason("");setCode("");setMessage("");}
  function reset(){setEditing(null);setForm(blank);setReason("");setCode("");setMessage("");}
  async function save(){
    if(busy)return;
    if(!form.clientName.trim()||!/^\d{1,12}(?:\.\d{1,2})?$/.test(form.quoteAmount)||!form.adSlot.trim()||!reason.trim()||code.length!==6
      ||(form.startsOn&&form.endsOn&&form.endsOn<form.startsOn)){setMessage(t.required);return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createSupabaseBrowserClient();const {data:factors,error:listError}=await supabase.auth.mfa.listFactors();if(listError)throw listError;
      const factor=factors.totp.find(item=>item.status==="verified");if(!factor)throw new Error("Verified TOTP unavailable");
      const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:factor.id});if(challengeError||!challenge)throw challengeError??new Error("TOTP challenge unavailable");
      const {error:verifyError}=await supabase.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code});if(verifyError)throw verifyError;
      const {error}=await supabase.rpc("owner_save_campaign",{p_campaign_id:editing,p_client_name:form.clientName.trim(),p_quote_amount:form.quoteAmount,p_billing_model:form.billingModel,p_ad_slot:form.adSlot.trim(),p_starts_on:form.startsOn||null,p_ends_on:form.endsOn||null,p_creative_notes:form.creativeNotes,p_status:form.status,p_reason:reason.trim()});
      if(error)throw error;reset();setMessage(t.saved);await reload();
    }catch{setCode("");setMessage(t.saveError);}finally{setBusy(false);}
  }
  const statusLabel=(status:Campaign["status"])=>t[status];
  const modelLabel=(model:Campaign["billing_model"])=>model==="flat_fee"?t.flat:model==="cpm"?t.cpm:t.cpc;
  const filteredRows=useMemo(()=>rows.filter(row=>{
    if(clientFilter.trim()&&!row.client_name.toLocaleLowerCase().includes(clientFilter.trim().toLocaleLowerCase()))return false;
    if(slotFilter.trim()&&!row.ad_slot.toLocaleLowerCase().includes(slotFilter.trim().toLocaleLowerCase()))return false;
    if(fromDate&&row.ends_on&&row.ends_on<fromDate)return false;
    if(toDate&&row.starts_on&&row.starts_on>toDate)return false;
    return true;
  }),[rows,clientFilter,slotFilter,fromDate,toDate]);
  return <section className={styles.panel} lang={locale} aria-labelledby="owner-campaign-title">
    <header><h2 id="owner-campaign-title">{t.title}</h2><p className={styles.intro}>{t.intro}</p></header>
    <p className={styles.notice}>{t.noAdvertising}</p>
    <form className={styles.form} onSubmit={event=>{event.preventDefault();void save();}}>
      <h3>{editing?t.edit:t.newCampaign}</h3>
      <div className={styles.fields}>
        <label>{t.client}<input maxLength={160} required value={form.clientName} onChange={event=>setForm({...form,clientName:event.target.value})}/></label>
        <label>{t.amount}<input type="number" min="0" max="999999999999.99" step="0.01" required value={form.quoteAmount} onChange={event=>setForm({...form,quoteAmount:event.target.value})}/></label>
        <label>{t.model}<select value={form.billingModel} onChange={event=>setForm({...form,billingModel:event.target.value as CampaignForm["billingModel"]})}><option value="flat_fee">{t.flat}</option><option value="cpm">{t.cpm}</option><option value="cpc">{t.cpc}</option></select></label>
        <label>{t.slot}<input maxLength={100} required value={form.adSlot} onChange={event=>setForm({...form,adSlot:event.target.value})}/></label>
        <label>{t.start}<input type="date" max={form.endsOn||undefined} value={form.startsOn} onChange={event=>setForm({...form,startsOn:event.target.value})}/></label>
        <label>{t.end}<input type="date" min={form.startsOn||undefined} value={form.endsOn} onChange={event=>setForm({...form,endsOn:event.target.value})}/></label>
        <label>{t.status}<select value={form.status} onChange={event=>setForm({...form,status:event.target.value as CampaignForm["status"]})}>{statusKeys.map(status=><option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
        <label className={styles.notes}>{t.notes}<textarea maxLength={2000} rows={3} value={form.creativeNotes} onChange={event=>setForm({...form,creativeNotes:event.target.value})}/></label>
      </div>
      <div className={styles.securityFields}>
        <label>{t.reason}<input maxLength={500} required value={reason} onChange={event=>setReason(event.target.value)} placeholder={t.reasonPlaceholder}/></label>
        <label>{t.totp}<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))}/></label>
        <button className="button button-primary" type="submit" disabled={busy}>{busy?t.save:editing?t.save:t.create}</button>
        {editing&&<button className="button" type="button" disabled={busy} onClick={reset}>{t.cancelEdit}</button>}
      </div>
    </form>
    {message&&<p className={styles.status} role="status" aria-live="polite">{message}</p>}
    <div className={styles.filterTools}>
      <h3>{t.accepted}</h3>
      <div className={styles.filters}>
        <label>{t.filterClient}<input value={clientFilter} onChange={event=>setClientFilter(event.target.value)}/></label>
        <label>{t.filterSlot}<input value={slotFilter} onChange={event=>setSlotFilter(event.target.value)}/></label>
        <label>{t.fromDate}<input type="date" max={toDate||undefined} value={fromDate} onChange={event=>setFromDate(event.target.value)}/></label>
        <label>{t.toDate}<input type="date" min={fromDate||undefined} value={toDate} onChange={event=>setToDate(event.target.value)}/></label>
        <button className="button" type="button" onClick={()=>void reload()} disabled={loading||busy}>{t.reload}</button>
      </div>
    </div>
    {loading?<p className={styles.status} role="status">{t.loading}</p>:failed?<p className={styles.error} role="alert">{t.loadError}</p>:rows.length===0?<p className={styles.status}>{t.empty}</p>:filteredRows.length===0?<p className={styles.status}>{t.filteredEmpty}</p>:<ul className={styles.list}>{filteredRows.map(row=><li key={row.campaign_id} className={styles.row}>
      <div className={styles.rowHead}><div><h4>{row.client_name}</h4><p>{formatMyrAmount(row.quote_amount,locale)} · {modelLabel(row.billing_model)}</p></div><span className={styles.badge} data-status={row.status}>{statusLabel(row.status)}</span></div>
      <p className={styles.meta}>{row.ad_slot} · {row.starts_on||"—"} – {row.ends_on||"—"}</p>{row.creative_notes&&<p className={styles.notesText}>{row.creative_notes}</p>}
      <button className="button" type="button" onClick={()=>beginEdit(row)}>{t.edit}</button>
    </li>)}</ul>}
  </section>;
}
