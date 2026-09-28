"use client";

import Link from "next/link";
import { usePreferences } from "@/components/shell/PreferencesProvider";
import type { Locale } from "@/lib/i18n/catalog";
import styles from "./FeatureStatus.module.css";

export type FeatureId =
  | "latest"
  | "hot"
  | "tags"
  | "areas"
  | "search"
  | "submit"
  | "account"
  | "submissions"
  | "vip";

type FeatureText = { title: string; status: string; detail: string };
type StatusCopy = { eyebrow: string; home: string; features: Record<FeatureId, FeatureText> };

const statusCopy: Record<Locale, StatusCopy> = {
  "zh-CN": {
    eyebrow: "功能状态",
    home: "返回首页",
    features: {
      latest: { title: "最新发布", status: "最新发布功能尚未实现，也未接入内容服务。", detail: "这里目前没有真实的公开帖子数据。" },
      hot: { title: "热度排行", status: "热度排行功能尚未实现，也未接入内容服务。", detail: "这里目前没有真实的公开帖子或热度数据。" },
      tags: { title: "标签", status: "标签浏览功能尚未实现，也未接入内容服务。", detail: "这里目前没有真实的公开标签或帖子数据。" },
      areas: { title: "地区浏览", status: "地区浏览功能尚未实现，也未接入地区或内容服务。", detail: "这里目前没有真实的公开地区边界或帖子数据。" },
      search: { title: "搜索", status: "搜索功能尚未实现，也未接入内容服务。", detail: "这里目前没有真实的公开搜索结果或帖子数据。" },
      submit: { title: "发布投稿", status: "投稿功能尚未实现，也未接入账号或投稿服务。", detail: "目前无法登录、注册或提交投稿。请勿通过此页面发送真实资料。" },
      account: { title: "账户", status: "账户功能尚未实现，也未接入账号服务。", detail: "目前无法登录、注册或提交投稿。请勿通过此页面发送真实资料。" },
      submissions: { title: "我的投稿", status: "我的投稿功能尚未实现，也未接入账号或投稿服务。", detail: "目前无法登录、注册、提交投稿或查看投稿记录。请勿通过此页面发送真实资料。" },
      vip: { title: "VIP", status: "VIP 功能尚未实现，也未接入服务。", detail: "开放时间、价格和权益尚未确定。" },
    },
  },
  en: {
    eyebrow: "Feature status",
    home: "Back to home",
    features: {
      latest: { title: "Latest posts", status: "Latest posts are not implemented or connected to a content service yet.", detail: "There is no real public post data here yet." },
      hot: { title: "Hot Ranked", status: "Hot Ranked is not implemented or connected to a content service yet.", detail: "There is no real public post or ranking data here yet." },
      tags: { title: "Tags", status: "Tag browsing is not implemented or connected to a content service yet.", detail: "There is no real public tag or post data here yet." },
      areas: { title: "Browse areas", status: "Area browsing is not implemented or connected to a location or content service yet.", detail: "There are no real public area boundaries or posts here yet." },
      search: { title: "Search", status: "Search is not implemented or connected to a content service yet.", detail: "There are no real public search results or posts here yet." },
      submit: { title: "Submit a post", status: "Submission is not implemented or connected to an account or submission service yet.", detail: "Sign-in, registration and submission are unavailable. Do not send real information through this page." },
      account: { title: "Account", status: "Accounts are not implemented or connected to an account service yet.", detail: "Sign-in, registration and submission are unavailable. Do not send real information through this page." },
      submissions: { title: "My submissions", status: "My submissions is not implemented or connected to an account or submission service yet.", detail: "Sign-in, registration, submission and submission history are unavailable. Do not send real information through this page." },
      vip: { title: "VIP", status: "VIP is not implemented or connected to a service yet.", detail: "No launch timing, price or benefits have been confirmed." },
    },
  },
  ms: {
    eyebrow: "Status ciri",
    home: "Kembali ke laman utama",
    features: {
      latest: { title: "Hantaran terkini", status: "Ciri hantaran terkini belum dibangunkan atau disambungkan kepada perkhidmatan kandungan.", detail: "Belum ada data hantaran awam sebenar di sini." },
      hot: { title: "Hot Ranked", status: "Ciri Hot Ranked belum dibangunkan atau disambungkan kepada perkhidmatan kandungan.", detail: "Belum ada data hantaran atau kedudukan awam sebenar di sini." },
      tags: { title: "Tag", status: "Ciri melayari tag belum dibangunkan atau disambungkan kepada perkhidmatan kandungan.", detail: "Belum ada data tag atau hantaran awam sebenar di sini." },
      areas: { title: "Teroka kawasan", status: "Ciri melayari kawasan belum dibangunkan atau disambungkan kepada perkhidmatan lokasi atau kandungan.", detail: "Belum ada sempadan kawasan atau hantaran awam sebenar di sini." },
      search: { title: "Carian", status: "Ciri carian belum dibangunkan atau disambungkan kepada perkhidmatan kandungan.", detail: "Belum ada hasil carian atau hantaran awam sebenar di sini." },
      submit: { title: "Hantar hantaran", status: "Ciri penghantaran belum dibangunkan atau disambungkan kepada perkhidmatan akaun atau penghantaran.", detail: "Log masuk, pendaftaran dan penghantaran belum tersedia. Jangan hantar maklumat sebenar melalui halaman ini." },
      account: { title: "Akaun", status: "Ciri akaun belum dibangunkan atau disambungkan kepada perkhidmatan akaun.", detail: "Log masuk, pendaftaran dan penghantaran belum tersedia. Jangan hantar maklumat sebenar melalui halaman ini." },
      submissions: { title: "Hantaran saya", status: "Ciri hantaran saya belum dibangunkan atau disambungkan kepada perkhidmatan akaun atau penghantaran.", detail: "Log masuk, pendaftaran, penghantaran dan sejarah hantaran belum tersedia. Jangan hantar maklumat sebenar melalui halaman ini." },
      vip: { title: "VIP", status: "Ciri VIP belum dibangunkan atau disambungkan kepada perkhidmatan.", detail: "Masa pelancaran, harga dan manfaat belum disahkan." },
    },
  },
};

export function FeatureStatus({ feature }: { feature: FeatureId }) {
  const { locale } = usePreferences();
  const copy = statusCopy[locale];
  const text = copy.features[feature];

  return (
    <article className={styles.page} lang={locale}>
      <div className={styles.panel}>
        <p className={styles.eyebrow}>{copy.eyebrow} / MMWR</p>
        <h1>{text.title}</h1>
        <p className={styles.status}>{text.status}</p>
        <p className={styles.detail}>{text.detail}</p>
        <Link className={styles.home} href="/">{copy.home} <span aria-hidden="true">↗</span></Link>
      </div>
    </article>
  );
}
