"use server";

import {createHash, randomBytes} from "node:crypto";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {createSupabaseServiceClient} from "@/lib/supabase/service";
import {sendSubmissionEmailVerification} from "@/lib/email/verification";
import {safeAccountReturnTo} from "@/lib/auth-return";
import {verifyTurnstile} from "@/lib/security/turnstile";
import {resendVerificationEmail} from "@/lib/auth/email-verification-resend.mjs";

export type AuthActionState = {key: string; ok?: boolean};
const emptyState: AuthActionState = {key: ""};

function value(formData: FormData, key: string, maxLength: number) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, maxLength) : "";
}

function rawValue(formData: FormData, key: string, maxLength: number) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.slice(0, maxLength) : "";
}

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function makeAndSendVerification(userId: string, address: string) {
  const token = randomBytes(32).toString("hex");
  const serviceClient = createSupabaseServiceClient();
  const {data, error} = await serviceClient.rpc("create_my_email_verification_for_user", {
    p_user_id: userId,
    p_email: address,
    p_token_hash: `\\x${hashToken(token)}`,
  });
  if (error || data !== true) return false;
  await sendSubmissionEmailVerification(address, token);
  return true;
}

export async function signInAction(_state: AuthActionState = emptyState, formData: FormData): Promise<AuthActionState> {
  const email = value(formData, "email", 254).toLowerCase();
  const password = rawValue(formData, "password", 256);
  const requestedDestination = value(formData, "next", 100);
  const destination = requestedDestination ? safeAccountReturnTo(requestedDestination) : "/";
  if (!email || !password) return {key: "invalidCredentials"};
  const captchaToken = value(formData, "turnstileToken", 2048);
  if (!captchaToken) return {key: "captchaInvalid"};

  try {
    const supabase = await createSupabaseServerClient();
    const {error} = await supabase.auth.signInWithPassword({email, password, options: {captchaToken}});
    if (error) return {key: "invalidCredentials"};
    const {data: {user}} = await supabase.auth.getUser();
    if (!user) return {key: "signInUnavailable"};
    const {data: profile} = await supabase.from("profiles").select("account_state").eq("id", user.id).maybeSingle();
    if (!profile) return {key: "profileSetupRequired"};
    if (profile.account_state === "banned") {
      await supabase.auth.signOut();
      return {key: "accountRestricted"};
    }
  } catch {
    return {key: "serviceUnavailable"};
  }
  redirect(destination);
}

export async function signUpAction(_state: AuthActionState = emptyState, formData: FormData): Promise<AuthActionState> {
  const username = value(formData, "username", 40);
  const email = value(formData, "email", 254).toLowerCase();
  const password = rawValue(formData, "password", 256);
  const requestedDestination = value(formData, "next", 100);
  const destination = requestedDestination ? safeAccountReturnTo(requestedDestination) : "/account";
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return {key: "usernameFormat"};
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 10) return {key: "signupFormat"};
  const captchaToken = value(formData, "turnstileToken", 2048);
  if (!captchaToken) return {key: "captchaInvalid"};

  try {
    const supabase = await createSupabaseServerClient();
    const {data, error} = await supabase.auth.signUp({email, password, options: {captchaToken}});
    if (error || !data.user || !data.session) return {key: "signupUnavailable"};

    const {data: initialized, error: profileError} = await supabase.rpc("initialize_my_profile", {p_username: username});
    if (profileError || initialized !== true) {
      return {key: "profileSetupRequired"};
    }

    try {
      if (!data.user.email || !(await makeAndSendVerification(data.user.id, data.user.email))) {
        return {key: "accountCreatedEmailPending", ok: true};
      }
    } catch {
      return {key: "accountCreatedEmailPending", ok: true};
    }
    return {key: destination.startsWith("/posts/") ? "accountCreatedVerifyReturn" : "accountCreatedVerify", ok: true};
  } catch {
    return {key: "serviceUnavailable"};
  }
}

export async function initializeProfileAction(_state: AuthActionState = emptyState, formData: FormData): Promise<AuthActionState> {
  const username = value(formData, "username", 40);
  const requestedDestination = value(formData, "next", 100);
  const destination = requestedDestination ? safeAccountReturnTo(requestedDestination) : "/account";
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return {key: "usernameFormat"};
  try {
    const supabase = await createSupabaseServerClient();
    const {data: {user}} = await supabase.auth.getUser();
    if (!user) return {key: "signInFirst"};
    const {data, error} = await supabase.rpc("initialize_my_profile", {p_username: username});
    if (error || data !== true) return {key: "usernameUnavailable"};
  } catch {
    return {key: "serviceUnavailable"};
  }
  redirect(destination);
}

