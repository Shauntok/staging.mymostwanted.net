import type {Metadata} from "next";
import {AuthForms} from "@/components/auth/AuthForms";
import {safeAccountReturnTo} from "@/lib/auth-return";
export const metadata: Metadata = {title: "Create account", robots: {index: false, follow: false}};
export default async function SignupPage({searchParams}:{searchParams:Promise<{next?:string|string[]}>}) { const params=await searchParams; const redirectTo=typeof params.next==="string"?safeAccountReturnTo(params.next):"/"; return <div className="auth-page"><AuthForms mode="signup" redirectTo={redirectTo} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null}/></div>; }
