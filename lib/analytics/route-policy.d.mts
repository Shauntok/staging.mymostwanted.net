export type AnalyticsRoute = "home" | "latest" | "hot" | "areas" | "tags" | "search" | "posts" | "vip" | "legal" | "other_public";
export function analyticsRouteForPathname(pathname: string | null | undefined): AnalyticsRoute | null;
