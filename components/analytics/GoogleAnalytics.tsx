"use client";

import Script from "next/script";
import {usePathname} from "next/navigation";
import {useEffect, useRef, useState} from "react";
import {usePreferences} from "@/components/shell/PreferencesProvider";
import {analyticsRouteForPathname} from "@/lib/analytics/route-policy.mjs";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
const validMeasurementId = /^G-[A-Z0-9]{6,20}$/.test(measurementId);
const ga4Enabled = process.env.NEXT_PUBLIC_GA4_ENABLED === "true";
const firstPartyEnabled = process.env.NEXT_PUBLIC_FIRST_PARTY_ANALYTICS_ENABLED === "true";
const deniedConsent = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};

export function GoogleAnalytics() {
  const pathname = usePathname();
  const {hydrated, ageApproved, consent} = usePreferences();
  const route = analyticsRouteForPathname(pathname);
  const publicPage = hydrated && ageApproved && consent.analytics && route !== null;
  const googleAllowed = ga4Enabled && validMeasurementId && publicPage;
  const firstPartyAllowed = firstPartyEnabled && publicPage;
  const [scriptEnabled, setScriptEnabled] = useState(false);
  const configuredId = useRef("");
  const lastPageView = useRef("");

  useEffect(() => {
    if (!ga4Enabled || !validMeasurementId) {
      // Keep <Script> unmounted unless GA4 is explicitly enabled and configured.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- This synchronizes the consent-gated script mount state.
      setScriptEnabled(false);
      return;
    }

    const disableFlag = `ga-disable-${measurementId}`;
    if (typeof window.gtag !== "function") {
      window.dataLayer = window.dataLayer ?? [];
      window.gtag = (...args) => window.dataLayer?.push(args);
    }

    if (!googleAllowed) {
      Object.assign(window, {[disableFlag]: true});
      window.gtag("consent", "update", deniedConsent);
      setScriptEnabled(false);
      return;
    }

    Object.assign(window, {[disableFlag]: false});
    window.gtag("consent", "default", deniedConsent);
    window.gtag("consent", "update", {...deniedConsent, analytics_storage: "granted"});
    if (configuredId.current !== measurementId) {
      window.gtag("js", new Date());
      window.gtag("config", measurementId, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
      configuredId.current = measurementId;
    }
    setScriptEnabled(true);
  }, [googleAllowed]);

  useEffect(() => {
    if (!publicPage || !pathname || !route) {
      lastPageView.current = "";
      return;
    }
    if (lastPageView.current === pathname) return;
    lastPageView.current = pathname;
    if (googleAllowed) {
      const pagePath = route === "home" ? "/" : `/${route}`;
      window.gtag?.("event", "page_view", {
        page_title: route,
        page_location: `${window.location.origin}${pagePath}`,
        page_path: pagePath,
      });
    }
    if (firstPartyAllowed) {
      void fetch("/api/analytics/page-view", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({route}),
        cache: "no-store",
        credentials: "same-origin",
        referrerPolicy: "no-referrer",
        keepalive: true,
      }).catch(() => undefined);
    }
  }, [firstPartyAllowed, googleAllowed, pathname, publicPage, route]);

  if (!googleAllowed || !scriptEnabled) return null;
  return <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive"/>;
}
