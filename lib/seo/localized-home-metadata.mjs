const localeSegments = new Set(["en", "zh-cn", "ms"]);
const languageSegments = {
  "en-MY": "en",
  "zh-CN": "zh-cn",
  "ms-MY": "ms",
  "x-default": "en",
};

const noIndex = {robots: {index: false, follow: false}};

/** Build homepage canonical/hreflang only from a validated public HTTPS origin. */
export function localizedHomeMetadata(localeSegment, origin) {
  if (!localeSegments.has(localeSegment) || typeof origin !== "string") return noIndex;

  let base;
  try {
    base = new URL(origin);
  } catch {
    return noIndex;
  }
  if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
    return noIndex;
  }

  const canonical = new URL(`/${localeSegment}`, base).toString();
  const languages = Object.fromEntries(
    Object.entries(languageSegments).map(([language, segment]) => [language, new URL(`/${segment}`, base).toString()]),
  );

  return {alternates: {canonical, languages}, robots: {index: true, follow: true}};
}
