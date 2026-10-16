import type {Metadata} from "next";
import {headers} from "next/headers";
import {AuthForms} from "@/components/auth/AuthForms";
import {ProfileSetupForm} from "@/components/auth/ProfileSetupForm";
import {StaffEntryLink} from "@/components/auth/StaffEntryLink";
import {AccountDeletionControl} from "@/components/auth/AccountDeletionControl";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {safeAccountReturnTo} from "@/lib/auth-return";
import {accountAuthFormProps} from "@/lib/auth/account-auth-form-props.mjs";

export const metadata: Metadata = {title: "Account", robots: {index: false, follow: false}};

async function getAccountState() {
  try {
    const supabase = await createSupabaseServerClient();
    const {data: {user}} = await supabase.auth.getUser();
    if (!user) return null;
    const {data: profile} = await supabase.from("profiles").select("account_state,submission_email_verified_at,deletion_requested_at").eq("id", user.id).maybeSingle();
    if (!profile) return {kind: "profile_setup" as const};
    if (profile.account_state === "banned") return {kind: "banned" as const};
    if (profile.account_state === "deletion_pending") return {kind: "deletion_pending" as const, requestedAt: profile.deletion_requested_at};
    if (profile.account_state === "deletion_review_required") return {kind: "deletion_review_required" as const};
    const {data: isStaff} = await supabase.rpc("has_staff_identity");
    return {kind: "profile" as const, verified: Boolean(profile.submission_email_verified_at), isStaff: isStaff === true, active: profile.account_state === "active"};
  } catch {
    return null;
  }
}

export default async function AccountPage({searchParams}: {searchParams: Promise<{password?: string;deletion?: string;staffSession?: string;next?:string|string[]}>}) {
  const turnstileNonce=(await headers()).get("x-nonce");
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeAccountReturnTo(params.next) : "/";
  const profileReturn = typeof params.next === "string" ? next : "/account";
  const state = await getAccountState();
  if (state?.kind === "profile_setup") return <div className="auth-page"><ProfileSetupForm redirectTo={profileReturn}/></div>;
  if (state?.kind === "deletion_pending") return <div className="auth-page"><AccountDeletionControl state="deletion_pending" requestedAt={state.requestedAt} enabled={false}/></div>;
  if (state?.kind === "deletion_review_required") return <div className="auth-page"><AccountDeletionControl state="deletion_review_required" enabled={false}/></div>;
  const staffSessionExpired=params.staffSession === "expired";
  const authFormProps = accountAuthFormProps({
    accountState:state,
    passwordUpdated:params.password === "updated",
    staffSessionExpired,
    redirectTo:next,
    turnstileSiteKey:process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  });
  if (state?.kind === "profile") return <div className="auth-page"><div><AuthForms {...authFormProps} turnstileNonce={turnstileNonce}/>{state.isStaff && <StaffEntryLink/>}{state.active&&<AccountDeletionControl state="active" enabled={process.env.ACCOUNT_DELETION_ENABLED === "true"} cancelled={params.deletion === "cancelled"}/>}</div></div>;
  if (state?.kind === "banned") return <div className="auth-page"><AuthForms {...authFormProps} turnstileNonce={turnstileNonce}/></div>;
  // Missing provider configuration keeps the public recovery/sign-in surface available.
  return <div className="auth-page"><AuthForms {...authFormProps} turnstileNonce={turnstileNonce}/></div>;
}
