import {cookies,headers} from "next/headers";
import {redirect} from "next/navigation";
import {localeSegment,preferredLocale} from "@/lib/i18n/routing";

export default async function HomeRedirect(){
  const [cookieStore,requestHeaders]=await Promise.all([cookies(),headers()]);
  redirect(`/${localeSegment(preferredLocale(cookieStore.get("mmwr_locale")?.value,requestHeaders.get("accept-language")))}`);
}
