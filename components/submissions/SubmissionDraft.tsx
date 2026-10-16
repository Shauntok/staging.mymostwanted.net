"use client";

import {useState} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {browsableRegions} from "@/lib/maps/malaysia-regions";
import {stateDisplayName} from "@/lib/maps/state-labels";
import {isAllowedSubmissionSocialUrl} from "@/lib/submissions/social-links.mjs";
import styles from "./SubmissionDraft.module.css";

type SocialPlatform = "facebook" | "instagram" | "tiktok" | "telegram";
type SubmissionFields = {subject: string; title: string; region: string; narrative: string; additionalInformation: string; social: Record<SocialPlatform, string>};
const socialPlatforms: SocialPlatform[] = ["facebook", "instagram", "tiktok", "telegram"];
const declarationVersion = "MMWR-SUBMITTER-DECLARATION-v1";
// Singapore is a standalone map/browse region, not a Malaysian state or
// federal territory. Keep it out of this non-submittable Malaysia intake draft.
const submissionRegions = browsableRegions.filter((region) => region !== "Singapore");

function blankFields(): SubmissionFields {
  return {subject: "", title: "", region: "", narrative: "", additionalInformation: "", social: {facebook: "", instagram: "", tiktok: "", telegram: ""}};
}

const copy = {
  "zh-CN": {
    title: "投稿表单预览", eyebrow: "MMWR · 本地界面草稿", intro: "单页分区填写、核对和预览投稿内容。输入仅暂存在当前页面内存，不会保存或上传；刷新页面会清除输入。没有自动保存、上传或提交功能。",
    noticeTitle: "这是不可提交的界面草稿", notice: "请勿输入真实人物资料、指控或证据。下方所有内容仅用于检查表单布局，不会传送到服务器。",
    section1: "对象资料", section1Help: "请区分真实姓名、企业名称与网络别名；多篇投稿不会自动合并。", subject: "对象名称", subjectPlaceholder: "测试用名称", required: "必填", titleField: "投稿标题", optional: "选填", titlePlaceholder: "没有标题时，审核时可使用对象名称",
    section2: "事件与地区", section2Help: "请选择马来西亚州属或联邦直辖区；请仅填写与事件有关、可核对的事实。", region: "马来西亚州属 / 联邦直辖区", chooseRegion: "选择州属或联邦直辖区", narrative: "事件经过与资料", narrativePlaceholder: "描述你亲历或能提供资料支持的事情。请避免无关个人资料、住址、身份证资料及未成年人的身份信息。", additional: "补充说明", additionalPlaceholder: "其他有助于审核的背景（选填）",
    section3: "社交资料与证据", section3Help: "社交链接只接受 HTTPS 白名单域名；链接不会在此页面打开。", social: "公开社交资料链接", socialHint: "请勿填写密码、验证码或私人账号链接。", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", telegram: "Telegram", invalidUrl: "只接受该平台的 HTTPS 白名单网址。", evidence: "图片证据", evidenceWait: "文件选择和上传目前关闭。正式投稿开放后，缺少已扫描通过的图片只会显示一般风险提示，不会自动拦截；上传功能仍须待文件验证、病毒扫描与隔离访问完成验证后才开放。",
    section4: "最终核对与声明", section4Help: "正式开放后，提交前会显示最终预览并记录声明版本。", previewButton: "查看最终预览", closePreview: "关闭预览", previewTitle: "投稿预览", previewSubject: "对象名称", previewTitleField: "标题", previewRegion: "地区", previewNarrative: "事件资料", previewAdditional: "补充说明", previewSocial: "社交链接", previewEvidence: "图片证据", evidenceNotAttached: "未附加；上传功能关闭", none: "未填写", consent: "我确认内容基于我所知、亲历或能够提供的资料；我没有故意加入无关的个人资料，也理解提交不代表内容一定公开。", declarationVersion: `声明版本：${declarationVersion}`, cannotSubmit: "提交功能尚未开放", previewFootnote: "此预览只存在于当前页面内存。本页面不会保存草稿或上传内容；刷新会清除输入。",
  },
  en: {
    title: "Submission form preview", eyebrow: "MMWR · local UI draft", intro: "A single-page, sectioned form for entering, checking and previewing a submission. Values stay only in this page's memory and are not saved or uploaded; refreshing clears them. Autosave, uploads and submission are unavailable.",
    noticeTitle: "Non-submittable UI draft", notice: "Do not enter real-person details, allegations or evidence. The fields below are only for reviewing the form layout and are never sent to a server.",
    section1: "Subject details", section1Help: "Distinguish a person's name, business name and online alias. Separate submissions are never merged automatically.", subject: "Subject name", subjectPlaceholder: "Example name for preview", required: "Required", titleField: "Submission title", optional: "Optional", titlePlaceholder: "If blank, reviewers may use the subject name",
    section2: "Incident and location", section2Help: "Choose a Malaysian state or federal territory. Include only facts related to the incident that can be reviewed.", region: "Malaysian state / federal territory", chooseRegion: "Choose a state or federal territory", narrative: "Incident details", narrativePlaceholder: "Describe what you experienced or can support with materials. Avoid unrelated personal details, addresses, identity numbers and identifying details about minors.", additional: "Additional information", additionalPlaceholder: "Other context that may help review (optional)",
    section3: "Social links and evidence", section3Help: "Social links accept HTTPS URLs from the allowlist only. Links will not open from this page.", social: "Public social profile links", socialHint: "Never enter passwords, verification codes or private account links.", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", telegram: "Telegram", invalidUrl: "Enter an HTTPS URL on this platform's allowlist.", evidence: "Image evidence", evidenceWait: "File selection and uploads are off. After submissions open, having no scan-cleared image will only add an ordinary review signal; it will not block a submission. Uploads stay closed until file validation, malware scanning and quarantined access are verified.",
    section4: "Final check and declaration", section4Help: "When submissions open, you will see a final preview and the accepted declaration version will be recorded.", previewButton: "Review final preview", closePreview: "Close preview", previewTitle: "Submission preview", previewSubject: "Subject name", previewTitleField: "Title", previewRegion: "Region", previewNarrative: "Incident details", previewAdditional: "Additional information", previewSocial: "Social links", previewEvidence: "Image evidence", evidenceNotAttached: "Not attached; uploads are off", none: "Not provided", consent: "I confirm this is based on what I know, experienced or can support with materials; I have not deliberately included unrelated personal information, and I understand that submitting does not guarantee publication.", declarationVersion: `Declaration version: ${declarationVersion}`, cannotSubmit: "Submission is not available", previewFootnote: "This preview exists only in this page's memory. No draft is saved or uploaded; refreshing clears the values.",
  },
  ms: {
    title: "Pratonton borang hantaran", eyebrow: "MMWR · draf UI setempat", intro: "Borang satu halaman berbahagian untuk mengisi, menyemak dan melihat pratonton hantaran. Nilai hanya berada dalam memori halaman ini, tidak disimpan atau dimuat naik; muat semula halaman akan memadamkannya. Simpanan automatik, muat naik dan penghantaran belum tersedia.",
    noticeTitle: "Draf UI yang tidak boleh dihantar", notice: "Jangan masukkan butiran individu sebenar, dakwaan atau bukti. Medan di bawah hanya untuk menyemak susun atur borang dan tidak dihantar ke pelayan.",
    section1: "Maklumat subjek", section1Help: "Bezakan nama individu, nama perniagaan dan alias dalam talian. Hantaran berasingan tidak akan digabungkan secara automatik.", subject: "Nama subjek", subjectPlaceholder: "Nama contoh untuk pratonton", required: "Wajib", titleField: "Tajuk hantaran", optional: "Pilihan", titlePlaceholder: "Jika kosong, penyemak boleh menggunakan nama subjek",
    section2: "Kejadian dan kawasan", section2Help: "Pilih negeri atau wilayah persekutuan Malaysia. Sertakan fakta berkaitan kejadian yang boleh disemak sahaja.", region: "Negeri / wilayah persekutuan Malaysia", chooseRegion: "Pilih negeri atau wilayah persekutuan", narrative: "Butiran kejadian", narrativePlaceholder: "Huraikan perkara yang anda alami atau boleh disokong dengan bahan. Elakkan butiran peribadi yang tidak berkaitan, alamat, nombor pengenalan dan maklumat yang mengenal pasti kanak-kanak.", additional: "Maklumat tambahan", additionalPlaceholder: "Konteks lain yang boleh membantu semakan (pilihan)",
    section3: "Pautan sosial dan bukti", section3Help: "Pautan sosial hanya menerima URL HTTPS daripada senarai dibenarkan. Pautan tidak akan dibuka di halaman ini.", social: "Pautan profil sosial awam", socialHint: "Jangan masukkan kata laluan, kod pengesahan atau pautan akaun peribadi.", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", telegram: "Telegram", invalidUrl: "Masukkan URL HTTPS dalam senarai dibenarkan platform ini.", evidence: "Bukti imej", evidenceWait: "Pemilihan fail dan muat naik dimatikan. Selepas hantaran dibuka, ketiadaan imej yang lulus imbasan hanya menghasilkan isyarat semakan biasa dan tidak menyekat hantaran. Muat naik kekal ditutup sehingga pengesahan fail, imbasan perisian hasad dan akses kuarantin disahkan.",
    section4: "Semakan akhir dan pengakuan", section4Help: "Apabila hantaran dibuka, pratonton akhir akan dipaparkan dan versi pengakuan yang diterima akan direkodkan.", previewButton: "Semak pratonton akhir", closePreview: "Tutup pratonton", previewTitle: "Pratonton hantaran", previewSubject: "Nama subjek", previewTitleField: "Tajuk", previewRegion: "Kawasan", previewNarrative: "Butiran kejadian", previewAdditional: "Maklumat tambahan", previewSocial: "Pautan sosial", previewEvidence: "Bukti imej", evidenceNotAttached: "Tidak dilampirkan; muat naik dimatikan", none: "Tidak diberikan", consent: "Saya mengesahkan bahawa kandungan ini berdasarkan perkara yang saya ketahui, alami atau boleh disokong dengan bahan; saya tidak sengaja memasukkan maklumat peribadi yang tidak berkaitan dan memahami bahawa hantaran tidak menjamin penerbitan.", declarationVersion: `Versi pengakuan: ${declarationVersion}`, cannotSubmit: "Penghantaran belum tersedia", previewFootnote: "Pratonton ini hanya wujud dalam memori halaman ini. Draf tidak disimpan atau dimuat naik; muat semula akan memadam nilai.",
  },
} as const;

