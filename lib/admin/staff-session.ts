import "server-only";

import {createSupabaseServiceClient} from "@/lib/supabase/service";
import {isEligibleStaffSessionClaims} from "./staff-session-claims.mjs";

export type StaffSessionTouchResult = "active" | "expired" | "not_staff" | "unavailable";

export async function touchStaffSessionFromClaims(claimsValue: unknown): Promise<StaffSessionTouchResult> {
  if (!isEligibleStaffSessionClaims(claimsValue)) return "not_staff";
  const claims = claimsValue as Record<string, unknown>;
  const userId = claims.sub as string;
  const sessionId = claims.session_id as string;

  try {
    const {data, error} = await createSupabaseServiceClient().rpc("mmwr_touch_staff_session", {
      p_user_id: userId,
      p_session_id: sessionId,
      p_has_aal2_totp: true,
    });
    if (error) return "unavailable";
    if (data === "started" || data === "active") return "active";
    if (data === "expired") return "expired";
    if (data === "not_staff") return "not_staff";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}
