"use client";

import {useActionState} from "react";
import {initializeProfileAction} from "@/app/account/actions";
import {usePreferences} from "@/components/shell/PreferencesProvider";

const labels = {
  "zh-CN": {title:"完成账号设置",intro:"为账号选择唯一用户名。邮箱仍只用于登录，不会显示在公开帖子中。",username:"用户名",save:"保存并继续",pending:"处理中…",usernameFormat:"用户名需为 3–24 位英文字母、数字或下划线。",usernameUnavailable:"该用户名已被使用或无法保存。请更换用户名。",signInFirst:"请先登录账号。",serviceUnavailable:"服务暂时不可用，请稍后重试。"},
  en: {title:"Complete account setup",intro:"Choose a unique username. Your email is used for sign-in and is not shown on public posts.",username:"Username",save:"Save and continue",pending:"Working…",usernameFormat:"Username must be 3–24 English letters, numbers or underscores.",usernameUnavailable:"That username is taken or could not be saved. Choose another.",signInFirst:"Sign in to continue.",serviceUnavailable:"This service is temporarily unavailable. Try again later."},
  ms: {title:"Lengkapkan persediaan akaun",intro:"Pilih nama pengguna yang unik. E-mel digunakan untuk log masuk dan tidak dipaparkan pada hantaran awam.",username:"Nama pengguna",save:"Simpan dan teruskan",pending:"Sedang diproses…",usernameFormat:"Nama pengguna mesti 3–24 huruf Inggeris, nombor atau garis bawah.",usernameUnavailable:"Nama pengguna telah digunakan atau tidak dapat disimpan. Pilih yang lain.",signInFirst:"Log masuk untuk meneruskan.",serviceUnavailable:"Perkhidmatan sementara tidak tersedia. Cuba lagi kemudian."}
} as const;

export function ProfileSetupForm() {
  const {locale} = usePreferences();
  const t = labels[locale];
  const [state, action, pending] = useActionState(initializeProfileAction, {key:""});
  return <section className="auth-panel" aria-labelledby="profile-setup-title">
    <p className="eyebrow">MMWR · ACCOUNT</p><h1 id="profile-setup-title">{t.title}</h1><p className="auth-intro">{t.intro}</p>
    <form action={action} className="auth-form">
      <label>{t.username}<input name="username" autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" required/></label>
      <button className="button button-primary" disabled={pending}>{pending ? t.pending : t.save}</button>
      {state.key && <p role="alert" className="auth-message">{t[state.key as keyof typeof t] ?? t.serviceUnavailable}</p>}
    </form>
  </section>;
}
