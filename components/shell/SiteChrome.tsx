"use client";

import Link from "@/components/shell/LocalizedLink";
import {usePathname} from "next/navigation";
import {useRef, useState} from "react";
import type {Locale} from "@/lib/i18n/catalog";
import {copy, localeLabels} from "@/lib/i18n/catalog";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {ConsentOverlays, useModalFocus} from "@/components/consent/ConsentOverlays";
import {legalCopy, legalRoutes} from "@/components/legal/legalCopy";
import {BrandSymbol} from "@/components/shell/BrandSymbol";
import {GoogleAnalytics} from "@/components/analytics/GoogleAnalytics";
import {clarificationCopy} from "@/components/clarifications/copy";

export function BrandLockup({locale, markOnly = false}: {locale: Locale; markOnly?: boolean}) {
  return <>
    <span className="brand-mark"><BrandSymbol/></span>
    {!markOnly && <span className="brand-copy"><strong>MMWR</strong><small>Malaysia Most Wanted Ranking</small>{locale === "zh-CN" && <small className="brand-chinese">马来西亚人渣排行榜</small>}</span>}
  </>;
}

export function SiteChrome({children}: {children: React.ReactNode}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname=usePathname();
  const preferences = usePreferences();
  const t = copy[preferences.locale];
  const legal = legalCopy[preferences.locale];
  const clarificationNavLabel=clarificationCopy[preferences.locale].directoryTitle;
  const brandHomeLabel = `${preferences.locale === "zh-CN" ? "MMWR 马来西亚人渣排行榜" : "MMWR"} — ${t.home}`;
  const localizedPagePath=(pathname??"/").replace(/^\/(?:zh-cn|en|ms)(?=\/|$)/i,"")||"/";
  const isCurrentPage=(href:string)=>href==="/"?localizedPagePath==="/":localizedPagePath===href||localizedPagePath.startsWith(`${href}/`);
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const cookieButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  useModalFocus(drawerOpen, drawerRef, drawerCloseRef, () => setDrawerOpen(false), menuButtonRef);

  return <>
    <div className="site-frame" inert={!preferences.hydrated || !preferences.ageApproved || preferences.consentOpen || drawerOpen ? true : undefined}>
      <header className="site-header">
        <Link className="brand" href="/" aria-label={brandHomeLabel}><BrandLockup locale={preferences.locale}/></Link>
        <nav className="desktop-nav" aria-label={t.mainNavigation}>{[["/",t.home],["/hot",t.hot],["/areas",t.area],["/tags",t.tags],["/clarifications",clarificationNavLabel]].map(([href,label])=>{const active=isCurrentPage(href);return <Link key={href} className={active?"nav-active":undefined} aria-current={active?"page":undefined} href={href}>{label}</Link>;})}</nav>
        <div className="header-actions"><Link className="search-link" href="/search"><span aria-hidden="true">⌕</span><span>{t.search}</span></Link><button type="button" className="header-theme" aria-label={t.theme} title={t.theme} onClick={() => preferences.setTheme(preferences.theme === "light" ? "dark" : "light")}>{preferences.theme === "light" ? "☼" : "◐"}</button><label className="header-language"><span aria-hidden="true">🇲🇾</span><select aria-label={t.language} value={preferences.locale} onChange={(event) => preferences.setLocale(event.target.value as Locale)}>{Object.entries(localeLabels).map(([code,name]) => <option key={code} value={code}>{name}</option>)}</select></label><Link className="header-account" href="/account">{t.account}</Link><Link className="button button-primary submit-link" href="/submit">{t.submit}<span aria-hidden="true">↗</span></Link><button ref={menuButtonRef} type="button" className="menu-button" aria-label={t.menu} aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}><span/><span/></button></div>
      </header>
      <main ref={mainRef} tabIndex={-1}>{children}</main>
      <footer className="site-footer"><div className="footer-inner"><Link className="brand footer-brand" href="/" aria-label={brandHomeLabel}><BrandLockup locale={preferences.locale}/></Link><p>{t.footer}</p><nav className="footer-links" aria-label={legal.navigation}>{legalRoutes.map(({id, href}) => <Link key={id} href={href}>{legal.documents[id].title}</Link>)}<button ref={cookieButtonRef} id="cookie-settings-button" type="button" onClick={preferences.openConsent}>{t.cookieSettings}</button></nav><small className="copyright">© {new Date().getFullYear()} MMWR</small></div></footer>
    </div>
    {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}><aside ref={drawerRef} id="site-drawer" className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
      <div className="drawer-top"><span id="drawer-title" className="eyebrow">{t.discover} MMWR</span><button ref={drawerCloseRef} type="button" className="dialog-close" aria-label={t.close} onClick={() => setDrawerOpen(false)}>×</button></div>
      <nav className="drawer-nav" aria-label={t.mainNavigation}><Link href="/">{t.home}<span aria-hidden="true">01</span></Link><Link href="/latest">{t.latest}<span aria-hidden="true">02</span></Link><Link href="/hot">{t.hot}<span aria-hidden="true">03</span></Link><Link href="/tags">{t.tags}<span aria-hidden="true">04</span></Link><Link href="/areas">{t.area}<span aria-hidden="true">05</span></Link><Link href="/clarifications">{clarificationNavLabel}<span aria-hidden="true">06</span></Link><Link href="/submit">{t.submit}<span aria-hidden="true">07</span></Link><Link href="/submissions">{t.mySubmissions}<span aria-hidden="true">08</span></Link><Link href="/report">{t.report}<span aria-hidden="true">09</span></Link><Link href="/vip" className="drawer-muted">{t.vip}<span aria-hidden="true">10</span></Link></nav>
      <div className="drawer-controls"><label>{t.language}<select value={preferences.locale} onChange={(event) => preferences.setLocale(event.target.value as Locale)}>{Object.entries(localeLabels).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label><label>{t.theme}<button type="button" className="theme-toggle" onClick={() => preferences.setTheme(preferences.theme === "light" ? "dark" : "light")}>{preferences.theme === "light" ? "☼  " + t.light : "◐  " + t.dark}</button></label></div>
      <nav className="drawer-bottom" aria-label={legal.navigation}>{legalRoutes.map(({id, href}) => <Link key={id} href={href}>{legal.documents[id].title}</Link>)}<Link href="/account">{t.account}</Link><button type="button" className="drawer-cookie-button" onClick={() => {setDrawerOpen(false); preferences.openConsent();}}>{t.cookieSettings}</button></nav>
    </aside></div>}
    <ConsentOverlays restoreFocusRef={cookieButtonRef} ageRestoreFocusRef={mainRef}/>
    <GoogleAnalytics/>
  </>;
}
