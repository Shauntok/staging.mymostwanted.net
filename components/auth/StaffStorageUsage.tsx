"use client";

import {usePreferences} from "@/components/shell/PreferencesProvider";
import styles from "./StaffStorageUsage.module.css";

export type StaffStorageUsageSummary = {evidenceObjectCount:number;evidenceTotalBytes:number;thumbnailObjectCount:number;thumbnailTotalBytes:number};

const copy={
  "zh-CN":{unavailable:"Storage 用量暂时无法读取。请检查迁移、后台权限和 Storage 元数据。",evidence:"私有证据隔离桶",thumbnails:"私有公开缩略图桶",count:"对象数",bytes:"登记文件大小",note:"仅汇总两个私有桶的对象元数据；不显示文件名称或路径，也不等同于供应商账单用量。容量预算和清理政策仍待确定。",empty:"目前没有已登记对象。"},
  en:{unavailable:"Storage usage is temporarily unavailable. Check the migration, staff access and Storage metadata.",evidence:"Private evidence quarantine",thumbnails:"Private public-thumbnail derivatives",count:"Objects",bytes:"Recorded file size",note:"This summarizes object metadata in two private buckets. It reveals no object names or paths and is not a billing measurement. Storage budget and cleanup policy remain to be decided.",empty:"There are no registered objects."},
  ms:{unavailable:"Penggunaan Storage tidak tersedia buat sementara. Semak migrasi, akses kakitangan dan metadata Storage.",evidence:"Kuarantin bukti peribadi",thumbnails:"Derivatif lakaran kecil awam peribadi",count:"Objek",bytes:"Saiz fail direkodkan",note:"Ringkasan metadata objek dalam dua bucket peribadi sahaja. Nama dan laluan objek tidak dipaparkan dan angka ini bukan ukuran bil penyedia. Bajet storan dan dasar pembersihan belum ditetapkan.",empty:"Tiada objek berdaftar."},
} as const;

export function StaffStorageUsage({summary,state}:{summary:StaffStorageUsageSummary|null;state:"ready"|"unavailable"}){
  const {locale}=usePreferences();
  const t=copy[locale];
  if(state!=="ready"||!summary)return <p className={styles.state} role="status">{t.unavailable}</p>;
  const numberLocale=locale==="zh-CN"?"zh-CN":locale==="ms"?"ms-MY":"en-MY";
  const formatBytes=(bytes:number)=>{
    const units=["B","KB","MB","GB","TB","PB"];
    let size=bytes;
    let unit=0;
    while(size>=1024&&unit<units.length-1){size/=1024;unit++;}
    return `${new Intl.NumberFormat(numberLocale,{maximumFractionDigits:unit===0?0:2}).format(size)} ${units[unit]}`;
  };
  const buckets=[
    {label:t.evidence,count:summary.evidenceObjectCount,bytes:summary.evidenceTotalBytes},
    {label:t.thumbnails,count:summary.thumbnailObjectCount,bytes:summary.thumbnailTotalBytes},
  ];
  return <div className={styles.wrap}>
    <div className={styles.buckets}>{buckets.map(bucket=><section className={styles.bucket} key={bucket.label}>
      <h3>{bucket.label}</h3>
      <dl className={styles.metrics}>
        <div><dt>{t.count}</dt><dd>{new Intl.NumberFormat(numberLocale).format(bucket.count)}</dd></div>
        <div><dt>{t.bytes}</dt><dd>{formatBytes(bucket.bytes)}</dd></div>
      </dl>
      {bucket.count===0&&<p className={styles.empty}>{t.empty}</p>}
    </section>)}</div>
    <p className={styles.note}>{t.note}</p>
  </div>;
}
