import {getAnalyticsClientHash} from "@/lib/analytics/client-hash";
import {hasValidPageViewConsent} from "@/lib/analytics/consent-attestation";
import {createSupabaseServiceClient} from "@/lib/supabase/service";

const responseHeaders = {"Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow, noarchive"};
const maxBodyBytes = 128;
const routeKeys = new Set(["home", "latest", "hot", "areas", "tags", "search", "posts", "vip", "legal", "other_public"]);

export const runtime = "nodejs";

async function readBoundedBody(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBodyBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, {stream: true});
    }
    return text + decoder.decode();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (process.env.FIRST_PARTY_ANALYTICS_ENABLED !== "true") return new Response(null, {status: 204, headers: responseHeaders});
  if (!hasValidPageViewConsent(request.headers.get("cookie"))) return new Response(null, {status: 204, headers: responseHeaders});

  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({error: "invalid_request"}, {status: 403, headers: responseHeaders});
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return Response.json({error: "invalid_request"}, {status: 415, headers: responseHeaders});
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) return Response.json({error: "invalid_request"}, {status: 413, headers: responseHeaders});

  let body: unknown;
  try {
    const raw = await readBoundedBody(request);
    if (raw === null) return Response.json({error: "invalid_request"}, {status: 413, headers: responseHeaders});
    body = JSON.parse(raw);
  } catch {
    return Response.json({error: "invalid_request"}, {status: 400, headers: responseHeaders});
  }

  if (!body || typeof body !== "object") return Response.json({error: "invalid_request"}, {status: 400, headers: responseHeaders});
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || typeof input.route !== "string" || !routeKeys.has(input.route)) return Response.json({error: "invalid_request"}, {status: 400, headers: responseHeaders});

  const clientHash = getAnalyticsClientHash(request.headers);
  if (!clientHash) return Response.json({error: "analytics_unavailable"}, {status: 503, headers: responseHeaders});

  try {
    const supabase = createSupabaseServiceClient();
    const {data, error} = await supabase.rpc("record_analytics_page_view", {p_route_key: input.route, p_client_hash: clientHash});
    if (error) return Response.json({error: "analytics_unavailable"}, {status: 503, headers: responseHeaders});
    if (data !== true) return Response.json({error: "rate_limited"}, {status: 429, headers: responseHeaders});
    return new Response(null, {status: 204, headers: responseHeaders});
  } catch {
    return Response.json({error: "analytics_unavailable"}, {status: 503, headers: responseHeaders});
  }
}