export function SubmissionDraft() {
  const {locale} = usePreferences();
  const t = copy[locale];
  const [fields, setFields] = useState<SubmissionFields>(blankFields);
  const [declarationChecked, setDeclarationChecked] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  function setField<K extends Exclude<keyof SubmissionFields, "social">>(key: K, next: SubmissionFields[K]) {
    setFields((current) => ({...current, [key]: next}));
  }

  function setSocial(platform: SocialPlatform, url: string) {
    setFields((current) => ({...current, social: {...current.social, [platform]: url}}));
  }

  const regionName = fields.region ? stateDisplayName(locale, fields.region) : t.none;

  return <div className={styles.page} lang={locale}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>{t.eyebrow}</p>
      <h1>{t.title}</h1>
      <p className={styles.intro}>{t.intro}</p>
      <aside className={styles.prototypeNotice} role="note"><strong>{t.noticeTitle}</strong>{t.notice}</aside>
    </header>

    <div className={styles.sections}>
      <section className={styles.section} aria-labelledby="submission-subject-heading">
        <div className={styles.sectionHeading}><span className={styles.step} aria-hidden="true">1</span><div><h2 id="submission-subject-heading">{t.section1}</h2><p>{t.section1Help}</p></div></div>
        <div className={styles.fields}>
          <label className={`${styles.field} ${styles.full}`}><span className={styles.label}>{t.subject} <span className={styles.optional}>· {t.required}</span></span><input className={styles.input} type="text" autoComplete="off" required maxLength={200} placeholder={t.subjectPlaceholder} value={fields.subject} onChange={(event) => setField("subject", event.target.value)} /></label>
          <label className={`${styles.field} ${styles.full}`}><span className={styles.label}>{t.titleField} <span className={styles.optional}>· {t.optional}</span></span><input className={styles.input} type="text" autoComplete="off" maxLength={200} placeholder={t.titlePlaceholder} value={fields.title} onChange={(event) => setField("title", event.target.value)} /></label>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="submission-incident-heading">
        <div className={styles.sectionHeading}><span className={styles.step} aria-hidden="true">2</span><div><h2 id="submission-incident-heading">{t.section2}</h2><p>{t.section2Help}</p></div></div>
        <div className={styles.fields}>
          <label className={`${styles.field} ${styles.full}`}><span className={styles.label}>{t.region} <span className={styles.optional}>· {t.required}</span></span><select className={styles.select} required value={fields.region} onChange={(event) => setField("region", event.target.value)}><option value="">{t.chooseRegion}</option>{submissionRegions.map((region) => <option value={region} key={region}>{stateDisplayName(locale, region)}</option>)}</select></label>
          <label className={`${styles.field} ${styles.full}`}><span className={styles.label}>{t.narrative} <span className={styles.optional}>· {t.required}</span></span><textarea className={styles.textarea} required autoComplete="off" placeholder={t.narrativePlaceholder} value={fields.narrative} onChange={(event) => setField("narrative", event.target.value)} /></label>
          <label className={`${styles.field} ${styles.full}`}><span className={styles.label}>{t.additional} <span className={styles.optional}>· {t.optional}</span></span><textarea className={styles.textarea} autoComplete="off" maxLength={4000} placeholder={t.additionalPlaceholder} value={fields.additionalInformation} onChange={(event) => setField("additionalInformation", event.target.value)} /></label>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="submission-evidence-heading">
        <div className={styles.sectionHeading}><span className={styles.step} aria-hidden="true">3</span><div><h2 id="submission-evidence-heading">{t.section3}</h2><p>{t.section3Help}</p></div></div>
        <div className={styles.fields}>
          <div className={`${styles.field} ${styles.full}`}><span className={styles.label}>{t.social} <span className={styles.optional}>· {t.optional}</span></span><p className={styles.help}>{t.socialHint}</p><div className={styles.socialList}>{socialPlatforms.map((platform) => {
            const url = fields.social[platform];
            const allowed = url === "" || isAllowedSubmissionSocialUrl(platform, url);
            return <label className={styles.socialRow} key={platform}><span className={styles.socialName}>{t[platform]}</span><input className={styles.input} type="url" inputMode="url" autoComplete="off" maxLength={2048} aria-invalid={!allowed} aria-describedby={!allowed ? `social-${platform}-error` : undefined} placeholder="https://" value={url} onChange={(event) => setSocial(platform, event.target.value)} />{!allowed && <span id={`social-${platform}-error`} className={`${styles.help} ${styles.urlError}`}>{t.invalidUrl}</span>}</label>;
          })}</div></div>
          <div className={`${styles.field} ${styles.full}`}><span className={styles.label}>{t.evidence} <span className={styles.optional}>· {t.optional}</span></span><div className={styles.evidenceBox}><span className={styles.evidenceIcon} aria-hidden="true">▧</span><div><strong>{t.evidence}</strong><p>{t.evidenceWait}</p></div></div></div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="submission-final-heading">
        <div className={styles.sectionHeading}><span className={styles.step} aria-hidden="true">4</span><div><h2 id="submission-final-heading">{t.section4}</h2><p>{t.section4Help}</p></div></div>
        <div className={styles.finalCheck}>
          <label className={styles.declaration}><input type="checkbox" checked={declarationChecked} onChange={(event) => setDeclarationChecked(event.target.checked)} /><span>{t.consent}<br /><span className={styles.declarationVersion}>{t.declarationVersion}</span></span></label>
          <div className={styles.actions}><button className={styles.primaryButton} type="button" onClick={() => setShowPreview((current) => !current)} aria-expanded={showPreview}>{showPreview ? t.closePreview : t.previewButton}</button><button className={styles.disabledButton} type="button" disabled aria-describedby="submission-disabled-explanation">{t.cannotSubmit}</button><span id="submission-disabled-explanation" className={styles.help}>{t.cannotSubmit}</span></div>
          {showPreview && <div id="submission-preview" className={styles.preview} aria-live="polite"><h3>{t.previewTitle}</h3><dl>
            <dt>{t.previewSubject}</dt><dd>{fields.subject || t.none}</dd>
            <dt>{t.previewTitleField}</dt><dd>{fields.title || t.none}</dd>
            <dt>{t.previewRegion}</dt><dd>{regionName}</dd>
            <dt>{t.previewNarrative}</dt><dd>{fields.narrative || t.none}</dd>
            <dt>{t.previewAdditional}</dt><dd>{fields.additionalInformation || t.none}</dd>
            <dt>{t.previewSocial}</dt><dd>{socialPlatforms.filter((platform) => fields.social[platform].trim()).map((platform) => `${t[platform]}: ${fields.social[platform]}`).join("\n") || t.none}</dd>
            <dt>{t.previewEvidence}</dt><dd>{t.evidenceNotAttached}</dd>
            <dt>{t.declarationVersion}</dt><dd>{declarationChecked ? t.consent : t.none}</dd>
          </dl><p className={styles.previewNotice}>{t.previewFootnote}</p></div>}
        </div>
      </section>
    </div>
  </div>;
}
