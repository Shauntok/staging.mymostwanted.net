import type {Metadata} from "next";
import {AuthForms} from "@/components/auth/AuthForms";
import {createSupabaseServerClient} from "@/lib/supabase/server";
export const metadata: Metadata = {title: "Choose a new password", robots: {index: false, follow: false}};
export default async function ResetPasswordPage() {
  try {
    const supabase = await createSupabaseServerClient();
    const {data: {user}} = await supabase.auth.getUser();
    if (user) return <div className="auth-page"><AuthForms mode="reset"/></div>;
  } catch { /* Unconfigured Development shows the recovery instructions below. */ }
  return <div className="auth-page"><AuthForms mode="forgot"/></div>;
}
