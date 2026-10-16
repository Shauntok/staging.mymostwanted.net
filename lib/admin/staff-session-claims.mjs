const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isEligibleStaffSessionClaims(claimsValue) {
  if (!claimsValue || typeof claimsValue !== "object" || Array.isArray(claimsValue)) return false;
  const claims = claimsValue;
  const userId = typeof claims.sub === "string" ? claims.sub : "";
  const sessionId = typeof claims.session_id === "string" ? claims.session_id : "";
  const amr = Array.isArray(claims.amr) ? claims.amr : [];
  const hasTotpProof = amr.some((entry) => entry !== null && typeof entry === "object"
    && "method" in entry && ((entry.method === "totp") || (entry.method === "mfa/totp")));

  return claims.aal === "aal2" && hasTotpProof && uuidPattern.test(userId) && uuidPattern.test(sessionId);
}
