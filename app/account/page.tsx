import type {Metadata} from "next";
import {AuthForms} from "@/components/auth/AuthForms";
import {ProfileSetupForm} from "@/components/auth/ProfileSetupForm";
import {StaffEntryLink} from "@/components/auth/StaffEntryLink";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export const metadata: Metadata = {title: "Account", robots: {index: false, follow: false}};

export default async function AccountPage({searchParams}: {searchParams: Promise<{password?: string}>}) {
  const params = await searchParams;
  try {
    const supabase = await createSupabaseServerClient();
    const {data: {user}} = await supabase.auth.getUser();
    if (user) {
      const {data: profile} = await supabase.from("profiles").select("account_state,submission_email_verified_at").eq("id", user.id).maybeSingle();
      if (profile?.account_state === "banned") return <div className="auth-page"><AuthForms mode="signin" passwordUpdated={params.password === "updated"}/></div>;
      if (profile) {
        const {data: isStaff} = await supabase.rpc("has_staff_identity");
        return <div className="auth-page"><div><AuthForms mode="resend" signedIn verified={Boolean(profile.submission_email_verified_at)}/>{isStaff === true && <StaffEntryLink/>}</div></div>;
      }
      return <div className="auth-page"><ProfileSetupForm/></div>;
    }
  } catch { /* The public pages remain viewable when providers are not configured. */ }
  return <div className="auth-page"><AuthForms mode="signin" passwordUpdated={params.password === "updated"}/></div>;
}
