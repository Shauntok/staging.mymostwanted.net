"use client";

import {usePreferences} from "@/components/shell/PreferencesProvider";
import styles from "./StaffBackupRuns.module.css";

export type StaffBackupRun = {
  runId:string;
  triggerKind:"scheduled"|"owner_manual";
  status:"running"|"succeeded"|"failed";
  phase:"database_export"|"storage_backup"|"manifest_verification"|"complete"|"failed";
  integrityVerified:boolean;
  artifactCount:number;
  encryptedBytes:number;
  failureCode:"backup_failed"|null;
  startedAt:string;
  completedAt:string|null;
};

const copy={
  "zh-CN":{
    title:"备份运行记录",intro:"只显示经授权的运行状态与完整性标记。",unavailable:"备份状态暂时无法读取。请确认备份状态迁移已应用，并检查后台近期 TOTP。",empty:"还没有备份运行记录。没有记录不能证明存在可恢复的备份。",note:"完整性通过仅表示加密对象和校验和可读且匹配，不代表数据库与 Storage 来自同一个时间点。当前 Supabase CLI 的 Auth/Storage 覆盖尚未解决；全量备份会在覆盖完整前拒绝成功。数据库导出分多次读取；调度、R2 和隔离恢复演练仍需配置与验证。",scheduled:"自动任务",manual:"Owner 手动",running:"进行中",succeeded:"对象校验通过",failed:"失败",database_export:"数据库导出",storage_backup:"Storage 备份",manifest_verification:"清单校验",complete:"完成",failure:"备份未通过完整性校验。请按运行手册检查后再恢复。",verified:"对象完整性已验证",notVerified:"对象完整性未确认",files:"对象数",bytes:"加密大小",started:"开始",finished:"结束",
  },
  en:{
    title:"Backup runs",intro:"Authorized run status and integrity results only.",unavailable:"Backup status is temporarily unavailable. Confirm the backup-status migration and recent staff TOTP.",empty:"No backup runs are recorded. An empty history does not prove a recoverable backup exists.",note:"Integrity passing only means encrypted objects and checksums can be read and match; it does not mean database and Storage data came from one point in time. Supabase CLI Auth/Storage coverage is unresolved, so full-backup success is gated until coverage is complete. Database exports currently use multiple reads. Scheduling, R2 and an isolated restore drill still need configuration and verification.",scheduled:"Scheduled",manual:"Owner started",running:"Running",succeeded:"Object integrity verified",failed:"Failed",database_export:"Database export",storage_backup:"Storage backup",manifest_verification:"Manifest verification",complete:"Complete",failure:"Backup integrity was not confirmed. Follow the runbook before any restore.",verified:"Object integrity verified",notVerified:"Object integrity unconfirmed",files:"Objects",bytes:"Encrypted size",started:"Started",finished:"Finished",
  },
  ms:{
    title:"Rekod sandaran",intro:"Status operasi dan keputusan integriti yang dibenarkan sahaja.",unavailable:"Status sandaran tidak tersedia buat sementara. Sahkan migrasi status sandaran dan TOTP kakitangan terkini.",empty:"Tiada operasi sandaran direkodkan. Sejarah kosong tidak membuktikan sandaran boleh dipulihkan.",note:"Integriti lulus hanya bermaksud objek terenkripsi dan checksum boleh dibaca serta sepadan; ini tidak bermaksud data pangkalan data dan Storage berasal dari satu titik masa. Liputan Auth/Storage Supabase CLI belum diselesaikan, maka kejayaan sandaran penuh dikunci sehingga liputan lengkap. Eksport pangkalan data kini menggunakan beberapa bacaan. Penjadualan, R2 dan latihan pemulihan terpencil masih perlu dikonfigurasi dan disahkan.",scheduled:"Berjadual",manual:"Dimulakan Owner",running:"Sedang berjalan",succeeded:"Integriti objek disahkan",failed:"Gagal",database_export:"Eksport pangkalan data",storage_backup:"Sandaran Storage",manifest_verification:"Pengesahan manifest",complete:"Selesai",failure:"Integriti sandaran belum disahkan. Ikuti panduan operasi sebelum memulihkan data.",verified:"Integriti objek disahkan",notVerified:"Integriti objek belum disahkan",files:"Objek",bytes:"Saiz terenkripsi",started:"Mula",finished:"Selesai",
  },
} as const;

export function StaffBackupRuns({runs,state}:{runs:StaffBackupRun[];state:"ready"|"unavailable"}){
  const {locale}=usePreferences();
  const t=copy[locale];
  const numberLocale=locale==="zh-CN"?"zh-CN":locale==="ms"?"ms-MY":"en-MY";
  const statusLabel=(status:StaffBackupRun["status"])=>t[status];
  const phaseLabel=(phase:StaffBackupRun["phase"])=>t[phase];
  const formatTime=(value:string)=>new Intl.DateTimeFormat(numberLocale,{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
  const formatBytes=(bytes:number)=>{
    const units=["B","KB","MB","GB","TB","PB"];
    let size=bytes,unit=0;
    while(size>=1024&&unit<units.length-1){size/=1024;unit++;}
    return `${new Intl.NumberFormat(numberLocale,{maximumFractionDigits:unit===0?0:2}).format(size)} ${units[unit]}`;
  };

  return <section className={styles.section} aria-labelledby="staff-backup-runs-title">
    <header className={styles.heading}><div><h2 id="staff-backup-runs-title">{t.title}</h2><p>{t.intro}</p></div></header>
    {state!=="ready"?<p className={styles.state} role="status">{t.unavailable}</p>:runs.length===0?<p className={styles.empty} role="status">{t.empty}</p>:<ul className={styles.list}>
      {runs.map(run=><li className={styles.row} key={run.runId}>
        <div className={styles.run}>
          <code>{run.runId}</code>
          <div className={styles.meta}>
            <span>{run.triggerKind==="owner_manual"?t.manual:t.scheduled}</span>
            <span>{phaseLabel(run.phase)}</span>
            <span>{t.started}: {formatTime(run.startedAt)}</span>
            {run.completedAt&&<span>{t.finished}: {formatTime(run.completedAt)}</span>}
          </div>
        </div>
        <span className={`${styles.status} ${run.status==="succeeded"&&run.integrityVerified?styles.success:run.status==="failed"?styles.failed:styles.running}`}>
          {statusLabel(run.status)}
        </span>
        <div className={styles.counts}>
          <span>{run.integrityVerified?t.verified:t.notVerified}</span>
          <span>{t.files}: {new Intl.NumberFormat(numberLocale).format(run.artifactCount)}</span>
          <span>{t.bytes}: {formatBytes(run.encryptedBytes)}</span>
          {run.failureCode&&<span>{t.failure}</span>}
        </div>
      </li>)}
    </ul>}
    <p className={styles.note}>{t.note}</p>
  </section>;
}
