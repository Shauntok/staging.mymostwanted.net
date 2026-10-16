export function getPaginationNavigationLabel(locale: "zh-CN" | "en" | "ms"): string;
export function shouldRenderPublicPagination(options: {
  status: "ready" | "empty" | "unavailable";
  hasResults: boolean;
  hasBasePath: boolean;
  page: number;
  hasNextPage: boolean;
}): boolean;
