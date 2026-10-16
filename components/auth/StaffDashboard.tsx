"use client";

import {useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import {ADMIN_DASHBOARD_WIDGET_IDS,DEFAULT_ADMIN_DASHBOARD_WIDGET_IDS,DEFAULT_OWNER_DASHBOARD_WIDGET_IDS,OWNER_DASHBOARD_WIDGET_IDS} from "@/lib/admin/dashboard-widget-ids";
import styles from "./StaffDashboard.module.css";

export type StaffDashboardWidget = {id:string;content:ReactNode};
type WidgetId="dashboard_summary"|"reports"|"submissions"|"post_editor"|"notifications"|"analytics"|"sanctions"|"posts"|"homepage_tags"|"staff_access"|"risk_lexicon"|"security_email"|"ip_blocks"|"recent_operations"|"storage_usage"|"clarifications"|"reaction_icons"|"account_deletion_reviews"|"campaign_crm";

const copy={
  "zh-CN":{
    title:"工作台",intro:"按角色显示可用工具。你可以调整个人布局，保存后会应用于下次访问。",layout:"我的布局",available:"可添加的工具",empty:"当前没有已显示的工具。请从下方添加。",noAvailable:"所有可用工具都已显示。",moveUp:"上移",moveDown:"下移",drag:"拖拽调整位置",hide:"隐藏",show:"添加",save:"保存布局",saving:"正在保存…",saved:"个人布局已保存。",saveError:"布局未能保存。请确认数据库迁移已应用，然后重试。",loading:"正在载入已保存布局…",unavailable:"布局暂不可用，当前显示版本默认工具；布局保存与重置已停用。",resetTitle:"重置所有 Admin 的个人布局",resetIntro:"此操作会将所有 Admin 的个人布局恢复为当前版本化默认布局。不会修改 Owner 自己的布局。",resetReason:"重置原因（必填）",resetPlaceholder:"说明为何恢复 Admin 默认布局",totp:"Authenticator 验证码",reset:"重置 Admin 布局",cancel:"取消",resetConfirm:"确定将所有 Admin 的个人布局恢复为当前版本化默认布局吗？此操作不可撤销。",resetting:"正在验证并重置…",resetSuccess:"已恢复 {count} 个 Admin 布局。Owner 的个人布局未更改。",resetError:"重置未完成。请检查 Owner 权限、原因和近期 TOTP。",reasonRequired:"请填写不超过 500 字的重置原因。",codeRequired:"请输入 6 位验证码。",registry:"可用工具",editHint:"拖拽小组件调整顺序，也可使用上移、下移及隐藏按钮。",widgets:{dashboard_summary:"今日概览",reports:"举报审核",submissions:"投稿审核",post_editor:"公开内容修订",notifications:"站内通知",analytics:"分析概览",sanctions:"账号处罚",posts:"公开内容管理",homepage_tags:"首页标签设置",staff_access:"后台人员管理",risk_lexicon:"投稿风险词库",security_email:"关键安全邮件",ip_blocks:"Owner IP 封锁",recent_operations:"近期操作记录",storage_usage:"Storage 用量",clarifications:"澄清管理",reaction_icons:"Reaction 图标",campaign_crm:"Campaign 客户与报价"}
  },
  en:{
    title:"Staff dashboard",intro:"Available tools are filtered by your role. Arrange your personal layout and save it for your next visit.",layout:"My layout",available:"Available to add",empty:"No tools are visible. Add one from the list below.",noAvailable:"All available tools are already displayed.",moveUp:"Move up",moveDown:"Move down",drag:"Drag to reorder",hide:"Hide",show:"Add",save:"Save layout",saving:"Saving…",saved:"Personal layout saved.",saveError:"The layout could not be saved. Confirm the database migration is applied, then retry.",loading:"Loading saved layout…",unavailable:"The dashboard layout is temporarily unavailable. Showing the versioned default; layout save and reset are disabled.",resetTitle:"Reset every Admin personal layout",resetIntro:"This restores every Admin's personal layout to the current versioned default. Your own Owner layout is unchanged.",resetReason:"Reason for reset (required)",resetPlaceholder:"Explain why Admin layouts should be restored",totp:"Authenticator code",reset:"Reset Admin layouts",cancel:"Cancel",resetConfirm:"Restore every Admin personal layout to the current versioned default? This cannot be undone.",resetting:"Verifying and resetting…",resetSuccess:"Restored {count} Admin layout(s). Your own Owner layout was unchanged.",resetError:"Reset failed. Check Owner access, the reason and recent TOTP.",reasonRequired:"Enter a reason of no more than 500 characters.",codeRequired:"Enter the 6-digit code.",registry:"Available tools",editHint:"Drag widgets to reorder them, or use the move and hide buttons.",widgets:{dashboard_summary:"Today at a glance",reports:"Reports review",submissions:"Submission review",post_editor:"Public content revisions",notifications:"Staff notifications",analytics:"Analytics overview",sanctions:"Account sanctions",posts:"Public content",homepage_tags:"Homepage tags",staff_access:"Staff access",risk_lexicon:"Submission risk lexicon",security_email:"Critical security email",ip_blocks:"Owner IP blocks",recent_operations:"Recent operations",storage_usage:"Storage usage",clarifications:"Clarification manager",reaction_icons:"Reaction icons",campaign_crm:"Campaign clients and quotes"}
  },
  ms:{
    title:"Papan pemuka kakitangan",intro:"Alat yang tersedia ditapis mengikut peranan anda. Susun atur peribadi boleh disimpan untuk lawatan seterusnya.",layout:"Susun atur saya",available:"Alat yang boleh ditambah",empty:"Tiada alat dipaparkan. Tambah alat daripada senarai di bawah.",noAvailable:"Semua alat yang tersedia telah dipaparkan.",moveUp:"Naikkan",moveDown:"Turunkan",drag:"Seret untuk menyusun semula",hide:"Sembunyikan",show:"Tambah",save:"Simpan susun atur",saving:"Sedang menyimpan…",saved:"Susun atur peribadi disimpan.",saveError:"Susun atur tidak dapat disimpan. Pastikan migrasi pangkalan data telah digunakan, kemudian cuba lagi.",loading:"Sedang memuatkan susun atur…",unavailable:"Susun atur papan pemuka tidak tersedia buat sementara. Lalai versi semasa dipaparkan; simpan dan tetapkan semula dinyahaktifkan.",resetTitle:"Tetapkan semula susun atur peribadi semua Admin",resetIntro:"Tindakan ini memulihkan susun atur setiap Admin kepada lalai versi semasa. Susun atur Owner sendiri tidak berubah.",resetReason:"Sebab tetapan semula (wajib)",resetPlaceholder:"Terangkan sebab susun atur Admin perlu dipulihkan",totp:"Kod pengesah",reset:"Tetapkan semula susun atur Admin",cancel:"Batal",resetConfirm:"Pulihkan susun atur peribadi semua Admin kepada lalai versi semasa? Tindakan ini tidak boleh dibuat asal.",resetting:"Mengesahkan dan menetapkan semula…",resetSuccess:"{count} susun atur Admin dipulihkan. Susun atur Owner tidak berubah.",resetError:"Tetapan semula gagal. Semak akses Owner, sebab dan TOTP terkini.",reasonRequired:"Masukkan sebab sehingga 500 aksara.",codeRequired:"Masukkan kod 6 digit.",registry:"Alat tersedia",editHint:"Seret widget untuk menyusun semula, atau gunakan butang naik dan turun.",widgets:{dashboard_summary:"Ringkasan hari ini",reports:"Semakan laporan",submissions:"Semakan penghantaran",post_editor:"Semakan kandungan awam",notifications:"Pemberitahuan kakitangan",analytics:"Ringkasan analitik",sanctions:"Sekatan akaun",posts:"Kandungan awam",homepage_tags:"Tag halaman utama",staff_access:"Akses kakitangan",risk_lexicon:"Kamus risiko penghantaran",security_email:"E-mel keselamatan kritikal",ip_blocks:"Sekatan IP Owner",recent_operations:"Operasi terkini",storage_usage:"Penggunaan Storage",clarifications:"Pengurusan penjelasan",reaction_icons:"Ikon reaksi",campaign_crm:"Pelanggan dan sebut harga Campaign"}
  }
} as const;

async function verifyRecentTotp(code:string){
  const supabase=createSupabaseBrowserClient();
  const {data:factors,error:listError}=await supabase.auth.mfa.listFactors();
  if(listError)throw listError;
  const factor=factors.totp.find(item=>item.status==="verified");
  if(!factor)throw new Error("Verified TOTP unavailable");
  const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:factor.id});
  if(challengeError||!challenge)throw challengeError??new Error("TOTP challenge unavailable");
  const {error:verifyError}=await supabase.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code});
  if(verifyError)throw verifyError;
  return supabase;
}

