"use client";

import {usePreferences} from "@/components/shell/PreferencesProvider";

const label = {"zh-CN":"进入后台", en:"Open staff area", ms:"Buka ruang kakitangan"} as const;
export function StaffEntryLink() {
  const {locale} = usePreferences();
  return <div className="auth-links"><a href="/admin">{label[locale]}</a></div>;
}
