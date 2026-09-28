"use client";

import {usePreferences} from "@/components/shell/PreferencesProvider";

const messages = {
  "zh-CN": {denied:"此账号没有后台权限。", readyTitle:"MMWR 后台安全入口", ready:"账号已通过后台二次验证；管理模块仍在开发中。当前没有生产内容或客户数据。", home:"返回首页"},
  en: {denied:"This account does not have staff access.", readyTitle:"MMWR staff area", ready:"Staff two-factor verification passed. The management features are still being built; no production posts or customer data are connected.", home:"Back to home"},
  ms: {denied:"Akaun ini tiada akses kakitangan.", readyTitle:"Ruang kakitangan MMWR", ready:"Pengesahan dua faktor kakitangan berjaya. Ciri pengurusan masih dibangunkan; tiada hantaran atau data pelanggan produksi disambungkan.", home:"Kembali ke laman utama"}
} as const;

export function StaffAreaStatus({denied = false}: {denied?: boolean}) {
  const {locale} = usePreferences();
  const t = messages[locale];
  return <div className="auth-page"><section className="auth-panel"><p className="eyebrow">MMWR · STAFF</p><h1>{denied ? t.denied : t.readyTitle}</h1><p className="auth-intro">{denied ? t.denied : t.ready}</p><a className="view-all" href="/">{t.home}<span aria-hidden="true">↗</span></a></section></div>;
}
