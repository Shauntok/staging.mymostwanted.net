"use client";

import Link from "@/components/shell/LocalizedLink";
import Image from "next/image";
import {PublicPostGrid} from "@/components/public-posts/PublicPostGrid";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {MalaysiaMap} from "@/components/home/MalaysiaMap";
import {copy as siteCopy} from "@/lib/i18n/catalog";
import type {PublicChildArea,PublicPost,PublicRegionPostCount} from "@/lib/public-posts";
import {stateDisplayName} from "@/lib/maps/state-labels";
import {regionFlagAssets} from "@/lib/maps/region-flags";
import {SelectedAreaMap} from "./SelectedAreaMap";
import {areaCountAccessibleLabel} from "./area-count-accessible-label.mjs";
import styles from "./AreaBrowsePage.module.css";

const copy={
  "zh-CN":{eyebrow:"地区浏览",title:"州属 + District 地区浏览",subtitle:"按州属查看地区帖子，再进入 District 浏览帖子。",choose:"选择地区",selected:"所选地区",districts:"District 与帖子",noDistricts:"此地区没有可显示的 District；仍可在下方浏览该地区公开帖子。",noSingaporeDistricts:"新加坡独立于马来西亚 District 边界数据；仍可在下方浏览新加坡公开帖子。",districtsUnavailable:"District 目录暂时无法载入。",posts:"最新公开帖子",recentDistrictPosts:"District 最新公开帖子",empty:"此地区目前没有已审核公开的帖子。",unavailable:"地区帖子服务暂时无法连接。请稍后再试。",countsEmpty:"地区帖子数量尚未配置。",countAccessible:"篇公开帖子",countUnavailable:"数量暂不可用",all:"查看全部地区",home:"返回首页",count:"篇",select:"从左侧选择州属，查看地区轮廓和公开帖子。",mapPending:"州界仅供示意；District 边线取自 geoBoundaries 提供的 159 条边界。布城并入吉隆坡显示；ADM2 数据没有独立布城 District 边界，原有州界轮廓已并入吉隆坡地图。",mapSingaporeNotice:"新加坡地图独立显示；马来西亚 District 数据不适用于此地区。",details:"点击地区查看该地区的帖子",mapCredits:"地图边界资料与署名",mapCreditsBody:"District 边界来自 geoBoundaries 的 2020 ADM2 数据及其来源目录 citypopulation.de，按 CC BY 3.0 署名；固定文件实际含 159 条，没有独立的布城 District 边界；原有州界布城轮廓仍保留在吉隆坡组合地图中。Ledang 是 Tangkak 的旧名。",flagCredits:"旗帜素材与署名",flagCreditsBody:"州旗 SVG 来源于 Malaysia State Flag Icon CSS 项目；Johor、Kelantan、Sarawak、Selangor 和 Terengganu 图像标注为 CC BY-SA 3.0，作者与其他旗帜的来源/许可见项目 Credits。新加坡国旗图像来自 flag-icons（MIT）。"},
  en:{eyebrow:"BROWSE BY AREA",title:"Browse states + Districts",subtitle:"Browse area posts by state, then continue into Districts.",choose:"Choose a region",selected:"Selected area",districts:"Districts and posts",noDistricts:"No Districts are available for this area. You can still browse its public posts below.",noSingaporeDistricts:"Singapore is separate from Malaysia's District boundary dataset. You can still browse public Singapore posts below.",districtsUnavailable:"The District directory is temporarily unavailable.",posts:"Latest public posts",recentDistrictPosts:"Latest public posts in this District",empty:"There are no reviewed public posts for this area yet.",unavailable:"The area post service is temporarily unavailable. Try again later.",countsEmpty:"Area post counts are not configured yet.",countAccessible:"public posts",countUnavailable:"post count unavailable",all:"All regions",home:"Back to home",count:"posts",select:"Choose a state on the left to see its outline and public posts.",mapPending:"State outlines are for orientation. District lines use the 159 features in geoBoundaries. Putrajaya is grouped with Kuala Lumpur; the ADM2 source has no separate Putrajaya District boundary, while the existing state outline remains in the composite map.",mapSingaporeNotice:"Singapore is shown separately; the Malaysian District dataset does not apply here.",details:"Open an area to browse its posts",mapCredits:"Map boundary data and attribution",mapCreditsBody:"District boundaries use geoBoundaries 2020 ADM2 data and its source directory citypopulation.de under CC BY 3.0. The pinned file contains 159 features and has no separate Putrajaya District boundary; the existing Putrajaya state outline is grouped with Kuala Lumpur. Ledang is an older name for Tangkak.",flagCredits:"Flag artwork and attribution",flagCreditsBody:"State flag SVGs are from Malaysia State Flag Icon CSS; Johor, Kelantan, Sarawak, Selangor and Terengganu are marked CC BY-SA 3.0. Authors and other flag sources/licenses are listed in the project credits. Singapore's flag artwork is from flag-icons (MIT)."},
  ms:{eyebrow:"TEROKA KAWASAN",title:"Teroka Negeri + District",subtitle:"Lihat hantaran mengikut negeri, kemudian teruskan ke District.",choose:"Pilih kawasan",selected:"Kawasan dipilih",districts:"District dan hantaran",noDistricts:"Tiada District untuk kawasan ini. Anda masih boleh melihat hantaran awam di bawah.",noSingaporeDistricts:"Singapura diasingkan daripada set data sempadan District Malaysia. Anda masih boleh melihat hantaran awam Singapura di bawah.",districtsUnavailable:"Direktori District tidak tersedia buat sementara waktu.",posts:"Hantaran awam terkini",recentDistrictPosts:"Hantaran awam terkini di District ini",empty:"Belum ada hantaran awam yang disemak untuk kawasan ini.",unavailable:"Perkhidmatan hantaran kawasan tidak tersedia buat sementara waktu. Cuba lagi nanti.",countsEmpty:"Jumlah hantaran kawasan belum dikonfigurasikan.",countAccessible:"hantaran awam",countUnavailable:"bilangan hantaran tidak tersedia",all:"Semua kawasan",home:"Kembali ke laman utama",count:"hantaran",select:"Pilih negeri di sebelah kiri untuk melihat bentuk dan hantaran awam.",mapPending:"Bentuk negeri hanya sebagai panduan. Garis District menggunakan 159 bentuk geoBoundaries. Putrajaya digabungkan dengan Kuala Lumpur; sumber ADM2 tiada sempadan District Putrajaya, tetapi bentuk sempadan negeri sedia ada kekal dalam peta gabungan.",mapSingaporeNotice:"Singapura dipaparkan secara berasingan; data District Malaysia tidak terpakai.",details:"Buka kawasan untuk melihat hantaran",mapCredits:"Data sempadan peta dan atribusi",mapCreditsBody:"Sempadan District menggunakan data geoBoundaries ADM2 2020 dan direktori sumbernya citypopulation.de di bawah CC BY 3.0. Fail yang dipinkan mengandungi 159 bentuk tanpa sempadan District Putrajaya yang berasingan; bentuk sempadan negeri Putrajaya sedia ada digabungkan dengan Kuala Lumpur. Ledang ialah nama lama bagi Tangkak.",flagCredits:"Aset bendera dan atribusi",flagCreditsBody:"SVG bendera negeri daripada Malaysia State Flag Icon CSS; Johor, Kelantan, Sarawak, Selangor dan Terengganu ditandakan CC BY-SA 3.0. Nama pengarang serta sumber/lesen bendera lain disenaraikan di Credits projek. Bendera Singapura daripada flag-icons (MIT)."},
} as const;

