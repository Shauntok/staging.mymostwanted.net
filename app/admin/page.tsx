import type {Metadata} from "next";
import {AuthForms} from "@/components/auth/AuthForms";
import {StaffAreaStatus} from "@/components/auth/StaffAreaStatus";
import {StaffMfaGate} from "@/components/auth/StaffMfaGate";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export const metadata: Metadata = {title: "Staff area", robots: {index: false, follow: false}};

export default async function AdminPage() {
  try {
    const supabase = await createSupabaseServerClient();
    const {data: {user}} = await supabase.auth.getUser();
    if (!user) return <div className="auth-page"><AuthForms mode="signin" redirectTo="/admin"/></div>;

    const {data: staff, error: staffError} = await supabase.rpc("has_staff_identity");
    if (staffError || staff !== true) return <StaffAreaStatus denied/>;

    const {data: claimsData} = await supabase.auth.getClaims();
    const amr = claimsData?.claims?.amr;
    const hasTotpProof = Array.isArray(amr) && amr.some((entry) =>
      typeof entry === "object" && entry !== null && "method" in entry && (entry.method === "totp" || entry.method === "mfa/totp")
    );
    if (claimsData?.claims?.aal !== "aal2" || !hasTotpProof) return <div className="auth-page"><StaffMfaGate/></div>;

    const {data: recoveryCodes, error: recoveryError} = await supabase.auth.mfa.recoveryCodes.getStatus();
    if (recoveryError || !recoveryCodes || recoveryCodes.remaining < 1) return <div className="auth-page"><StaffMfaGate/></div>;
    return <StaffAreaStatus/>;
  } catch {
    return <div className="auth-page"><AuthForms mode="signin"/></div>;
  }
}
