"use client";

import {useEffect, useRef, useState} from "react";
import type {RefObject} from "react";
import {copy} from "@/lib/i18n/catalog";
import {usePreferences} from "@/components/shell/PreferencesProvider";

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalFocus(
  active: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onDismiss?: () => void,
  restoreFocusRef?: RefObject<HTMLElement | null>,
) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (initialFocusRef.current ?? dialog).focus();

    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => element.getClientRects().length > 0 && !element.closest("[inert]"));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismissRef.current?.();
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) (getFocusable()[0] ?? dialog).focus();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      document.body.style.overflow = previousOverflow;
      const target = previousFocus?.isConnected && !previousFocus.closest("[inert]")
        ? previousFocus : restoreFocusRef?.current;
      if (target?.isConnected && !target.closest("[inert]")) target.focus();
    };
  }, [active, dialogRef, initialFocusRef, restoreFocusRef]);
}

export function ConsentOverlays({restoreFocusRef}: {restoreFocusRef: RefObject<HTMLElement | null>}) {
  const preferences = usePreferences();
  const t = copy[preferences.locale];
  const [draft, setDraft] = useState(preferences.consent);
  const ageOpen = preferences.hydrated && !preferences.ageApproved;
  const consentOpen = preferences.hydrated && preferences.ageApproved && preferences.consentOpen;
  const ageDialogRef = useRef<HTMLDivElement>(null);
  const consentDialogRef = useRef<HTMLDivElement>(null);
  const adultButtonRef = useRef<HTMLButtonElement>(null);
  const ageTitleRef = useRef<HTMLHeadingElement>(null);
  const consentCloseRef = useRef<HTMLButtonElement>(null);
  const ageFocusRef = preferences.ageDenied ? ageTitleRef : adultButtonRef;

  useModalFocus(ageOpen, ageDialogRef, ageFocusRef);
  useModalFocus(consentOpen, consentDialogRef, consentCloseRef, preferences.closeConsent, restoreFocusRef);
  useEffect(() => setDraft(preferences.consent), [preferences.consent, preferences.consentOpen]);
  useEffect(() => {
    if (ageOpen && preferences.ageDenied) ageTitleRef.current?.focus();
  }, [ageOpen, preferences.ageDenied]);

  if (!preferences.hydrated) return null;
  if (!preferences.ageApproved) return <div ref={ageDialogRef} className="overlay age-overlay" role="dialog" aria-modal="true" aria-labelledby="age-title" aria-describedby="age-description" tabIndex={-1}>
    <section className="consent-card age-card"><div className="mini-brand"><span className="brand-mark" aria-hidden="true">M</span><span>MMWR</span></div><p className="eyebrow">MALAYSIA MOST WANTED RANKING</p><h1 ref={ageTitleRef} id="age-title" tabIndex={-1}>{t.ageTitle}</h1><p id="age-description" className="muted">{preferences.ageDenied ? t.ageDenied : t.ageBody}</p>{!preferences.ageDenied && <div className="consent-actions"><button ref={adultButtonRef} type="button" className="button button-primary" onClick={preferences.approveAge}>{t.adult}</button><button type="button" className="button button-quiet" onClick={preferences.denyAge}>{t.minor}</button></div>}<p className="fine-print">18+ · {t.guidelines}</p></section>
  </div>;
  if (!preferences.consentOpen) return null;
  return <div ref={consentDialogRef} className="overlay consent-overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="consent-description" tabIndex={-1} onClick={preferences.closeConsent}>
    <section className="consent-card consent-panel" onClick={(event) => event.stopPropagation()}><button ref={consentCloseRef} type="button" className="dialog-close" onClick={preferences.closeConsent} aria-label={t.close}>×</button><p className="eyebrow">MMWR · {t.privacy}</p><h2 id="consent-title">{t.consentTitle}</h2><p id="consent-description" className="muted">{t.consentBody}</p><div className="consent-options"><label><span><strong>{t.necessary}</strong><small>{t.necessaryNote}</small></span><input type="checkbox" checked disabled aria-label={t.necessary}/></label><label><span><strong>{t.analytics}</strong><small>{t.analyticsNote}</small></span><input type="checkbox" checked={draft.analytics} onChange={(event) => setDraft({...draft, analytics: event.target.checked})}/></label><label><span><strong>{t.advertising}</strong><small>{t.advertisingNote}</small></span><input type="checkbox" checked={draft.advertising} onChange={(event) => setDraft({...draft, advertising: event.target.checked})}/></label></div><div className="consent-actions"><button type="button" className="button button-primary" onClick={() => preferences.saveConsent({analytics: true, advertising: true})}>{t.acceptAll}</button><button type="button" className="button button-outline" onClick={() => preferences.saveConsent({analytics: false, advertising: false})}>{t.necessaryOnly}</button><button type="button" className="button button-quiet" onClick={() => preferences.saveConsent(draft)}>{t.save}</button></div></section>
  </div>;
}
