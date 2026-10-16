import type {Metadata} from "next";
import {headers} from "next/headers";
import {AuthForms} from "@/components/auth/AuthForms";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export const metadata: Metadata = {title: "Choose a new password", robots: {index: false, follow: false}};
async function hasSignedInUser() {
  try {
    const supabase = await createSupabaseServerClient();
    const {data: {user}} = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}
export default async function ResetPasswordPage() {
  const turnstileNonce=(await headers()).get("x-nonce");
  if (await hasSignedInUser()) return <div className="auth-page"><AuthForms mode="reset" turnstileNonce={turnstileNonce}/></div>;
  return <div className="auth-page"><AuthForms mode="forgot" turnstileNonce={turnstileNonce} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null}/></div>;
}
