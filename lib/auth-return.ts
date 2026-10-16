const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function safePostReturnTo(value: string | undefined | null): string | null {
  if (!value || value.length > 64) return null;
  const match = /^\/posts\/([0-9a-f-]{36})(?:#full-content)?$/i.exec(value);
  if (!match || !uuidPattern.test(match[1])) return null;
  return `/posts/${match[1].toLowerCase()}#full-content`;
}

export function safeAccountReturnTo(value: string | undefined | null): string {
  if (value === "/admin" || value === "/submissions" || value === "/report") return value;
  return safePostReturnTo(value) ?? "/";
}
