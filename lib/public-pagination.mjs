export const PUBLIC_OFFSET_MAX_PAGE = 1_000;

export function isSupportedPublicPage(page, pageSize) {
  return Number.isSafeInteger(page)
    && page >= 1
    && page <= PUBLIC_OFFSET_MAX_PAGE
    && Number.isSafeInteger(pageSize)
    && pageSize >= 1
    && pageSize <= 12;
}
