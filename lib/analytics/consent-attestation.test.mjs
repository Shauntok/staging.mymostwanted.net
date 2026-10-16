import assert from "node:assert/strict";
import test from "node:test";

process.env.ANALYTICS_VALID_READ_HMAC_SECRET = "local-consent-test-secret-with-at-least-32-bytes";
const {createAnalyticsConsentAttestation, hasValidPageViewConsent} = await import("./consent-attestation.ts");

const now = Math.floor(Date.now() / 1000);
const consentCookie = (analytics) => `mmwr_consent=${encodeURIComponent(JSON.stringify({analytics, advertising:false}))}`;
const signedCookie = (value) => `mmwr_analytics_consent=${value}`;

test("Page View requires both a valid server attestation and explicit Analytics consent", () => {
  assert.equal(typeof hasValidPageViewConsent, "function");
  const attestation = createAnalyticsConsentAttestation(now);
  assert.ok(attestation);

  assert.equal(hasValidPageViewConsent(`${signedCookie(attestation.value)}; ${consentCookie(true)}`, now), true);
  assert.equal(hasValidPageViewConsent(`${signedCookie(attestation.value)}; ${consentCookie(false)}`, now), false);
  assert.equal(hasValidPageViewConsent(consentCookie(true), now), false);
  assert.equal(hasValidPageViewConsent(`${signedCookie(attestation.value)}; mmwr_consent=%7Bbroken`, now), false);
  assert.equal(hasValidPageViewConsent(`${signedCookie(attestation.value)}; ${consentCookie(true)}`, now + 40000000), false);
});
