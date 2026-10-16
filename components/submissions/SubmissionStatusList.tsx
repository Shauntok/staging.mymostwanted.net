"use client";

import Link from "@/components/shell/LocalizedLink";
import {usePreferences} from "@/components/shell/PreferencesProvider";

export type SubmissionStatusRow = {
  submission_id: string;
  status: string;
  safe_reviewer_response: string | null;
  submitted_at: string;
  updated_at: string;
};

const copy = {
  "zh-CN": {
    title:"我的投稿", intro:"仅显示当前账号的投稿状态与审核回复。", empty:"你还没有投稿记录。", unavailable:"暂时无法读取投稿状态，请稍后再试。", reference:"记录编号", submitted:"提交时间", updated:"最近更新", reviewer:"审核回复", states:{received:"已提交，等待审核", reviewing:"审核中", needs_more_information:"需要补充资料", rejected:"未通过", approved:"已批准", published:"已发布", closed:"已关闭"}, home:"返回首页"
  },
  en: {
    title:"My submissions", intro:"Only submission status and safe review replies for your account are shown here.", empty:"You have no submission history yet.", unavailable:"Submission status is temporarily unavailable. Try again later.", reference:"Record", submitted:"Submitted", updated:"Last updated", reviewer:"Review reply", states:{received:"Received", reviewing:"Under review", needs_more_information:"More information requested", rejected:"Not approved", approved:"Approved", published:"Published", closed:"Closed"}, home:"Back to home"
  },
  ms: {
    title:"Hantaran saya", intro:"Halaman ini hanya menunjukkan status dan balasan semakan yang selamat untuk akaun anda.", empty:"Anda belum mempunyai rekod hantaran.", unavailable:"Status hantaran tidak tersedia buat sementara waktu. Cuba lagi kemudian.", reference:"Rekod", submitted:"Dihantar", updated:"Kemas kini terakhir", reviewer:"Balasan semakan", states:{received:"Diterima", reviewing:"Dalam semakan", needs_more_information:"Maklumat tambahan diperlukan", rejected:"Tidak diluluskan", approved:"Diluluskan", published:"Diterbitkan", closed:"Ditutup"}, home:"Kembali ke laman utama"
  }
} as const;

export function SubmissionStatusList({rows, unavailable = false}:{rows:SubmissionStatusRow[];unavailable?:boolean}) {
  const {locale} = usePreferences();
  const t = copy[locale];
  const dateLocale = locale === "zh-CN" ? "zh-CN" : locale === "ms" ? "ms-MY" : "en-MY";
  return <article className="submission-page" lang={locale}>
    <section className="submission-panel">
      <p className="eyebrow">MMWR · ACCOUNT</p><h1>{t.title}</h1><p className="submission-intro">{t.intro}</p>
      {unavailable ? <p className="auth-message" role="alert">{t.unavailable}</p> : rows.length === 0 ? <p className="submission-empty">{t.empty}</p> : <ol className="submission-list">{rows.map((row) => {
        const status = t.states[row.status as keyof typeof t.states] ?? row.status;
        return <li className="submission-record" key={row.submission_id}>
          <div className="submission-record-heading"><span>{t.reference} · {row.submission_id.slice(0,8).toUpperCase()}</span><strong>{status}</strong></div>
          <div className="submission-record-dates"><span>{t.submitted}: <time dateTime={row.submitted_at}>{new Intl.DateTimeFormat(dateLocale,{dateStyle:"medium"}).format(new Date(row.submitted_at))}</time></span><span>{t.updated}: <time dateTime={row.updated_at}>{new Intl.DateTimeFormat(dateLocale,{dateStyle:"medium"}).format(new Date(row.updated_at))}</time></span></div>
          {row.safe_reviewer_response && <div className="submission-review-reply"><strong>{t.reviewer}</strong><p>{row.safe_reviewer_response}</p></div>}
        </li>;
      })}</ol>}
      <Link className="view-all submission-home" href="/">{t.home}<span aria-hidden="true">↗</span></Link>
    </section>
  </article>;
}
