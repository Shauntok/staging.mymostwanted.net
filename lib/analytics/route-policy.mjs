const localeSegments = new Set(["en", "zh-cn", "ms"]);
const excludedPrefixes = ["account", "admin", "auth", "submit", "submissions", "report", "api"];
const publicRouteKeys = ["latest", "hot", "areas", "tags", "search", "vip"];
const legalRouteKeys = new Set(["rules", "privacy", "terms", "legal"]);

export function analyticsRouteForPathname(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return null;

  const rawPath = pathname.split(/[?#]/, 1)[0].replace(/%2f/gi, "/");
  let segments;
  try {
    segments = rawPath.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment).toLowerCase());
  } catch {
    return null;
  }

  if (segments.length > 0 && localeSegments.has(segments[0])) segments = segments.slice(1);
  const root = segments[0];
  if (!root) return "home";
  if (excludedPrefixes.some((prefix) => root === prefix || root.startsWith(`${prefix};`))) return null;
  if (publicRouteKeys.includes(root)) return root;
  if (root === "posts") return "posts";
  if (legalRouteKeys.has(root)) return "legal";
  return "other_public";
}
