"use client";

import {createBrowserClient} from "@supabase/ssr";

let activityTrackingInstalled = false;
let latestGestureAt = 0;
let gestureRevision = 0;
let touchedGestureRevision = 0;
let activityRequest: Promise<void> | null = null;
let activityTimer: ReturnType<typeof setTimeout> | null = null;
let lastActivityAttemptAt = 0;
let lastActivityAttemptSucceeded = false;
const activityThrottleMs = 15_000;

function isStaffDashboardPath(pathname: string) {
  return /^(?:\/(?:en|zh-cn|ms))?\/admin(?:\/|$)/.test(pathname);
}

function installStaffActivityTracking() {
  if (activityTrackingInstalled || typeof window === "undefined") return;
  activityTrackingInstalled = true;
  const markActivity = (event: Event) => {
    if (!event.isTrusted || document.visibilityState !== "visible"
      || !isStaffDashboardPath(window.location.pathname)) return;
    latestGestureAt = Date.now();
    gestureRevision += 1;
    scheduleStaffActivity();
  };
  window.addEventListener("pointerdown", markActivity, {capture: true, passive: true});
  window.addEventListener("keydown", markActivity, {capture: true});
  window.addEventListener("touchstart", markActivity, {capture: true, passive: true});
  window.addEventListener("wheel", markActivity, {capture: true, passive: true});
}

function scheduleStaffActivity() {
  if (activityTimer !== null) return;
  // A one-shot timer follows an actual gesture; no unattended heartbeat runs.
  const delay = Math.max(250, activityThrottleMs - (Date.now() - lastActivityAttemptAt));
  activityTimer = setTimeout(() => {
    activityTimer = null;
    // REST calls still await this check and surface failures before proceeding.
    void ensureStaffActivity().catch(() => {});
  }, delay);
}

async function ensureStaffActivity() {
  const now = Date.now();
  if (!isStaffDashboardPath(window.location.pathname) || document.visibilityState !== "visible"
    || gestureRevision === 0 || now - latestGestureAt > 45_000
    || gestureRevision <= touchedGestureRevision) return;
  if (activityRequest) return activityRequest;
  if (lastActivityAttemptAt > 0 && now - lastActivityAttemptAt < activityThrottleMs) {
    if (!lastActivityAttemptSucceeded) throw new Error("Staff session could not be verified.");
    // The last successful renewal covers this short window. Preserve the
    // newer gesture for a trailing renewal instead of bypassing the throttle.
    scheduleStaffActivity();
    return;
  }

  const revisionBeingTouched = gestureRevision;
  lastActivityAttemptAt = now;
  lastActivityAttemptSucceeded = false;
  activityRequest = (async () => {
    const response = await window.fetch("/api/admin/staff-session-activity", {
      method: "POST",
      credentials: "same-origin",
      headers: {Accept: "application/json"},
    });
    if (response.status === 401) {
      const localePrefix = window.location.pathname.match(/^\/(en|zh-cn|ms)(?=\/|$)/)?.[0] ?? "";
      // A full same-origin navigation clears any stale staff dashboard state.
      window.location.assign(new URL(`${localePrefix}/account?staffSession=expired`, window.location.origin).toString());
      throw new Error("The staff session has expired.");
    }
    if (!response.ok) throw new Error("Staff session could not be verified.");
    lastActivityAttemptSucceeded = true;
    touchedGestureRevision = Math.max(touchedGestureRevision, revisionBeingTouched);
  })().finally(() => {
    activityRequest = null;
    if (gestureRevision > revisionBeingTouched && document.visibilityState === "visible"
      && isStaffDashboardPath(window.location.pathname) && Date.now() - latestGestureAt <= 45_000) {
      scheduleStaffActivity();
    }
  });
  return activityRequest;
}

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Supabase is not configured for this environment.");
  installStaffActivityTracking();
  const supabaseOrigin = new URL(url).origin;
  const staffAwareFetch: typeof fetch = async (input, init) => {
    if (typeof window === "undefined") return fetch(input, init);
    const inputUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const requestUrl = new URL(inputUrl, window.location.href);
    if (isStaffDashboardPath(window.location.pathname) && requestUrl.origin === supabaseOrigin
      && requestUrl.pathname.startsWith("/rest/v1/")) {
      await ensureStaffActivity();
    }
    return window.fetch(input, init);
  };
  return createBrowserClient(url, publishableKey, {
    auth: {experimental: {recoveryCodes: true}},
    global: {fetch: staffAwareFetch},
  });
}
