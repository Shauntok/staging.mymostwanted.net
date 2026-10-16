const labels = {
  "zh-CN": "帖子分页导航",
  en: "Post pagination",
  ms: "Navigasi halaman hantaran",
};

export function getPaginationNavigationLabel(locale) {
  return labels[locale] ?? labels.en;
}

export function shouldRenderPublicPagination({status, hasResults, hasBasePath, page, hasNextPage}) {
  return status === "ready" && hasResults && hasBasePath && (page > 1 || hasNextPage);
}
