"use client";

import {useState, type FormEvent} from "react";
import Link from "@/components/shell/LocalizedLink";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {createSupabaseBrowserClient} from "@/lib/supabase/client";
import styles from "./OwnerStaffManagement.module.css";

type StaffRole = "admin" | "owner";
type Account = {user_id:string;username:string;roles:string[]};

const copy = {
  "zh-CN": {
    title:"后台人员权限", intro:"仅按用户名查找有效账号。这里只显示用户名和后台角色，不显示邮箱、投稿或其他个人资料。每次权限变更都需要重新输入 TOTP、填写原因，并写入审计记录。",
    searchLabel:"用户名（至少 3 个字符）", searchPlaceholder:"输入用户名的一部分", search:"查找账号", loading:"正在查找…", noResults:"没有找到符合条件的有效账号。",
    role:"后台角色", admin:"Admin", owner:"Owner", reason:"变更原因（必填）", reasonPlaceholder:"说明这次授权或撤销的原因", totp:"6 位 TOTP 验证码", grant:"授予角色", revoke:"撤销角色", current:"你自己的账号不能在这里变更。", haveRole:"已拥有此角色", noRole:"尚未拥有此角色", changed:"角色已更新，操作已记录。", searchError:"无法查找账号。请确认 Supabase 已配置，并且 Owner 的 TOTP 近期已验证。", changeError:"角色未变更。请检查 TOTP、原因和账号状态；你的 TOTP 可能需要重新验证。", queryTooShort:"请输入至少 3 个字符。", back:"返回首页"
  },
  en: {
    title:"Staff access", intro:"Search active accounts by username. Only usernames and staff roles are shown; email, submissions and other personal details are excluded. Each role change requires a fresh TOTP code and a reason, and is recorded in the audit log.",
    searchLabel:"Username (at least 3 characters)", searchPlaceholder:"Enter part of a username", search:"Find accounts", loading:"Searching…", noResults:"No matching active accounts were found.",
    role:"Staff role", admin:"Admin", owner:"Owner", reason:"Reason for change (required)", reasonPlaceholder:"Explain why you are granting or revoking access", totp:"6-digit TOTP code", grant:"Grant role", revoke:"Revoke role", current:"You cannot change your own role here.", haveRole:"Already has this role", noRole:"Does not have this role", changed:"Role updated and recorded.", searchError:"Could not search accounts. Check Supabase configuration and confirm that Owner TOTP was verified recently.", changeError:"Role was not changed. Check the TOTP code, reason and account status; you may need to verify TOTP again.", queryTooShort:"Enter at least 3 characters.", back:"Back to home"
  },
  ms: {
    title:"Akses kakitangan", intro:"Cari akaun aktif melalui nama pengguna. Hanya nama pengguna dan peranan kakitangan dipaparkan; e-mel, hantaran dan maklumat peribadi lain tidak didedahkan. Setiap perubahan memerlukan kod TOTP baharu dan sebab, serta direkodkan dalam log audit.",
    searchLabel:"Nama pengguna (sekurang-kurangnya 3 aksara)", searchPlaceholder:"Masukkan sebahagian nama pengguna", search:"Cari akaun", loading:"Sedang mencari…", noResults:"Tiada akaun aktif yang sepadan ditemui.",
    role:"Peranan kakitangan", admin:"Admin", owner:"Owner", reason:"Sebab perubahan (wajib)", reasonPlaceholder:"Terangkan sebab akses diberi atau ditarik balik", totp:"Kod TOTP 6 digit", grant:"Berikan peranan", revoke:"Tarik balik peranan", current:"Anda tidak boleh menukar peranan akaun sendiri di sini.", haveRole:"Sudah mempunyai peranan ini", noRole:"Belum mempunyai peranan ini", changed:"Peranan dikemas kini dan direkodkan.", searchError:"Akaun tidak dapat dicari. Semak konfigurasi Supabase dan sahkan TOTP Owner baru-baru ini.", changeError:"Peranan tidak diubah. Semak kod TOTP, sebab dan status akaun; anda mungkin perlu mengesahkan TOTP sekali lagi.", queryTooShort:"Masukkan sekurang-kurangnya 3 aksara.", back:"Kembali ke laman utama"
  }
} as const;

