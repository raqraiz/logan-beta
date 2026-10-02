// Google Analytics and LiveSession are only allowed:
// - GA: on public (signed-out) pages, or after a signed-in user accepts analytics.
// - LiveSession: on public pages, or for an admin who switched on testing.
// Nothing here loads at startup on its own — AnalyticsGate decides.

const GA_ID = "G-72WMMSKMVB";
const LS_ID = "b6de6223.15b486b5";
export const ANALYTICS_CONSENT_KEY = "logan.analyticsConsent"; // "granted" | "denied"
export const LS_ADMIN_TESTING_KEY = "logan.livesessionTesting"; // "on"

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __ls?: (...args: unknown[]) => void;
    [key: string]: unknown;
  }
}

let gaLoaded = false;
let lsLoaded = false;

export const isLiveSessionLoaded = () => lsLoaded;

export function enableGA() {
  window[`ga-disable-${GA_ID}`] = false;
  if (gaLoaded) return;
  gaLoaded = true;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID);
}

/** Google's official opt-out flag: stops GA sending anything from this page. */
export function disableGA() {
  window[`ga-disable-${GA_ID}`] = true;
}

export function enableLiveSession() {
  if (lsLoaded) return;
  lsLoaded = true;
  window.__ls_namespace = "__ls";
  const f = function (...args: unknown[]) {
    (f as unknown as { store: unknown[] }).store.push(args);
  } as unknown as ((...args: unknown[]) => void) & { store: unknown[]; v: string };
  f.store = [];
  f.v = "1.1";
  window.__ls = f;
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://cdn.livesession.io/track.js";
  document.head.appendChild(s);
  window.__ls("init", LS_ID, { keystrokes: false });
  window.__ls("newPageView");
}

export const getAnalyticsConsent = () => localStorage.getItem(ANALYTICS_CONSENT_KEY);
/** Saves her choice on this device and, when signed in, to her account. */
export function setAnalyticsConsent(v: "granted" | "denied", opts: { sync?: boolean } = { sync: true }) {
  if (opts.sync !== false) {
    import("@/integrations/supabase/client").then(async ({ supabase }) => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (uid) await supabase.from("profiles").update({ analytics_consent: v }).eq("id", uid);
    });
  }
  localStorage.setItem(ANALYTICS_CONSENT_KEY, v);
  if (v === "granted") enableGA(); else disableGA();
  globalThis.dispatchEvent(new CustomEvent("logan:analytics-consent"));
}
