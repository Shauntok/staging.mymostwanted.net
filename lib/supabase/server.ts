import "server-only";

import {createServerClient} from "@supabase/ssr";
import {cookies} from "next/headers";

export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Supabase is not configured for this environment.");

  const cookieStore = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try {
          for (const {name, value, options} of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot write cookies. The Next.js proxy refreshes
          // auth cookies on requests; actions and route handlers can write them.
        }
      },
    },
  });
}