export function OwnerStaffManagement({currentUserId}:{currentUserId:string}) {
  const {locale}=usePreferences();
  const t=copy[locale];
  const [query,setQuery]=useState("");
  const [searchedQuery,setSearchedQuery]=useState("");
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function searchAccounts(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized=query.trim();
    if(normalized.length<3){setMessage(t.queryTooShort);return;}
    setBusy(true);setMessage("");setAccounts([]);setSearchedQuery(normalized);
    try {
      const supabase=createSupabaseBrowserClient();
      const {data,error}=await supabase.rpc("owner_search_accounts",{p_username_query:normalized});
      if(error)throw error;
      setAccounts((data??[]) as Account[]);
    } catch {setMessage(t.searchError);}
    finally {setBusy(false);}
  }

  function updateRole(userId:string,role:StaffRole,granted:boolean) {
    setAccounts((current)=>current.map((account)=>account.user_id!==userId?account:{...account,roles:granted?[...new Set([...account.roles,role])]:account.roles.filter((item)=>item!==role)}));
  }

  return <div className={styles.page} lang={locale}>
    <section className={styles.panel}>
      <p className="eyebrow">MMWR · OWNER</p>
      <h1>{t.title}</h1>
      <p className={styles.intro}>{t.intro}</p>
      <form className={styles.search} onSubmit={searchAccounts}>
        <label htmlFor="owner-account-query">{t.searchLabel}</label>
        <div><input id="owner-account-query" autoComplete="off" maxLength={24} minLength={3} value={query} onChange={(event)=>setQuery(event.target.value)} placeholder={t.searchPlaceholder}/><button className="button button-primary" disabled={busy}>{busy?t.loading:t.search}</button></div>
      </form>
      {message&&<p className={styles.message} role="status">{message}</p>}
      {searchedQuery&&accounts.length===0&&!busy&&!message&&<p className={styles.message} role="status">{t.noResults}</p>}
      <ul className={styles.accounts}>
        {accounts.map((account)=><AccountRoleEditor key={account.user_id} account={account} isSelf={account.user_id===currentUserId} onUpdated={updateRole}/>) }
      </ul>
      <Link className={styles.home} href="/">{t.back}<span aria-hidden="true">↗</span></Link>
    </section>
  </div>;
}

function AccountRoleEditor({account,isSelf,onUpdated}:{account:Account;isSelf:boolean;onUpdated:(userId:string,role:StaffRole,granted:boolean)=>void}) {
  const {locale}=usePreferences();
  const t=copy[locale];
  const [role,setRole]=useState<StaffRole>("admin");
  const [reason,setReason]=useState("");
  const [code,setCode]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function changeRole(granted:boolean) {
    if(isSelf||busy)return;
    if(reason.trim().length===0||reason.trim().length>500||!/^\d{6}$/.test(code)){setMessage(t.changeError);return;}
    setBusy(true);setMessage("");
    try {
      const supabase=createSupabaseBrowserClient();
      const {data:factors,error:listError}=await supabase.auth.mfa.listFactors();
      if(listError)throw listError;
      const factor=factors.totp.find((item)=>item.status==="verified");
      if(!factor)throw new Error("Verified TOTP unavailable");
      const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:factor.id});
      if(challengeError||!challenge)throw challengeError??new Error("TOTP challenge unavailable");
      const {error:verifyError}=await supabase.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code});
      if(verifyError)throw verifyError;
      const {data,error}=await supabase.rpc("change_staff_role",{p_target_user_id:account.user_id,p_role:role,p_grant:granted,p_reason:reason.trim()});
      if(error||data!==true)throw error??new Error("Role change rejected");
      onUpdated(account.user_id,role,granted);setReason("");setCode("");setMessage(t.changed);
    } catch {setCode("");setMessage(t.changeError);}
    finally {setBusy(false);}
  }

  const hasRole=account.roles.includes(role);
  return <li className={styles.account}>
    <div className={styles.accountHeading}><strong>{account.username}</strong><span>{account.roles.length?account.roles.map((item)=>item==="owner"?t.owner:t.admin).join(" · "):t.noRole}</span></div>
    {isSelf?<p className={styles.message}>{t.current}</p>:<>
      <label className={styles.label}>{t.role}<select value={role} onChange={(event)=>setRole(event.target.value as StaffRole)}><option value="admin">{t.admin}</option><option value="owner">{t.owner}</option></select></label>
      <label className={styles.label}>{t.reason}<input maxLength={500} value={reason} onChange={(event)=>setReason(event.target.value)} placeholder={t.reasonPlaceholder}/></label>
      <label className={styles.label}>{t.totp}<input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(event)=>setCode(event.target.value.replace(/\D/g,"").slice(0,6))}/></label>
      <div className={styles.actions}><button type="button" className="button button-primary" disabled={busy||hasRole} onClick={()=>changeRole(true)}>{busy?t.loading:t.grant}</button><button type="button" className="button button-outline" disabled={busy||!hasRole} onClick={()=>changeRole(false)}>{t.revoke}</button></div>
      {hasRole?<p className={styles.roleNote}>{t.haveRole}</p>:null}
      {message&&<p className={styles.message} role="status">{message}</p>}
    </>}
  </li>;
}
