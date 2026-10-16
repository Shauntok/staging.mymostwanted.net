import type {Metadata} from "next";
import {AuthForms} from "@/components/auth/AuthForms";
import {SubmissionStatusList, type SubmissionStatusRow} from "@/components/submissions/SubmissionStatusList";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My submissions",
  description: "View the status and review response for your MMWR submissions.",
  robots: {index:false, follow:false},
};

async function getSubmissionPageState() {
  try {
    const supabase = await createSupabaseServerClient();
    const {data:{user}, error:userError} = await supabase.auth.getUser();
    if (userError) return {kind: "unavailable" as const};
    if (!user) return {kind: "signin" as const};

    const {data, error} = await supabase.rpc("my_submission_statuses");
    if (error || !Array.isArray(data)) return {kind: "unavailable" as const};
    return {kind: "ready" as const, rows: data as SubmissionStatusRow[]};
  } catch {
    return {kind: "unavailable" as const};
  }
}

export default async function SubmissionsPage() {
  const state = await getSubmissionPageState();
  if (state.kind === "signin") return <div className="auth-page"><AuthForms mode="signin" redirectTo="/submissions" turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null}/></div>;
  if (state.kind === "unavailable") return <div className="auth-page"><SubmissionStatusList rows={[]} unavailable/></div>;
  return <SubmissionStatusList rows={state.rows}/>;
}
