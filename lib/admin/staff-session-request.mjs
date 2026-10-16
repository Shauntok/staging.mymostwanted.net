export function getStaffSessionRequestError({
  origin,
  expectedOrigin,
  search,
  hasBody,
  hasContentType,
  contentLength,
}) {
  if (!origin || origin !== expectedOrigin) return "origin_rejected";
  if (search || hasBody || hasContentType || (contentLength !== null && contentLength !== "0")) {
    return "body_not_allowed";
  }
  return null;
}
