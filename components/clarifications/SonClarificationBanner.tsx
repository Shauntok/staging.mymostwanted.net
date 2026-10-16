"use client";
import Link from "@/components/shell/LocalizedLink";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {clarificationCopy} from "@/components/clarifications/copy";
import styles from "./SonClarificationBanner.module.css";

export function SonClarificationBanner({clarificationPostId}:{clarificationPostId:string}){
  const {locale}=usePreferences();const t=clarificationCopy[locale];
  return <aside className={styles.banner} aria-label={t.hasClarification}><span className={styles.icon} aria-hidden="true">i</span><p>{t.hasClarification}</p><Link href={`/clarifications/${clarificationPostId}`}>{t.clarificationBadge} →</Link></aside>;
}
