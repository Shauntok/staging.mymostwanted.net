"use client";

import {usePreferences} from "@/components/shell/PreferencesProvider";
import styles from "./StaffRecentOperations.module.css";

export type StaffRecentOperation = {
  occurred_at: string;
  event_type: string;
  action: string;
  actor_username: string | null;
};

const copy = {
  "zh-CN": {
    empty: "暂无近期操作记录。",
    unavailable: "操作记录暂时无法读取，请检查迁移和后台权限。",
    actor: "操作人",
    removed: "账号已删除",
    post_moderated: "内容状态",
    post_revised: "修订公开内容",
    report_reviewed: "更新举报处理状态",
    submission_reviewed: "更新投稿审核状态",
    account_sanctioned: "账号处罚",
    notification_updated: "更新站内通知",
    evidence_reviewed: "查看内部证据",
    role_updated: "后台角色变更",
    owner_ip_block_updated: "IP 封锁变更",
    evidence_visibility_updated: "证据可见性变更",
    risk_rules_updated: "投稿风险规则变更",
    homepage_tags_updated: "首页标签排序变更",
    publish: "发布", hide: "隐藏", restore: "恢复", remove: "移除", revised: "已修订",
    status_changed: "状态已更新", warning: "警告", submission_suspension: "暂停投稿",
    account_suspension: "暂停账号", permanent_ban: "永久封禁", lift: "解除处罚",
    read: "已读", in_progress: "处理中", resolved: "已处理", viewed: "已查看",
    granted: "已授权", revoked: "已撤销", first_owner_bootstrap: "初始化 Owner",
    created: "已创建", lifted: "已解除", expired: "已到期",
    internal_only: "仅后台可见", public_thumbnail: "准备公开",
    updated: "已更新",
  },
  en: {
    empty: "There are no recent operations.",
    unavailable: "Recent operations are temporarily unavailable. Check the migration and staff access.",
    actor: "By",
    removed: "Deleted account",
    post_moderated: "Content status",
    post_revised: "Public content revised",
    report_reviewed: "Report status updated",
    submission_reviewed: "Submission status updated",
    account_sanctioned: "Account sanction",
    notification_updated: "Staff notification updated",
    evidence_reviewed: "Internal evidence viewed",
    role_updated: "Staff role changed",
    owner_ip_block_updated: "IP block changed",
    evidence_visibility_updated: "Evidence visibility changed",
    risk_rules_updated: "Submission risk rule changed",
    homepage_tags_updated: "Homepage tag order changed",
    publish: "Published", hide: "Hidden", restore: "Restored", remove: "Removed", revised: "Revised",
    status_changed: "Status updated", warning: "Warning", submission_suspension: "Submission suspended",
    account_suspension: "Account suspended", permanent_ban: "Permanently banned", lift: "Sanction lifted",
    read: "Read", in_progress: "In progress", resolved: "Resolved", viewed: "Viewed",
    granted: "Granted", revoked: "Revoked", first_owner_bootstrap: "Initial Owner setup",
    created: "Created", lifted: "Lifted", expired: "Expired",
    internal_only: "Staff only", public_thumbnail: "Prepared for publication",
    updated: "Updated",
  },
  ms: {
    empty: "Tiada operasi terkini.",
    unavailable: "Operasi terkini tidak tersedia buat sementara. Semak migrasi dan akses kakitangan.",
    actor: "Oleh",
    removed: "Akaun dipadam",
    post_moderated: "Status kandungan",
    post_revised: "Kandungan awam disemak",
    report_reviewed: "Status laporan dikemas kini",
    submission_reviewed: "Status penghantaran dikemas kini",
    account_sanctioned: "Sekatan akaun",
    notification_updated: "Pemberitahuan kakitangan dikemas kini",
    evidence_reviewed: "Bukti dalaman dilihat",
    role_updated: "Peranan kakitangan diubah",
    owner_ip_block_updated: "Sekatan IP diubah",
    evidence_visibility_updated: "Keterlihatan bukti diubah",
    risk_rules_updated: "Peraturan risiko penghantaran diubah",
    homepage_tags_updated: "Susunan tag halaman utama diubah",
    publish: "Diterbitkan", hide: "Disembunyikan", restore: "Dipulihkan", remove: "Dikeluarkan", revised: "Disemak",
    status_changed: "Status dikemas kini", warning: "Amaran", submission_suspension: "Penghantaran digantung",
    account_suspension: "Akaun digantung", permanent_ban: "Disekat kekal", lift: "Sekatan ditarik balik",
    read: "Dibaca", in_progress: "Sedang diproses", resolved: "Selesai", viewed: "Dilihat",
    granted: "Diberikan", revoked: "Dibatalkan", first_owner_bootstrap: "Persediaan Owner awal",
    created: "Dicipta", lifted: "Ditarik balik", expired: "Tamat tempoh",
    internal_only: "Kakitangan sahaja", public_thumbnail: "Disediakan untuk penerbitan",
    updated: "Dikemas kini",
  },
} as const;

type Copy = typeof copy[keyof typeof copy];

export function StaffRecentOperations({rows,state}:{rows:StaffRecentOperation[];state:"ready"|"unavailable"}) {
  const {locale}=usePreferences();
  const t:Copy=copy[locale];
  const eventLabel=(eventType:string)=>t[eventType as keyof Copy]??eventType;
  const actionLabel=(action:string)=>t[action as keyof Copy]??action;
  const dateLocale=locale==="zh-CN"?"zh-CN":locale==="ms"?"ms-MY":"en-MY";

  if(state==="unavailable")return <p className={styles.state} role="status">{t.unavailable}</p>;
  if(rows.length===0)return <p className={styles.state}>{t.empty}</p>;

  return <ol className={styles.list}>
    {rows.map((row,index)=>{
      const timestamp=Date.parse(row.occurred_at);
      return <li key={`${row.event_type}-${row.occurred_at}-${index}`}>
        <div className={styles.event}><strong>{eventLabel(row.event_type)}</strong><span>{actionLabel(row.action)}</span></div>
        <div className={styles.meta}>
          <span>{t.actor}: {row.actor_username||t.removed}</span>
          <time dateTime={row.occurred_at}>{Number.isFinite(timestamp)?new Intl.DateTimeFormat(dateLocale,{dateStyle:"medium",timeStyle:"short"}).format(timestamp):"—"}</time>
        </div>
      </li>;
    })}
  </ol>;
}
