import {NextResponse, type NextRequest} from "next/server";
import {touchStaffSessionFromClaims} from "@/lib/admin/staff-session";
import {getStaffSessionRequestError} from "@/lib/admin/staff-session-request.mjs";
import {createSupabaseServerClient} from "@/lib/supabase/server";

function json(status: number, code: string) {
  return NextResponse.json({error: code}, {
    status,
    headers: {"Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow, noarchive"},
  });
}

export async function POST(request: NextRequest) {
  const requestError = getStaffSessionRequestError({
    origin: request.headers.get("origin"),
    expectedOrigin: request.nextUrl.origin,
    search: request.nextUrl.search,
    hasBody: request.body !== null,
    hasContentType: request.headers.has("content-type"),
    contentLength: request.headers.get("content-length"),
  });
  if (requestError === "origin_rejected") return json(403, requestError);
  if (requestError) return json(400, requestError);

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
    const {data, error} = await supabase.auth.getClaims();
    if (error || !data?.claims) return json(401, "session_unavailable");

    const result = await touchStaffSessionFromClaims(data.claims);
    if (result === "active") return new NextResponse(null, {status: 204, headers: {"Cache-Control": "no-store, private"}});
    if (result === "expired") {
      try {
        await supabase.auth.signOut({scope: "local"});
      } catch {
        // The expired DB lease still denies staff access if Auth is unavailable.
      }
      return json(401, "staff_session_expired");
    }
    if (result === "not_staff") return json(403, "staff_required");
    return json(503, "session_service_unavailable");
  } catch {
    return json(503, "session_service_unavailable");
  }
}

export function GET() {
  return json(405, "method_not_allowed");
}
