import "server-only";

import {createHmac} from "node:crypto";
import {isIP} from "node:net";

const supportedTrustedHeaders = new Set(["x-vercel-forwarded-for", "cf-connecting-ip", "x-mmwr-client-ip"]);

export function getAnalyticsClientHash(headers: Headers): string | null {
  const secret = process.env.ANALYTICS_RATE_LIMIT_HMAC_SECRET;
  const trustedHeader = process.env.ANALYTICS_TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (!trustedHeader || !supportedTrustedHeaders.has(trustedHeader)) return null;
  const rawAddress = headers.get(trustedHeader);
  const address = rawAddress?.split(",", 1)[0]?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32 || !address || isIP(address) === 0) return null;
  return createHmac("sha256", secret).update("mmwr:analytics-page-view:").update(address).digest("hex");
}
