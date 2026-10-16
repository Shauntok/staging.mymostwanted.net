"use client";

import Link from "@/components/shell/LocalizedLink";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import type {PublicTagSpotlightItem} from "@/lib/public-posts";
import styles from "./HomeTagSpotlight.module.css";

const copy={
  "zh-CN":{empty:"标签会在相关内容审核并公开后出现。",unavailable:"公开标签暂时无法加载，请稍后再试。",posts:"篇公开内容"},
  en:{empty:"Tags appear after related posts are reviewed and published.",unavailable:"Public tags are temporarily unavailable. Please try again later.",posts:"public posts"},
  ms:{empty:"Tag akan muncul selepas hantaran berkaitan disemak dan diterbitkan.",unavailable:"Tag awam tidak tersedia buat sementara waktu. Cuba lagi nanti.",posts:"hantaran awam"},
} as const;

export function HomeTagSpotlight({tags,status}:{tags:PublicTagSpotlightItem[];status:"ready"|"empty"|"unavailable"}){
  const {locale}=usePreferences();
  const text=copy[locale];
  if(status!=="ready")return <p className={styles.message} role="status">{status==="empty"?text.empty:text.unavailable}</p>;
  return <ol className={styles.tags}>
    {tags.map((tag,index)=><li key={tag.tag_id}><Link href={`/tags/${tag.tag_id}`}><span className={styles.rank}>#{String(index+1).padStart(2,"0")}</span><span className={styles.label}>{tag.tag_label}</span><span className={styles.count}><b>{new Intl.NumberFormat(locale==="zh-CN"?"zh-CN":locale==="ms"?"ms-MY":"en-MY").format(tag.public_post_count)}</b> {text.posts}</span><span className={styles.arrow} aria-hidden="true">↗</span></Link></li>)}
  </ol>;
}
