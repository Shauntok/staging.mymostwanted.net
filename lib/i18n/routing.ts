import type {Locale} from "@/lib/i18n/catalog";

const localeSegments:Record<Locale,string>={"zh-CN":"zh-cn",en:"en",ms:"ms"};

export function localeFromSegment(value:unknown):Locale|null{
  if(typeof value!=="string")return null;
  const normalized=value.toLowerCase();
  if(normalized==="zh-cn")return "zh-CN";
  if(normalized==="en")return "en";
  if(normalized==="ms")return "ms";
  return null;
}

export function localeSegment(locale:Locale):string{return localeSegments[locale];}

export function preferredLocale(cookieValue:unknown,acceptLanguage:string|null):Locale{
  const savedLocale=localeFromSegment(cookieValue);
  if(savedLocale)return savedLocale;
  const primaryLanguage=acceptLanguage?.split(",",1)[0]?.trim().toLowerCase()??"";
  return primaryLanguage.startsWith("zh")?"zh-CN":primaryLanguage.startsWith("ms")?"ms":"en";
}

export function localizedPath(path:string,locale:Locale):string{
  if(!path.startsWith("/")||path.startsWith("//"))return path;
  const parsed=new URL(path,"https://mmwr.invalid");
  const segments=parsed.pathname.split("/");
  if(localeFromSegment(segments[1]))segments.splice(1,1);
  const rest=segments.slice(1).filter(Boolean).join("/");
  const pathname=rest?`/${localeSegment(locale)}/${rest}`:`/${localeSegment(locale)}`;
  return `${pathname}${parsed.search}${parsed.hash}`;
}
