import type {Metadata} from "next";
import {headers} from "next/headers";
import {AuthForms} from "@/components/auth/AuthForms";
export const metadata: Metadata = {title: "Reset password", robots: {index: false, follow: false}};
export default async function ForgotPasswordPage() { const turnstileNonce=(await headers()).get("x-nonce"); return <div className="auth-page"><AuthForms mode="forgot" turnstileNonce={turnstileNonce} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null}/></div>; }
