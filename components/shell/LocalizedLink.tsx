"use client";

import NextLink from "next/link";
import type {ComponentProps} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {localizedPath} from "@/lib/i18n/routing";

type LinkProps=ComponentProps<typeof NextLink>;

function isPagePath(pathname:string){
  if(!pathname.startsWith("/")||pathname.startsWith("//"))return false;
  if(["/api","/auth","/_next","/.well-known"].some(prefix=>pathname===prefix||pathname.startsWith(`${prefix}/`)))return false;
  if(pathname==="/robots.txt"||pathname==="/sitemap.xml"||pathname==="/favicon.ico")return false;
  return !/(?:^|\/)[^/]+\.[a-z0-9]{1,12}$/i.test(pathname);
}

function localizedHref(href:LinkProps["href"],locale:ReturnType<typeof usePreferences>["locale"]):LinkProps["href"]{
  if(typeof href==="string"){
    const pathname=href.split(/[?#]/,1)[0];
    return isPagePath(pathname)?localizedPath(href,locale):href;
  }
  if(href.pathname&&isPagePath(href.pathname))return {...href,pathname:localizedPath(href.pathname,locale)};
  return href;
}

export default function LocalizedLink({href,...props}:LinkProps){
  const {locale}=usePreferences();
  return <NextLink {...props} href={localizedHref(href,locale)}/>;
}