export async function requestEmailVerificationAction(_state: AuthActionState = emptyState, formData: FormData): Promise<AuthActionState> {
  return resendVerificationEmail(value(formData, "turnstileToken", 2048), {
    verifyTurnstile,
    authenticate:async()=>{
      const supabase = await createSupabaseServerClient();
      const {data: {user}} = await supabase.auth.getUser();
      if (!user?.id || !user.email) return {user:user?.id?{id:user.id,email:user.email??null}:null,profile:null};
      const {data: profile} = await supabase.from("profiles").select("submission_email_verified_at,account_state").eq("id", user.id).maybeSingle();
      return {
        user:{id:user.id,email:user.email},
        profile:profile?{accountState:profile.account_state,verifiedAt:profile.submission_email_verified_at}:null,
      };
    },
    issueAndSend:makeAndSendVerification,
  });
}

export async function verifyEmailAction(_state: AuthActionState = emptyState, formData: FormData): Promise<AuthActionState> {
  const token = value(formData, "token", 64);
  if (!/^[a-f0-9]{64}$/.test(token)) return {key: "verificationInvalid"};
  try {
    const supabase = await createSupabaseServerClient();
    const {data, error} = await supabase.rpc("verify_submission_email", {p_token_hash: `\\x${hashToken(token)}`});
    if (error || data !== true) return {key: "verificationInvalid"};
    return {key: "emailVerified", ok: true};
  } catch {
    return {key: "serviceUnavailable"};
  }
}

export async function requestPasswordResetAction(_state: AuthActionState = emptyState, formData: FormData): Promise<AuthActionState> {
  const email = value(formData, "email", 254).toLowerCase();
  if (!email) return {key: "resetSentGeneric", ok: true};
  const captchaToken = value(formData, "turnstileToken", 2048);
  if (!captchaToken) return {key: "captchaInvalid"};
  try {
    const supabase = await createSupabaseServerClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (siteUrl) await supabase.auth.resetPasswordForEmail(email, {redirectTo: `${siteUrl}/auth/callback?next=/account/reset-password`, captchaToken});
  } catch {
    // Keep the response indistinguishable to reduce account enumeration.
  }
  return {key: "resetSentGeneric", ok: true};
}

export async function setNewPasswordAction(_state: AuthActionState = emptyState, formData: FormData): Promise<AuthActionState> {
  const password = rawValue(formData, "password", 256);
  if (password.length < 10) return {key: "passwordTooShort"};
  try {
    const supabase = await createSupabaseServerClient();
    const {data: {user}} = await supabase.auth.getUser();
    if (!user) return {key: "resetLinkInvalid"};
    const {error} = await supabase.auth.updateUser({password});
    if (error) return {key: "passwordUpdateFailed"};
    await supabase.auth.signOut();
  } catch {
    return {key: "serviceUnavailable"};
  }
  redirect("/account?password=updated");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/account");
}

export async function requestAccountDeletionAction(_state: AuthActionState = emptyState, formData: FormData): Promise<AuthActionState> {
  if (process.env.ACCOUNT_DELETION_ENABLED !== "true") return {key:"deletionUnavailable"};
  if (formData.get("confirmDeletion") !== "yes") return {key:"deletionConfirmationRequired"};
  try {
    const supabase = await createSupabaseServerClient();
    const {data:{user}} = await supabase.auth.getUser();
    if (!user) return {key:"signInFirst"};
    const {data,error} = await supabase.rpc("request_my_account_deletion");
    if (error || data !== true) return {key:"deletionRequestFailed"};
  } catch {
    return {key:"serviceUnavailable"};
  }
  redirect("/account?deletion=requested");
}

export async function cancelAccountDeletionAction(_state: AuthActionState = emptyState, _formData: FormData): Promise<AuthActionState> {
  try {
    const supabase = await createSupabaseServerClient();
    const {data:{user}} = await supabase.auth.getUser();
    if (!user) return {key:"signInFirst"};
    const {data,error} = await supabase.rpc("cancel_my_account_deletion");
    if (error || data !== true) return {key:"deletionCancelFailed"};
  } catch {
    return {key:"serviceUnavailable"};
  }
  redirect("/account?deletion=cancelled");
}
