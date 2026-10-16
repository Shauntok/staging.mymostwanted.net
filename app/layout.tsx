import type {Metadata} from "next";
import {PreferencesProvider} from "@/components/shell/PreferencesProvider";
import {SiteChrome} from "@/components/shell/SiteChrome";
import {getIndexableProductionOrigin} from "@/lib/seo/indexable-origin";
import {isLocale,type Locale} from "@/lib/i18n/catalog";
import {localeFromSegment} from "@/lib/i18n/routing";
import {connection} from "next/server";
import {cookies,headers} from "next/headers";
import "./globals.css";
const productionOrigin=getIndexableProductionOrigin();
const metadataCopy:Record<Locale,{description:string;openGraphDescription:string;openGraphLocale:string}>={
 "zh-CN":{description:"MMWR 是马来西亚社区信息平台，重视审慎审核、隐私保护与负责任的信息分享。",openGraphDescription:"一个重视审慎审核、隐私和负责任分享的马来西亚社区信息平台。",openGraphLocale:"zh_CN"},
 en:{description:"MMWR is a community information platform for Malaysia, built around careful review, privacy and responsible sharing.",openGraphDescription:"A community information platform for Malaysia, built around careful review, privacy and responsible sharing.",openGraphLocale:"en_MY"},
 ms:{description:"MMWR ialah platform maklumat komuniti untuk Malaysia yang mengutamakan semakan teliti, privasi dan perkongsian bertanggungjawab.",openGraphDescription:"Platform maklumat komuniti untuk Malaysia yang mengutamakan semakan teliti, privasi dan perkongsian bertanggungjawab.",openGraphLocale:"ms_MY"}
};
export async function generateMetadata():Promise<Metadata>{
 const [cookieStore,requestHeaders]=await Promise.all([cookies(),headers()]);
 const savedLocale=cookieStore.get("mmwr_locale")?.value;
 const locale:Locale=localeFromSegment(requestHeaders.get("x-mmwr-locale"))??(isLocale(savedLocale)?savedLocale:"en");
 const localized=metadataCopy[locale];
 return {metadataBase:productionOrigin??new URL("http://localhost:3000"),title:{default:"MMWR — Malaysia Most Wanted Ranking",template:"%s | MMWR"},description:localized.description,applicationName:"MMWR",openGraph:{type:"website",siteName:"MMWR",title:"MMWR — Malaysia Most Wanted Ranking",description:localized.openGraphDescription,locale:localized.openGraphLocale},robots:{index:false,follow:false}};
}
export default async function RootLayout({children}:Readonly<{children:React.ReactNode}>){await connection();const [cookieStore,requestHeaders]=await Promise.all([cookies(),headers()]);const savedLocale=cookieStore.get("mmwr_locale")?.value;const localeFromPath=localeFromSegment(requestHeaders.get("x-mmwr-locale"));const initialLocale:Locale=localeFromPath??(isLocale(savedLocale)?savedLocale:"en");return <html lang={initialLocale} suppressHydrationWarning><body><PreferencesProvider initialLocale={initialLocale}><SiteChrome>{children}</SiteChrome></PreferencesProvider></body></html>;}
