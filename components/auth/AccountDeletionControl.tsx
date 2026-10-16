"use client";

import {useActionState} from "react";
import {cancelAccountDeletionAction, requestAccountDeletionAction, signOutAction} from "@/app/account/actions";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import styles from "./AccountDeletionControl.module.css";

const words={
  "zh-CN":{title:"账号删除",requestIntro:"申请后账号会立即暂停投稿与 Reaction，并进入 7 天冷静期。冷静期内可取消；如最终完成删除，该账号的历史用户名也会一并删除且不预留。到期清理仍须在服务环境启用安全处理流程。",confirm:"我确认申请删除此账号，并了解 7 天冷静期；最终删除也会清除历史用户名，旧用户名之后可能重新注册。",request:"申请删除账号",pending:"账号删除申请处理中",requested:"申请时间",due:"可取消截止时间",pendingNote:"账号已暂停普通操作。你仍可在截止时间前取消申请。到期自动清理目前未启用。",review:"账号删除等待人工审核",reviewNote:"账号删除流程暂时无法自动完成，账号限制继续保留，等待 Owner 人工审核。系统不会自动删除或转移资料。",cancel:"取消删除申请",disabled:"账号删除请求默认关闭；完成安全清理和文件保留流程后才会开放。",confirmRequired:"请先确认申请删除。",requestFailed:"暂时无法提交删除申请。账号状态未更改。",cancelFailed:"无法取消删除申请；请检查是否仍在 7 天冷静期。",cancelled:"已取消账号删除申请，账号状态已恢复。",signOut:"退出登录"},
  en:{title:"Account deletion",requestIntro:"A request immediately pauses submissions and Reactions, then starts a 7-day cooling-off period. You can cancel during this period. If deletion completes, the account's historical usernames are also deleted and not reserved. Final cleanup stays gated until secure account and file-retention processing is enabled.",confirm:"I confirm this account deletion request and understand the 7-day cooling-off period. If deletion completes, historical usernames are removed and may be registered again.",request:"Request account deletion",pending:"Account deletion request pending",review:"Account deletion needs manual review",reviewNote:"The account deletion could not be completed automatically. Account restrictions remain in place while the Owner reviews it. The system will not automatically delete or transfer files.",requested:"Requested",due:"Cancellation deadline",pendingNote:"Regular account actions are paused. You can cancel before the deadline. Automatic final cleanup is not enabled yet.",cancel:"Cancel deletion request",disabled:"Account deletion requests are off by default. They will open after secure cleanup and file-retention handling are ready.",confirmRequired:"Confirm the deletion request first.",requestFailed:"The deletion request could not be submitted. Your account state was not changed.",cancelFailed:"The request could not be cancelled. Check that the 7-day period is still open.",cancelled:"The deletion request was cancelled and the account is active again.",signOut:"Sign out"},
  ms:{title:"Pemadaman akaun",requestIntro:"Permohonan akan menghentikan penghantaran dan Reaction serta-merta, kemudian memulakan tempoh bertenang 7 hari. Anda boleh membatalkannya dalam tempoh ini. Jika pemadaman selesai, sejarah nama pengguna akaun ini turut dipadam dan tidak disimpan untuk tempahan semula. Pembersihan akhir kekal dikunci sehingga pemprosesan akaun dan pengekalan fail yang selamat diaktifkan.",confirm:"Saya mengesahkan permohonan pemadaman akaun ini dan memahami tempoh bertenang 7 hari. Jika pemadaman selesai, sejarah nama pengguna akan dipadam dan nama lama boleh didaftarkan semula.",request:"Mohon pemadaman akaun",pending:"Permohonan pemadaman akaun sedang diproses",review:"Pemadaman akaun memerlukan semakan manual",reviewNote:"Pemadaman akaun tidak dapat diselesaikan secara automatik. Sekatan akaun kekal sementara Owner menyemaknya. Sistem tidak akan memadam atau memindahkan fail secara automatik.",requested:"Dimohon pada",due:"Tarikh akhir pembatalan",pendingNote:"Tindakan akaun biasa dihentikan. Anda boleh membatalkan sebelum tarikh akhir. Pembersihan automatik akhir belum diaktifkan.",cancel:"Batalkan permohonan pemadaman",disabled:"Permohonan pemadaman akaun dimatikan secara lalai. Ia akan dibuka selepas pembersihan selamat dan pengendalian pengekalan fail tersedia.",confirmRequired:"Sahkan permohonan pemadaman dahulu.",requestFailed:"Permohonan pemadaman tidak dapat dihantar. Status akaun tidak berubah.",cancelFailed:"Permohonan tidak dapat dibatalkan. Semak sama ada tempoh 7 hari masih terbuka.",cancelled:"Permohonan pemadaman dibatalkan dan akaun kembali aktif.",signOut:"Log keluar"}
} as const;

export function AccountDeletionControl({state,requestedAt,enabled,cancelled=false}:{state:"active"|"deletion_pending"|"deletion_review_required";requestedAt?:string|null;enabled:boolean;cancelled?:boolean}) {
  const {locale}=usePreferences();
  const t=words[locale];
  const [requestState,requestAction,requesting]=useActionState(requestAccountDeletionAction,{key:""});
  const [cancelState,cancelAction,cancelling]=useActionState(cancelAccountDeletionAction,{key:""});
  const errorText=(key:string)=>({deletionConfirmationRequired:t.confirmRequired,deletionRequestFailed:t.requestFailed,deletionCancelFailed:t.cancelFailed,serviceUnavailable:t.requestFailed,signInFirst:t.requestFailed} as Record<string,string>)[key];
  const requestedDate=requestedAt?new Date(requestedAt):null;
  const dueDate=requestedDate?new Date(requestedDate.getTime()+7*24*60*60*1000):null;
  const dateOptions:Intl.DateTimeFormatOptions={dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kuala_Lumpur"};
  const format=(date:Date|null)=>date&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat(locale,dateOptions).format(date):"";

  return <section className={`auth-panel ${styles.panel}`} lang={locale}>
    <p className="eyebrow">MMWR · PRIVACY</p><h2>{state==="deletion_pending"?t.pending:state==="deletion_review_required"?t.review:t.title}</h2>
    {state==="deletion_review_required"?<>
      <p className="auth-intro">{t.reviewNote}</p>
    </>:state==="deletion_pending"?<>
      <p className="auth-intro">{t.pendingNote}</p>
      <dl className={styles.dates}><div><dt>{t.requested}</dt><dd>{format(requestedDate)}</dd></div><div><dt>{t.due}</dt><dd>{format(dueDate)}</dd></div></dl>
      <form action={cancelAction} className="auth-form"><button className="button button-primary" disabled={cancelling}>{t.cancel}</button></form>
      {cancelState.key&&<p className="auth-message" role="alert">{errorText(cancelState.key)??t.cancelFailed}</p>}
    </>:<>
      {cancelled&&<p className="auth-message" role="status">{t.cancelled}</p>}
      <p className="auth-intro">{enabled?t.requestIntro:t.disabled}</p>
      {enabled&&<form action={requestAction} className="auth-form">
        <label className={styles.confirm}><input type="checkbox" name="confirmDeletion" value="yes" required/><span>{t.confirm}</span></label>
        <button className="button button-outline" disabled={requesting}>{t.request}</button>
      </form>}
      {requestState.key&&<p className="auth-message" role="alert">{errorText(requestState.key)??t.requestFailed}</p>}
    </>}
    <form action={signOutAction} className={styles.signout}><button type="submit" className="button button-outline">{t.signOut}</button></form>
  </section>;
}
