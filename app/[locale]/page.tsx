import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {HomeContent} from "@/components/home/HomeContent";
import {localeFromSegment,localeSegment} from "@/lib/i18n/routing";
import {getIndexableProductionOrigin} from "@/lib/seo/indexable-origin";
import {localizedHomeMetadata} from "@/lib/seo/localized-home-metadata.mjs";

const localeParams=[{locale:"en"},{locale:"zh-cn"},{locale:"ms"}];

export function generateStaticParams(){return localeParams;}

export async function generateMetadata({params}:{params:Promise<{locale:string}>}):Promise<Metadata>{
  const route=await params;
  const locale=localeFromSegment(route.locale);
  if(!locale)return {robots:{index:false,follow:false}};
  const origin=getIndexableProductionOrigin()?.origin??null;
  return localizedHomeMetadata(localeSegment(locale),origin);
}

export default async function LocalizedHome({params}:{params:Promise<{locale:string}>}){
  const route=await params;
  const locale=localeFromSegment(route.locale);
  if(!locale)notFound();
  return <HomeContent locale={locale}/>;
}
