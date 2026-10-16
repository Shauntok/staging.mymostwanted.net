import {createServerClient} from "@supabase/ssr";
import {NextResponse, type NextRequest} from "next/server";
import {localeFromSegment,localeSegment,localizedPath,preferredLocale} from "@/lib/i18n/routing";
import {getOwnerIpBlockConfig,getOwnerIpBlockFingerprint,getTrustedClientIpAddress} from "@/lib/security/owner-ip-blocks";
import {touchStaffSessionFromClaims} from "@/lib/admin/staff-session";
import {createSupabaseServiceClient} from "@/lib/supabase/service";

function getSupabaseSources() {
  const configuredUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) return {http:"",websocket:""};
  try {
    const url=new URL(configuredUrl);
    if (url.protocol!=="https:"&&url.protocol!=="http:") return {http:"",websocket:""};
    if (process.env.NODE_ENV==="production"&&url.protocol!=="https:") return {http:"",websocket:""};
    return {http:url.origin,websocket:`${url.protocol==="https:"?"wss:":"ws:"}//${url.host}`};
  } catch {
    return {http:"",websocket:""};
  }
}

function createCsp(nonce:string) {
  const dev=process.env.NODE_ENV!=="production";
  const supabase=getSupabaseSources();
  const devConnectSources=dev?"ws://localhost:3000 ws://127.0.0.1:3000":"";
  const csp=`default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com https://www.googletagmanager.com${dev?" 'unsafe-eval'":""}; style-src 'self' 'nonce-${nonce}'; img-src 'self' data: blob: ${supabase.http} https://www.google-analytics.com; media-src 'self' blob: ${supabase.http}; font-src 'self' data:; connect-src 'self' ${supabase.http} ${supabase.websocket} ${devConnectSources} https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com; frame-src https://challenges.cloudflare.com; manifest-src 'self'; worker-src 'self' blob:${dev?"":"; upgrade-insecure-requests"}`;
  return csp.replace(/\s{2,}/g," ").trim();
}

function isLocaleRoutingExempt(pathname:string){
  if(pathname==="/"||pathname==="/robots.txt"||pathname==="/sitemap.xml"||pathname==="/favicon.ico")return true;
  if(["/api","/auth","/_next","/.well-known"].some(prefix=>pathname===prefix||pathname.startsWith(`${prefix}/`)))return true;
  return /(?:^|\/)[^/]+\.[a-z0-9]{1,12}$/i.test(pathname);
}

function isPostDetailPath(pathname:string){
  return /^(?:\/(?:en|zh-cn|ms))?\/posts\/[^/]+\/?$/.test(pathname);
}

function isStaffRoute(pathname:string){
  return /^(?:\/(?:en|zh-cn|ms))?\/admin(?:\/|$)/.test(pathname);
}

function copyCookies(source:NextResponse,destination:NextResponse){
  for(const cookie of source.cookies.getAll())destination.cookies.set(cookie);
  return destination;
}

