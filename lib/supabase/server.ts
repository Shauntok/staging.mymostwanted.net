import "server-only";

import {createServerClient} from "@supabase/ssr";
import {isIP} from "node:net";
import {cookies} from "next/headers";
import type {TrustedClientIpHeader} from "@/lib/security/owner-ip-blocks";

type TrustedPostgrestAddress = {
  header: TrustedClientIpHeader;
  address: string;
};

export async function createSupabaseServerClient(options: {trustedPostgrestAddress?: TrustedPostgrestAddress} = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Supabase is not configured for this environment.");

  const cookieStore = await cookies();
  const {trustedPostgrestAddress} = options;
  const global = trustedPostgrestAddress && isIP(trustedPostgrestAddress.address)
    ? {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          const inputUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          let requestUrl: URL;
          try {
            requestUrl = new URL(inputUrl, url);
          } catch {
            return fetch(input, init);
          }
          // Forward the ingress-verified address only to Supabase PostgREST.
          // Auth, Storage and other endpoints never receive the raw address.
          if (requestUrl.origin !== new URL(url).origin || !requestUrl.pathname.includes("/rest/v1/")) {
            return fetch(input, init);
          }
          const request = new Request(input, init);
          request.headers.set(trustedPostgrestAddress.header, trustedPostgrestAddress.address);
          return fetch(request);
        },
      }
    : undefined;
  return createServerClient(url, publishableKey, {
    auth: {experimental: {recoveryCodes: true}},
    ...(global ? {global} : {}),
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
