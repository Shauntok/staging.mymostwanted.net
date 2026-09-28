import type {Metadata} from "next";
import {PreferencesProvider} from "@/components/shell/PreferencesProvider";
import {SiteChrome} from "@/components/shell/SiteChrome";
import "./globals.css";
const siteUrl=process.env.NEXT_PUBLIC_SITE_URL??"https://example.com";
export const metadata:Metadata={metadataBase:new URL(siteUrl),title:{default:"MMWR — Malaysia Most Wanted Ranking",template:"%s | MMWR"},description:"MMWR is a community information platform for Malaysia, built around careful review, privacy and responsible sharing.",applicationName:"MMWR",openGraph:{type:"website",siteName:"MMWR",title:"MMWR — Malaysia Most Wanted Ranking",description:"A community information platform for Malaysia."},robots:{index:process.env.ALLOW_SEARCH_INDEXING==="true",follow:process.env.ALLOW_SEARCH_INDEXING==="true"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en" suppressHydrationWarning><body><PreferencesProvider><SiteChrome>{children}</SiteChrome></PreferencesProvider></body></html>;}