export async function proxy(request: NextRequest) {
  const nonce=Buffer.from(crypto.randomUUID()).toString("base64");
  const csp=createCsp(nonce);
  const pathname=request.nextUrl.pathname;
  const ipBlockConfig=getOwnerIpBlockConfig();
  if(ipBlockConfig.enabled){
    const trustedClientIp=ipBlockConfig.configured?getTrustedClientIpAddress(request.headers):null;
    const fingerprint=trustedClientIp?getOwnerIpBlockFingerprint(trustedClientIp):null;
    if(!fingerprint){
      const unavailable=new NextResponse("Service temporarily unavailable.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
      unavailable.headers.set("Content-Security-Policy",csp);
      return unavailable;
    }
    try{
      // This trusted service-role call checks the fingerprint explicitly;
      // direct anon/authenticated Data API requests are checked by the DB hook.
      const {data:blocked,error}=await createSupabaseServiceClient().rpc("mmwr_is_ip_blocked",{p_fingerprint:fingerprint});
      if(error||typeof blocked!=="boolean")throw new Error("IP restriction lookup failed");
      if(blocked===true){
        const denied=new NextResponse("Access unavailable.",{status:403,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
        denied.headers.set("Content-Security-Policy",csp);
        return denied;
      }
    }catch{
      const unavailable=new NextResponse("Service temporarily unavailable.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
      unavailable.headers.set("Content-Security-Policy",csp);
      return unavailable;
    }
  }
  const exempt=isLocaleRoutingExempt(pathname);
  const rawLocale=pathname.split("/")[1];
  const pathLocale=localeFromSegment(rawLocale);
  // Next may re-run Proxy for the internal destination of a locale rewrite.
  // Carry the already-selected locale through that pass so an unprefixed
  // internal path is not redirected back to the localized URL indefinitely.
  const forwardedLocale=!pathLocale&&!exempt?localeFromSegment(request.headers.get("x-mmwr-locale")):null;
  const requestLocale=exempt?null:pathLocale??forwardedLocale;
  const isLocalizedRewritePass=forwardedLocale!==null;
  let internalDestination:URL|null=null;
  let redirectDestination:URL|null=null;
  let redirectStatus:307|308=307;

  if(isLocalizedRewritePass){
    // Continue through the existing route using the language chosen by the
    // first Proxy pass; createResponse preserves it for server components.
  }else if(!exempt&&requestLocale){
    const canonicalPrefix=`/${localeSegment(requestLocale)}`;
    const remainder=pathname.slice(1+rawLocale.length);
    if(rawLocale!==localeSegment(requestLocale)||remainder==="/"||(remainder.length>1&&remainder.endsWith("/"))){
      redirectDestination=request.nextUrl.clone();
      redirectDestination.pathname=`${canonicalPrefix}${remainder.length>1?remainder.replace(/\/+$/ ,""):""}`;
      redirectStatus=308;
    }else if(remainder){
      internalDestination=request.nextUrl.clone();
      internalDestination.pathname=remainder;
    }
  }else if(!exempt&&pathname!=="/"){
    const locale=preferredLocale(request.cookies.get("mmwr_locale")?.value,request.headers.get("accept-language"));
    redirectDestination=request.nextUrl.clone();
    redirectDestination.pathname=localizedPath(pathname,locale);
  }

  const createResponse=()=>{
    const requestHeaders=new Headers(request.headers);
    requestHeaders.set("x-nonce",nonce);
    requestHeaders.set("Content-Security-Policy",csp);
    requestHeaders.delete("x-mmwr-locale");
    if(requestLocale)requestHeaders.set("x-mmwr-locale",requestLocale);
    const next=internalDestination?NextResponse.rewrite(internalDestination,{request:{headers:requestHeaders}}):NextResponse.next({request:{headers:requestHeaders}});
    next.headers.set("Content-Security-Policy",csp);
    if(isPostDetailPath(pathname))next.headers.set("Cache-Control","private, no-store, max-age=0, must-revalidate");
    if(requestLocale&&request.cookies.get("mmwr_locale")?.value!==requestLocale)next.cookies.set("mmwr_locale",requestLocale,{path:"/",maxAge:31536000,sameSite:"lax",secure:request.nextUrl.protocol==="https:"});
    return next;
  };

  if(redirectDestination){
    const redirect=NextResponse.redirect(redirectDestination,redirectStatus);
    redirect.headers.set("Content-Security-Policy",csp);
    if(isPostDetailPath(pathname))redirect.headers.set("Cache-Control","private, no-store, max-age=0, must-revalidate");
    return redirect;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let response = createResponse();
  const isPrefetch=request.headers.has("next-router-prefetch")||request.headers.get("purpose")==="prefetch";
  if(isPrefetch||!url||!publishableKey)return response;

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const {name, value} of cookiesToSet) request.cookies.set(name, value);
        response = createResponse();
        for (const {name, value, options} of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Refresh claims for routing. Staff page loads and server actions also touch
  // the MMWR-only lease; database RPC/RLS checks remain the authorization gate.
  const {data:claimsData,error:claimsError}=await supabase.auth.getClaims();
  if(isStaffRoute(pathname)&&!claimsError&&claimsData?.claims){
    const lease=await touchStaffSessionFromClaims(claimsData.claims);
    if(lease==="expired"){
      try{
        await supabase.auth.signOut({scope:"local"});
      }catch{
        // The database lease still denies staff access; keep the expiry notice
        // reachable if Auth is temporarily unavailable to clear its cookie.
      }
      const destination=localizedPath("/account?staffSession=expired",requestLocale??"en");
      const redirect=NextResponse.redirect(new URL(destination,request.url));
      redirect.headers.set("Content-Security-Policy",csp);
      redirect.headers.set("Cache-Control","no-store, private");
      return copyCookies(response,redirect);
    }
    if(lease==="unavailable"){
      const unavailable=new NextResponse("Staff session verification is temporarily unavailable.",{
        status:503,
        headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store, private"},
      });
      unavailable.headers.set("Content-Security-Policy",csp);
      return copyCookies(response,unavailable);
    }
  }
  return response;
}

export const config = {
  matcher: [
    {source:"/:locale(en|zh-cn|ms)"},
    {source:"/:locale(en|zh-cn|ms)/:path*"},
    {
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      missing: [
        {type:"header",key:"next-router-prefetch"},
        {type:"header",key:"purpose",value:"prefetch"},
      ],
    },
  ],
};
