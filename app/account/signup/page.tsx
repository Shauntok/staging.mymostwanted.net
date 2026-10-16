import type {Metadata} from "next";
import {headers} from "next/headers";
import {AuthForms} from "@/components/auth/AuthForms";
import {safeAccountReturnTo} from "@/lib/auth-return";
export const metadata: Metadata = {title: "Create account", robots: {index: false, follow: false}};
export default async function SignupPage({searchParams}:{searchParams:Promise<{next?:string|string[]}>}) { const [params,requestHeaders]=await Promise.all([searchParams,headers()]); const redirectTo=typeof params.next==="string"?safeAccountReturnTo(params.next):"/"; return <div className="auth-page"><AuthForms mode="signup" redirectTo={redirectTo} turnstileNonce={requestHeaders.get("x-nonce")} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null}/></div>; }
