"use client";

import Link from "@/components/shell/LocalizedLink";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {PublicPostGrid} from "@/components/public-posts/PublicPostGrid";
import type {PublicSearchPost,PublicSimilarPost} from "@/lib/public-search";
import {SearchBox} from "@/components/search/SearchBox";
import styles from "./SearchExperience.module.css";

const copy={
  "zh-CN":{eyebrow:"MMWR · 搜索",title:"搜索公开内容",label:"搜索姓名、标题、地区、标签或关键词",placeholder:"输入姓名、标题、地区、标签或关键词…",submit:"搜索",idle:"请输入至少 2 个字符开始搜索。",unavailable:"公开搜索服务暂时不可用。",rateLimited:"搜索请求过于频繁，请稍后再试。",empty:"没有找到匹配的公开内容。",scope:"搜索已审核公开的名称、标题、摘要、地区和标签。只有已审核且关联当前公开内容的别名会用于匹配；别名文本和来源不会显示。相似姓名会分开列出，不会自动合并为同一对象。",searched:"搜索内容：",results:"搜索结果",similarTitle:"可能相似的名称",similarNote:"以下项目仅因名称相似而推荐，可能指向不同的人或公司；请逐条核实，不代表身份相同。",area:"地区",published:"公开于",reactions:"Reaction 数",previous:"上一页",next:"下一页",page:"第",of:"页",home:"返回首页",readUnavailable:"阅读全文",clarification:"澄清"},
  en:{eyebrow:"MMWR · SEARCH",title:"Search public content",label:"Search a name, title, area, tag, or keyword",placeholder:"Enter a name, title, area, tag, or keyword…",submit:"Search",idle:"Enter at least 2 characters to search.",unavailable:"The public search service is temporarily unavailable.",rateLimited:"Too many search requests. Please try again shortly.",empty:"No matching public posts were found.",scope:"Search covers reviewed public names, titles, excerpts, areas, and tags. An alias is used only after review and only while linked to a currently public post; its text and source are never shown. Similar names remain separate and are never merged automatically.",searched:"Search query:",results:"Search results",similarTitle:"Possibly similar names",similarNote:"These are suggested because of name similarity only. They may refer to different people or companies; review each entry and do not assume they are the same entity.",area:"Area",published:"Published",reactions:"Reactions",previous:"Previous",next:"Next",page:"Page",of:"",home:"Back to home",readUnavailable:"Read full post",clarification:"Clarification"},
  ms:{eyebrow:"MMWR · CARIAN",title:"Cari kandungan awam",label:"Cari nama, tajuk, kawasan, tag atau kata kunci",placeholder:"Masukkan nama, tajuk, kawasan, tag atau kata kunci…",submit:"Cari",idle:"Masukkan sekurang-kurangnya 2 aksara untuk mencari.",unavailable:"Perkhidmatan carian awam tidak tersedia buat sementara waktu.",rateLimited:"Terlalu banyak permintaan carian. Cuba lagi sebentar lagi.",empty:"Tiada hantaran awam yang sepadan.",scope:"Carian meliputi nama, tajuk, ringkasan, kawasan dan tag awam yang telah disemak. Nama lain hanya digunakan selepas disemak dan semasa dipautkan kepada hantaran yang masih awam; teks dan sumber nama lain tidak dipaparkan. Nama serupa kekal berasingan dan tidak digabungkan secara automatik.",searched:"Pertanyaan carian:",results:"Hasil carian",similarTitle:"Nama yang mungkin serupa",similarNote:"Cadangan ini berdasarkan persamaan nama sahaja dan mungkin merujuk kepada individu atau syarikat yang berbeza. Semak setiap entri dan jangan anggap semuanya entiti yang sama.",area:"Kawasan",published:"Diterbitkan",reactions:"Reaksi",previous:"Sebelumnya",next:"Seterusnya",page:"Halaman",of:"",home:"Kembali ke laman utama",readUnavailable:"Baca hantaran penuh",clarification:"Penjelasan"},
} as const;

export function SearchExperience({query,posts,similarPosts=[],status,page=1,hasNextPage=false}:{query:string;posts:PublicSearchPost[];similarPosts?:PublicSimilarPost[];status:"idle"|"ready"|"empty"|"unavailable"|"rate-limited";page?:number;hasNextPage?:boolean}){
  const {locale}=usePreferences();const t=copy[locale];
  return <div className={styles.page} lang={locale}>
    <div className={styles.panel}><p className={styles.eyebrow}>{t.eyebrow}</p><h1>{t.title}</h1>
      <SearchBox initialQuery={query}/>
      {query&&<p className={styles.query}>{t.searched} <bdi>{query}</bdi></p>}
      <p className={styles.scope}>{t.scope}</p>
      <section className={styles.results} aria-live="polite" aria-labelledby="search-results-title">
        <h2 id="search-results-title">{t.results}</h2>
        {status==="idle"?<p className={styles.message} role="status">{t.idle}</p>:status==="unavailable"?<p className={styles.message} role="status">{t.unavailable}</p>:status==="rate-limited"?<p className={styles.message} role="status">{t.rateLimited}</p>:status==="empty"?<p className={styles.message} role="status">{t.empty}</p>:<PublicPostGrid posts={posts} status="ready" page={page} hasNextPage={hasNextPage} basePath={`/search?q=${encodeURIComponent(query)}`} heading={t.results} hideHeader/>}
      </section>
      {similarPosts.length>0&&<section className={styles.similar} aria-labelledby="similar-results-title">
        <h2 id="similar-results-title">{t.similarTitle}</h2><p>{t.similarNote}</p>
        <ul>{similarPosts.map(post=><li key={post.post_id}><Link href={`/posts/${post.post_id}`}><span>{post.primary_name}</span><strong>{post.approved_title}</strong><small>{t.area} · {post.public_area_name}</small></Link></li>)}</ul>
      </section>}
      <Link className={styles.home} href="/">{t.home}<span aria-hidden="true">↗</span></Link>
    </div>
  </div>;
}
