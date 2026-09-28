"use client";

import {useRef, useState} from "react";
import type {Locale} from "@/lib/i18n/catalog";
import {copy, localeLabels} from "@/lib/i18n/catalog";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {ConsentOverlays, useModalFocus} from "@/components/consent/ConsentOverlays";
import {legalCopy, legalRoutes} from "@/components/legal/legalCopy";

export function BrandLockup({locale, markOnly = false}: {locale: Locale; markOnly?: boolean}) {
  return <>
    <span className="brand-mark" aria-hidden="true">M</span>
    {!markOnly && <span className="brand-copy"><strong>MMWR</strong><small>Malaysia Most Wanted Ranking</small>{locale === "zh-CN" && <small className="brand-chinese">马来西亚人渣排行榜</small>}</span>}
  </>;
}

export function SiteChrome({children}: {children: React.ReactNode}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const preferences = usePreferences();
  const t = copy[preferences.locale];
  const legal = legalCopy[preferences.locale];
  const brandHomeLabel = `${preferences.locale === "zh-CN" ? "MMWR 马来西亚人渣排行榜" : "MMWR"} — ${t.home}`;
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const cookieButtonRef = useRef<HTMLButtonElement>(null);
  useModalFocus(drawerOpen, drawerRef, drawerCloseRef, () => setDrawerOpen(false), menuButtonRef);

  return <>
    <div className="site-frame" inert={!preferences.hydrated || !preferences.ageApproved || preferences.consentOpen || drawerOpen ? true : undefined}>
      <header className="site-header">
        <a className="brand" href="/" aria-label={brandHomeLabel}><BrandLockup locale={preferences.locale}/></a>
        <nav className="desktop-nav" aria-label={t.mainNavigation}><a className="nav-active" href="/">{t.home}</a><a href="/latest">{t.latest}</a><a href="/hot">{t.hot}</a><a href="/tags">{t.tags}</a></nav>
        <div className="header-actions"><a className="search-link" href="/search"><span aria-hidden="true">⌕</span><span>{t.search}</span></a><a className="button button-primary submit-link" href="/submit">{t.submit}<span aria-hidden="true">↗</span></a><button ref={menuButtonRef} type="button" className="menu-button" aria-label={t.menu} aria-expanded={drawerOpen} aria-controls="site-drawer" onClick={() => setDrawerOpen(true)}><span/><span/></button></div>
      </header>
      <main>{children}</main>
      <footer className="site-footer"><div className="footer-inner"><a className="brand footer-brand" href="/" aria-label={brandHomeLabel}><BrandLockup locale={preferences.locale}/></a><p>{t.footer}</p><nav className="footer-links" aria-label={legal.navigation}>{legalRoutes.map(({id, href}) => <a key={id} href={href}>{legal.documents[id].title}</a>)}<button ref={cookieButtonRef} id="cookie-settings-button" type="button" onClick={preferences.openConsent}>{t.cookieSettings}</button></nav><small className="copyright">© {new Date().getFullYear()} MMWR</small></div></footer>
    </div>
    {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}><aside ref={drawerRef} id="site-drawer" className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
      <div className="drawer-top"><span id="drawer-title" className="eyebrow">{t.discover} MMWR</span><button ref={drawerCloseRef} type="button" className="dialog-close" aria-label={t.close} onClick={() => setDrawerOpen(false)}>×</button></div>
      <nav className="drawer-nav" aria-label={t.mainNavigation}><a href="/">{t.home}<span aria-hidden="true">01</span></a><a href="/latest">{t.latest}<span aria-hidden="true">02</span></a><a href="/hot">{t.hot}<span aria-hidden="true">03</span></a><a href="/tags">{t.tags}<span aria-hidden="true">04</span></a><a href="/areas">{t.area}<span aria-hidden="true">05</span></a><a href="/submit">{t.submit}<span aria-hidden="true">06</span></a><a href="/submissions">{t.mySubmissions}<span aria-hidden="true">07</span></a><a href="/vip" className="drawer-muted">{t.vip}<span aria-hidden="true">08</span></a></nav>
      <div className="drawer-controls"><label>{t.language}<select value={preferences.locale} onChange={(event) => preferences.setLocale(event.target.value as Locale)}>{Object.entries(localeLabels).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label><label>{t.theme}<button type="button" className="theme-toggle" onClick={() => preferences.setTheme(preferences.theme === "light" ? "dark" : "light")}>{preferences.theme === "light" ? "☼  " + t.light : "◐  " + t.dark}</button></label></div>
      <nav className="drawer-bottom" aria-label={legal.navigation}>{legalRoutes.map(({id, href}) => <a key={id} href={href}>{legal.documents[id].title}</a>)}<a href="/account">{t.account}</a><button type="button" className="drawer-cookie-button" onClick={() => {setDrawerOpen(false); preferences.openConsent();}}>{t.cookieSettings}</button></nav>
    </aside></div>}
    <ConsentOverlays restoreFocusRef={cookieButtonRef}/>
  </>;
}
