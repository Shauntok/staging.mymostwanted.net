"use client";

import {createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore} from "react";
import {usePathname} from "next/navigation";
import {isLocale, type Locale} from "@/lib/i18n/catalog";
import {localeFromSegment,localizedPath} from "@/lib/i18n/routing";

type Consent = {analytics: boolean; advertising: boolean};
type StoredPreferences = {
  locale: Locale;
  theme: "light" | "dark";
  consent: Consent;
  ageApproved: boolean;
  consentChosen: boolean;
  hydrated: boolean;
};
type Preferences = {
  locale: Locale;
  theme: "light" | "dark";
  consent: Consent;
  ageApproved: boolean;
  ageDenied: boolean;
  consentOpen: boolean;
  hydrated: boolean;
  setLocale: (value: Locale) => void;
  setTheme: (value: "light" | "dark") => void;
  approveAge: () => void;
  denyAge: () => void;
  saveConsent: (value: Consent) => void;
  openConsent: () => void;
  closeConsent: () => void;
};

const Context = createContext<Preferences | null>(null);
const preferenceChangeEvent = "mmwr-preferences-change";
const defaultConsent: Consent = {analytics: false, advertising: false};

const readCookie = (name: string) => document.cookie.split("; ").find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
const writeCookie = (name: string, value: string, age = 31536000) => {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${age}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  window.dispatchEvent(new Event(preferenceChangeEvent));
};

function subscribeToPreferences(onChange: () => void) {
  window.addEventListener(preferenceChangeEvent, onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener(preferenceChangeEvent, onChange);
    window.removeEventListener("focus", onChange);
  };
}

function getBrowserPreferencesSnapshot(pathLocale?:Locale) {
  const localeCookie = readCookie("mmwr_locale");
  const locale = pathLocale??(isLocale(localeCookie)
    ? localeCookie
    : navigator.language.toLowerCase().startsWith("zh")
      ? "zh-CN"
      : navigator.language.toLowerCase().startsWith("ms")
        ? "ms"
        : "en");
  const themeCookie = readCookie("mmwr_theme");
  const theme = themeCookie === "dark" || themeCookie === "light"
    ? themeCookie
    : window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  const consentCookie = readCookie("mmwr_consent");
  let consent = defaultConsent;
  let consentChosen = false;
  if (consentCookie) {
    try {
      const parsed = JSON.parse(decodeURIComponent(consentCookie)) as Partial<Consent>;
      consent = {analytics: parsed.analytics === true, advertising: parsed.advertising === true};
      consentChosen = true;
    } catch {
      // Ignore malformed preference cookies and ask the visitor to choose again.
    }
  }

  const snapshot: StoredPreferences = {
    locale,
    theme,
    consent,
    ageApproved: Boolean(readCookie("mmwr_age")),
    consentChosen,
    hydrated: true,
  };
  return JSON.stringify(snapshot);
}

export function PreferencesProvider({children, initialLocale = "en"}: {children: React.ReactNode; initialLocale?: Locale}) {
  const pathname=usePathname();
  const pathLocale=localeFromSegment(pathname.split("/")[1]);
  const serverSnapshot = useCallback(() => JSON.stringify({
    locale: initialLocale,
    theme: "light",
    consent: defaultConsent,
    ageApproved: false,
    consentChosen: false,
    hydrated: false,
  } satisfies StoredPreferences), [initialLocale]);
  const browserSnapshot=useCallback(()=>getBrowserPreferencesSnapshot(pathLocale??undefined),[pathLocale]);
  const stored = JSON.parse(useSyncExternalStore(subscribeToPreferences, browserSnapshot, serverSnapshot)) as StoredPreferences;
  const [ageDenied, setAgeDenied] = useState(false);
  const [manuallyOpenedConsent, setManuallyOpenedConsent] = useState(false);
  const consentOpen = manuallyOpenedConsent || (stored.hydrated && stored.ageApproved && !stored.consentChosen);

  useEffect(() => {
    document.documentElement.lang = stored.locale;
    document.documentElement.dataset.theme = stored.theme;
  }, [stored.locale, stored.theme]);

  useEffect(()=>{
    if(pathLocale)writeCookie("mmwr_locale",pathLocale);
  },[pathLocale]);

  const setLocale = useCallback((value: Locale) => {
    writeCookie("mmwr_locale", value);
    if(pathLocale)window.location.assign(localizedPath(`${window.location.pathname}${window.location.search}${window.location.hash}`,value));
  }, [pathLocale]);
  const setTheme = useCallback((value: "light" | "dark") => writeCookie("mmwr_theme", value), []);
  const approveAge = useCallback(() => {
    writeCookie("mmwr_age", "approved", 2592000);
    setAgeDenied(false);
  }, []);
  const denyAge = useCallback(() => {
    setAgeDenied(true);
    document.cookie = `mmwr_age=; Path=/; Max-Age=0; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    window.dispatchEvent(new Event(preferenceChangeEvent));
  }, []);
  const saveConsent = useCallback((value: Consent) => {
    writeCookie("mmwr_consent", JSON.stringify({analytics: value.analytics === true, advertising: value.advertising === true}));
    void fetch("/api/analytics/consent-attestation",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({analytics:value.analytics===true}),keepalive:true}).catch(()=>undefined);
    setManuallyOpenedConsent(false);
  }, []);
  const openConsent = useCallback(() => setManuallyOpenedConsent(true), []);
  const closeConsent = useCallback(() => setManuallyOpenedConsent(false), []);

  const value = useMemo<Preferences>(() => ({
    locale: stored.locale,
    theme: stored.theme,
    consent: stored.consent,
    ageApproved: stored.ageApproved,
    ageDenied,
    consentOpen,
    hydrated: stored.hydrated,
    setLocale,
    setTheme,
    approveAge,
    denyAge,
    saveConsent,
    openConsent,
    closeConsent,
  }), [stored, ageDenied, consentOpen, setLocale, setTheme, approveAge, denyAge, saveConsent, openConsent, closeConsent]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error("usePreferences must be used within PreferencesProvider");
  return value;
}
