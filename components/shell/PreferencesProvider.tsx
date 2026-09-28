"use client";
import { createContext,useCallback,useContext,useEffect,useMemo,useState } from "react";
import type { Locale } from "@/lib/i18n/catalog";
type Consent={analytics:boolean;advertising:boolean};
type Preferences={locale:Locale;theme:"light"|"dark";consent:Consent;ageApproved:boolean;ageDenied:boolean;consentOpen:boolean;hydrated:boolean;setLocale:(x:Locale)=>void;setTheme:(x:"light"|"dark")=>void;approveAge:()=>void;denyAge:()=>void;saveConsent:(x:Consent)=>void;openConsent:()=>void;closeConsent:()=>void};
const Context=createContext<Preferences|null>(null);
const read=(n:string)=>document.cookie.split("; ").find((p)=>p.startsWith(n+"="))?.slice(n.length+1);
const write=(n:string,v:string,age=31536000)=>{document.cookie=n+"="+encodeURIComponent(v)+"; Path=/; Max-Age="+age+"; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"");};
export function PreferencesProvider({children}:{children:React.ReactNode}){
 const [locale,L]=useState<Locale>("en"),[theme,T]=useState<"light"|"dark">("light"),[consent,C]=useState<Consent>({analytics:false,advertising:false}),[ageApproved,A]=useState(false),[ageDenied,D]=useState(false),[consentOpen,O]=useState(false),[consentChosen,Q]=useState(false),[hydrated,H]=useState(false);
 useEffect(()=>{const l=read("mmwr_locale") as Locale|undefined,th=read("mmwr_theme"),age=read("mmwr_age"),co=read("mmwr_consent");if(l&&["zh-CN","en","ms"].includes(l))L(l);else if(navigator.language.toLowerCase().startsWith("zh"))L("zh-CN");else if(navigator.language.toLowerCase().startsWith("ms"))L("ms");if(th==="dark"||th==="light")T(th);else if(window.matchMedia("(prefers-color-scheme: dark)").matches)T("dark");if(age)A(true);if(co){try{const v=JSON.parse(decodeURIComponent(co)) as Consent;C({analytics:v.analytics===true,advertising:v.advertising===true});Q(true);}catch{Q(false);}}H(true);},[]);
 useEffect(()=>{document.documentElement.lang=locale;document.documentElement.dataset.theme=theme;},[locale,theme]);
 const setLocale=useCallback((x:Locale)=>{L(x);write("mmwr_locale",x);},[]),setTheme=useCallback((x:"light"|"dark")=>{T(x);write("mmwr_theme",x);},[]),approveAge=useCallback(()=>{A(true);D(false);write("mmwr_age","approved",2592000);},[]),denyAge=useCallback(()=>{D(true);A(false);document.cookie="mmwr_age=; Path=/; Max-Age=0; SameSite=Lax";},[]);
 const saveConsent=useCallback((x:Consent)=>{const v={analytics:x.analytics===true,advertising:x.advertising===true};C(v);Q(true);O(false);write("mmwr_consent",JSON.stringify(v));},[]);
 const value=useMemo<Preferences>(()=>({locale,theme,consent,ageApproved,ageDenied,consentOpen,hydrated,setLocale,setTheme,approveAge,denyAge,saveConsent,openConsent:()=>O(true),closeConsent:()=>O(false)}),[locale,theme,consent,ageApproved,ageDenied,consentOpen,hydrated,setLocale,setTheme,approveAge,denyAge,saveConsent]);
 useEffect(()=>{if(hydrated&&ageApproved&&!consentChosen)O(true);},[hydrated,ageApproved,consentChosen]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePreferences(){const value=useContext(Context);if(!value)throw new Error("usePreferences must be used within PreferencesProvider");return value;}
