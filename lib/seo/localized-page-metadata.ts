import type {Metadata} from "next";
import {headers} from "next/headers";
import type {Locale} from "@/lib/i18n/catalog";
import {localeFromSegment,localizedPath} from "@/lib/i18n/routing";
import {getIndexableProductionOrigin} from "@/lib/seo/indexable-origin";

type Copy=Record<Locale,{title:string;description:string}>;

const openGraphLocale:Record<Locale,string>={"zh-CN":"zh_CN",en:"en_MY",ms:"ms_MY"};

/** Build locale-matched metadata, with indexing permitted only behind the production gate. */
export async function getLocalizedPageMetadata(path:string,copy:Copy,allowIndexing:boolean):Promise<Metadata>{
  const requestHeaders=await headers();
  const locale=localeFromSegment(requestHeaders.get("x-mmwr-locale"))??"en";
  const localized=copy[locale];
  const indexableOrigin=getIndexableProductionOrigin();
  const indexable=allowIndexing&&Boolean(indexableOrigin);
  const canonicalPath=localizedPath(path,locale);
  const canonical=indexableOrigin?new URL(canonicalPath,indexableOrigin).toString():undefined;
  const languages=indexableOrigin?{
    "en-MY":new URL(localizedPath(path,"en"),indexableOrigin).toString(),
    "zh-CN":new URL(localizedPath(path,"zh-CN"),indexableOrigin).toString(),
    "ms-MY":new URL(localizedPath(path,"ms"),indexableOrigin).toString(),
    "x-default":new URL(localizedPath(path,"en"),indexableOrigin).toString(),
  }:undefined;
  return {
    title:localized.title,
    description:localized.description,
    ...(canonical?{alternates:{canonical,languages}}:{}),
    openGraph:{type:"website",siteName:"MMWR",title:localized.title,description:localized.description,...(canonical?{url:canonical}:{}),locale:openGraphLocale[locale]},
    twitter:{card:"summary",title:localized.title,description:localized.description},
    robots:{index:indexable,follow:indexable},
  };
}

/** Build localized metadata for routes that must remain non-indexable. */
export function getLocalizedNoIndexMetadata(path:string,copy:Copy):Promise<Metadata>{
  return getLocalizedPageMetadata(path,copy,false);
}