export function StaffDashboard({widgets,initialWidgetIds,layoutReady,isOwner}:{widgets:StaffDashboardWidget[];initialWidgetIds:string[];layoutReady:boolean;isOwner:boolean}){
  const {locale}=usePreferences();
  const t=copy[locale];
  const id=useId();
  const widgetTitle=(widgetId:string)=>widgetId==="hot_settings"?({"zh-CN":"Hot 有效阅读门槛",en:"Hot valid-read threshold",ms:"Ambang bacaan sah Hot"}[locale]):widgetId==="account_deletion_reviews"?({"zh-CN":"账号删除审核",en:"Account deletion review",ms:"Semakan pemadaman akaun"}[locale]):(t.widgets as Partial<Record<WidgetId,string>>)[widgetId as WidgetId]??widgetId;
  const registry=useMemo(()=>{
    const allowedIds=new Set<string>(isOwner?OWNER_DASHBOARD_WIDGET_IDS:ADMIN_DASHBOARD_WIDGET_IDS);
    const defaultOrder:readonly string[]=isOwner?OWNER_DASHBOARD_WIDGET_IDS:DEFAULT_ADMIN_DASHBOARD_WIDGET_IDS;
    const seen=new Set<string>();
    return widgets.filter(widget=>allowedIds.has(widget.id)&&!seen.has(widget.id)&&Boolean(seen.add(widget.id)))
      .sort((a,b)=>defaultOrder.indexOf(a.id)-defaultOrder.indexOf(b.id));
  },[widgets,isOwner]);
  const byId=useMemo(()=>new Map(registry.map(widget=>[widget.id,widget])),[registry]);
  const validInitial=()=>initialWidgetIds.filter((widgetId,index)=>byId.has(widgetId)&&initialWidgetIds.indexOf(widgetId)===index);
  const [visibleIds,setVisibleIds]=useState<string[]>(()=>validInitial());
  const [draggingWidgetId,setDraggingWidgetId]=useState<string|null>(null);
  const activePointer=useRef<{widgetId:string;pointerId:number}|null>(null);
  const lastPointerTarget=useRef<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [resetOpen,setResetOpen]=useState(false);
  const [resetReason,setResetReason]=useState("");
  const [code,setCode]=useState("");
  const defaultIds=isOwner?DEFAULT_OWNER_DASHBOARD_WIDGET_IDS:DEFAULT_ADMIN_DASHBOARD_WIDGET_IDS;

  const displayedIds=layoutReady?visibleIds:defaultIds.filter(widgetId=>byId.has(widgetId));
  const displayed=displayedIds.flatMap(widgetId=>{const widget=byId.get(widgetId);return widget?[widget]:[];});
  const hidden=registry.filter(widget=>!displayedIds.includes(widget.id));
  const updateOrder=(widgetId:string,offset:-1|1)=>setVisibleIds(current=>{
    const index=current.indexOf(widgetId),next=index+offset;
    if(index<0||next<0||next>=current.length)return current;
    const reordered=[...current];[reordered[index],reordered[next]]=[reordered[next],reordered[index]];return reordered;
  });
  const placeWidgetNear=(widgetId:string,targetId:string)=>setVisibleIds(current=>{
    const sourceIndex=current.indexOf(widgetId),targetIndex=current.indexOf(targetId);
    if(sourceIndex<0||targetIndex<0||sourceIndex===targetIndex)return current;
    const next=[...current];next.splice(sourceIndex,1);
    const adjustedTargetIndex=next.indexOf(targetId);
    next.splice(adjustedTargetIndex+(sourceIndex<targetIndex?1:0),0,widgetId);
    return next;
  });
  function beginWidgetDrag(widgetId:string,event:ReactPointerEvent<HTMLSpanElement>){
    if(!layoutReady||busy||event.button!==0)return;
    activePointer.current={widgetId,pointerId:event.pointerId};
    lastPointerTarget.current=widgetId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingWidgetId(widgetId);
    event.preventDefault();
  }
  function moveDraggedWidget(event:ReactPointerEvent<HTMLSpanElement>){
    const active=activePointer.current;
    if(!active||active.pointerId!==event.pointerId)return;
    const targetElement=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>("[data-widget-id]");
    const targetId=targetElement?.dataset.widgetId;
    if(!targetId||targetId===active.widgetId||targetId===lastPointerTarget.current)return;
    lastPointerTarget.current=targetId;
    placeWidgetNear(active.widgetId,targetId);
  }
  function endWidgetDrag(event:ReactPointerEvent<HTMLSpanElement>){
    if(activePointer.current?.pointerId!==event.pointerId)return;
    activePointer.current=null;
    lastPointerTarget.current=null;
    setDraggingWidgetId(null);
  }

  async function saveLayout(){
    if(busy)return;
    if(!layoutReady){setMessage(t.unavailable);return;}
    setBusy(true);setMessage("");
    try{
      const supabase=createSupabaseBrowserClient();
      const {data,error}=await supabase.rpc("staff_save_dashboard_layout",{p_widget_ids:visibleIds.filter(widgetId=>byId.has(widgetId))});
      if(error||data!==true)throw error??new Error("Layout save rejected");
      setMessage(t.saved);
    }catch{setMessage(t.saveError);}
    finally{setBusy(false);}
  }

  async function resetAdminLayouts(){
    if(busy)return;
    if(!layoutReady){setMessage(t.unavailable);return;}
    if(!resetReason.trim()||resetReason.trim().length>500){setMessage(t.reasonRequired);return;}
    if(code.length!==6){setMessage(t.codeRequired);return;}
    if(!window.confirm(t.resetConfirm))return;
    setBusy(true);setMessage("");
    try{
      const supabase=await verifyRecentTotp(code);
      const {data,error}=await supabase.rpc("owner_reset_admin_dashboard_layouts",{p_reason:resetReason.trim()});
      const count=typeof data==="number"?data:typeof data==="string"&&/^\d+$/.test(data)?Number(data):NaN;
      if(error||!Number.isSafeInteger(count)||count<0)throw error??new Error("Layout reset rejected");
      setMessage(t.resetSuccess.replace("{count}",String(count)));
      setResetReason("");setCode("");setResetOpen(false);
    }catch{setMessage(t.resetError);setCode("");}
    finally{setBusy(false);}
  }

  return <div className={styles.page} lang={locale}>
    <header className={styles.heading}><p className="eyebrow">MMWR · STAFF</p><h1>{t.title}</h1><p>{t.intro}</p></header>
    <>
      <section className={styles.section} aria-labelledby={`${id}-layout`}>
        <div className={styles.sectionHeading}><div><h2 id={`${id}-layout`}>{t.layout}</h2><p>{t.editHint}</p></div><button type="button" className="button button-primary" onClick={saveLayout} disabled={busy||!layoutReady}>{busy?t.saving:t.save}</button></div>
        {displayed.length===0?<p className={styles.empty}>{t.empty}</p>:<div className={styles.widgets}>{displayed.map((widget,index)=><article data-widget-id={widget.id} className={`${styles.widget} ${draggingWidgetId===widget.id?styles.widgetDragging:""}`} key={widget.id}>
          <div className={styles.widgetHeading}><h3>{widgetTitle(widget.id)}</h3><div className={styles.controls}>
            <span className={styles.dragHandle} onPointerDown={event=>beginWidgetDrag(widget.id,event)} onPointerMove={moveDraggedWidget} onPointerUp={endWidgetDrag} onPointerCancel={endWidgetDrag} onLostPointerCapture={endWidgetDrag} aria-hidden="true" aria-disabled={busy||!layoutReady} title={t.drag}>⠿</span>
            <button type="button" onClick={()=>updateOrder(widget.id,-1)} disabled={busy||!layoutReady||index===0} aria-label={`${t.moveUp}: ${widgetTitle(widget.id)}`}>{t.moveUp}</button>
            <button type="button" onClick={()=>updateOrder(widget.id,1)} disabled={busy||!layoutReady||index===displayed.length-1} aria-label={`${t.moveDown}: ${widgetTitle(widget.id)}`}>{t.moveDown}</button>
            <button type="button" onClick={()=>setVisibleIds(current=>current.length>1?current.filter(item=>item!==widget.id):current)} disabled={busy||!layoutReady||displayedIds.length<=1} aria-label={`${t.hide}: ${widgetTitle(widget.id)}`}>{t.hide}</button>
          </div></div>
          <div className={styles.widgetContent}>{widget.content}</div>
        </article>)}</div>}
        <div className={styles.registry}><h3>{t.registry}</h3>{hidden.length===0?<p>{t.noAvailable}</p>:<ul>{hidden.map(widget=><li key={widget.id}><span>{widgetTitle(widget.id)}</span><button type="button" onClick={()=>setVisibleIds(current=>[...current,widget.id])} disabled={busy||!layoutReady}>{t.show}</button></li>)}</ul>}</div>
      </section>
    </>
    {!layoutReady&&<p className={styles.status} role="status">{t.unavailable}</p>}
    {isOwner&&<section className={styles.reset} aria-labelledby={`${id}-reset`}>
      <div className={styles.sectionHeading}><div><h2 id={`${id}-reset`}>{t.resetTitle}</h2><p>{t.resetIntro}</p></div><button type="button" className="button" onClick={()=>{setResetOpen(open=>!open);setMessage("");}} disabled={busy||!layoutReady}>{resetOpen?t.cancel:t.reset}</button></div>
      {resetOpen&&<div className={styles.resetForm}>
        <label htmlFor={`${id}-reason`}>{t.resetReason}<textarea id={`${id}-reason`} maxLength={500} value={resetReason} onChange={event=>setResetReason(event.target.value)} placeholder={t.resetPlaceholder}/></label>
        <label htmlFor={`${id}-totp`}>{t.totp}<input id={`${id}-totp`} autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))}/></label>
        <button type="button" className="button button-primary" onClick={resetAdminLayouts} disabled={busy||!layoutReady||!resetReason.trim()||code.length!==6}>{busy?t.resetting:t.reset}</button>
      </div>}
    </section>}
    {message&&<p className={styles.status} role="status" aria-live="polite">{message}</p>}
  </div>;
}