export function AreaBrowsePage({areas,regionCounts,regionCountsStatus,totalPublicPosts,selectedArea,childAreas,childAreasStatus,selectedDistrict,posts,status,page,hasNextPage}:{areas:string[];regionCounts:PublicRegionPostCount[];regionCountsStatus:"ready"|"empty"|"unavailable";totalPublicPosts:number|null;selectedArea:string|null;childAreas:PublicChildArea[];childAreasStatus:"ready"|"unavailable";selectedDistrict:PublicChildArea|null;posts:PublicPost[];status:"ready"|"empty"|"unavailable";page:number;hasNextPage:boolean}){
  const {locale}=usePreferences();
  const text=copy[locale];
  const countByArea=new Map(regionCounts.map(item=>[item.areaName,item.publicPostCount]));
  const formatCount=(count:number|undefined)=>typeof count==="number"?count.toLocaleString(locale==="zh-CN"?"zh-CN":locale==="ms"?"ms-MY":"en-MY"):"—";
  const selectedLabel=selectedDistrict?stateDisplayName(locale,selectedDistrict.name):selectedArea?stateDisplayName(locale,selectedArea):null;
  const selectedCount=selectedDistrict?.publicPostCount??(selectedArea?countByArea.get(selectedArea):undefined);
  const parentPath=selectedArea?`/areas?state=${encodeURIComponent(selectedArea)}`:undefined;
  const basePath=selectedArea?`${parentPath}${selectedDistrict?`&district=${encodeURIComponent(selectedDistrict.id)}`:""}`:undefined;
  return <div className={styles.page} lang={locale}>
    <header className={styles.banner}>
      <div><p className={styles.eyebrow}>{text.eyebrow} · MMWR</p><h1>{text.title}</h1><p>{text.subtitle}</p></div>
    </header>
    <div className={`${styles.browserLayout} ${selectedArea?"":styles.fullMapLayout}`}>
      <nav className={`${styles.panel} ${styles.regionList}`} aria-label={text.choose}>
        <div className={styles.panelHeading}><h2>{text.choose}</h2>{selectedArea&&<Link href="/areas">{text.all}</Link>}</div>
        {regionCountsStatus!=="ready"&&<p className={styles.inlineStatus} role="status">{regionCountsStatus==="empty"?text.countsEmpty:text.unavailable}</p>}
        <ul>{areas.map(area=><li key={area}><Link href={`/areas?state=${encodeURIComponent(area)}`} aria-current={area===selectedArea?"page":undefined} aria-label={areaCountAccessibleLabel(stateDisplayName(locale,area),countByArea.get(area)??null,locale,text.countAccessible,text.countUnavailable)}><span className={styles.placeName}><Image className={styles.placeFlag} src={`/maps/flags/${regionFlagAssets[area]}.svg`} alt="" aria-hidden width={30} height={20}/>{stateDisplayName(locale,area)}</span><strong>{formatCount(countByArea.get(area))}</strong></Link></li>)}</ul>
        <details className={styles.flagCredits}><summary>{text.mapCredits}</summary><p>{text.mapCreditsBody}</p><p><a href="https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbOpen/MYS/ADM2/geoBoundaries-MYS-ADM2_simplified.geojson" target="_blank" rel="noreferrer">geoBoundaries · ADM2 2020 · 159 features</a><a href="https://www.citypopulation.de/en/malaysia/admin/" target="_blank" rel="noreferrer">City Population · District directory</a><a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a></p></details>
        <details className={styles.flagCredits}><summary>{text.flagCredits}</summary><p>{text.flagCreditsBody}</p><p><a href="https://github.com/jwarby/malaysia-state-flag-icon-css#credits" target="_blank" rel="noreferrer">Malaysia state flags · Credits</a><a href="https://github.com/lipis/flag-icons" target="_blank" rel="noreferrer">Singapore flag · flag-icons</a></p></details>
      </nav>
      <div className={styles.detailColumn}>
        <section className={`${styles.panel} ${styles.mapPanel} ${selectedArea?"":`map-panel ${styles.fullMapPanel}`}`} aria-labelledby="selected-area-heading">
          {selectedArea?<>
            <div className={styles.selectedHeading}><div><p className={styles.eyebrow}>{text.selected}</p><h2 id="selected-area-heading">{selectedLabel}</h2></div><strong className={styles.total}>{formatCount(selectedCount)} <small>{text.count}</small></strong></div>
            <div className={styles.mapCanvas}>
              <div className={styles.mapGlow} aria-hidden="true"/>
              <SelectedAreaMap area={selectedArea} locale={locale} districts={childAreas}/>
              <div className={styles.mapNotice}><span className={styles.pin} aria-hidden="true">⌖</span>{selectedArea==="Singapore"?text.mapSingaporeNotice:text.mapPending}</div>
              {selectedDistrict&&page===1&&status==="ready"&&posts.length>0&&<aside className={styles.districtPostPreview} aria-labelledby="district-post-preview-heading">
                <h3 id="district-post-preview-heading">{text.recentDistrictPosts}</h3>
                <ul>{posts.slice(0,3).map(post=><li key={post.post_id}><Link href={post.content_type==="clarification"?`/clarifications/${post.post_id}`:`/posts/${post.post_id}`}>
                  <strong>{post.approved_title}</strong><span>{post.primary_name}</span><p>{post.public_excerpt}</p>
                </Link></li>)}</ul>
              </aside>}
            </div>
          </>:<div className={styles.fullMap} id="selected-area-heading"><MalaysiaMap locale={locale} source={siteCopy[locale].mapSource} totalPublicPosts={totalPublicPosts} bare/></div>}
        </section>
        {selectedArea&&<>
          <section className={`${styles.panel} ${styles.districtPanel}`} aria-labelledby="district-heading">
            <div className={styles.panelHeading}><h2 id="district-heading">{text.districts}</h2>{selectedDistrict&&parentPath&&<Link href={parentPath}>{stateDisplayName(locale,selectedArea)} ←</Link>}</div>
            {childAreasStatus==="unavailable"?<p className={styles.message} role="status">{text.districtsUnavailable}</p>:childAreas.length===0?<p className={styles.message} role="status">{selectedArea==="Singapore"?text.noSingaporeDistricts:text.noDistricts}</p>:<ul className={styles.districtList}>{childAreas.map(district=><li key={district.id}><Link href={`${parentPath}&district=${encodeURIComponent(district.id)}`} aria-current={district.id===selectedDistrict?.id?"page":undefined}><span>{stateDisplayName(locale,district.name)}</span><strong>{formatCount(district.publicPostCount)} <small>{text.count}</small></strong></Link></li>)}</ul>}
          </section>
          <section className={styles.posts} aria-labelledby="area-posts-heading">
            <div className={styles.postsHeading}><h2 id="area-posts-heading">{text.posts} · {selectedLabel}</h2><span>{text.details}</span></div>
            {status==="unavailable"&&<p className={styles.message} role="status">{text.unavailable}</p>}
            {status==="empty"&&<p className={styles.message} role="status">{text.empty}</p>}
            {status==="ready"&&<PublicPostGrid posts={posts} status={status} page={page} hasNextPage={hasNextPage} basePath={basePath} heading={`${text.posts} · ${selectedLabel}`} hideHeader gridClassName={styles.postGrid}/>}
          </section>
        </>}
      </div>
    </div>
    <Link className={styles.home} href="/">{text.home} →</Link>
  </div>;
}
