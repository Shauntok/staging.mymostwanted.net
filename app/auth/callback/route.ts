import {NextResponse, type NextRequest} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const destination = request.nextUrl.searchParams.get("next");
  // Do not accept arbitrary redirect URLs from a query parameter.
  const safePath = destination === "/account/reset-password" ? destination : "/account";
  if (!code) return NextResponse.redirect(new URL("/account?reset=invalid", request.url));
  try {
    const supabase = await createSupabaseServerClient();
    const {error} = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safePath, request.url));
  } catch { /* No provider configuration or invalid recovery code. */ }
  return NextResponse.redirect(new URL("/account?reset=invalid", request.url));
}
