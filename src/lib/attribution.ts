// First-touch attribution capture.
// Reads UTM params + referrer + landing path on first visit and persists
// them in localStorage so we can attach them to the user's profile at signup.
// Also logs every UTM-bearing visit to attribution_events keyed by a stable
// anon_id so a later signup can be matched server-side, even if localStorage
// is cleared between visit and signup.

import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "logan_attribution_v1";
const ANON_ID_KEY = "logan_anon_id_v1";

export interface Attribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  landing_path: string | null;
  landing_at: string | null;
  ref_code: string | null;
}

const truncate = (v: string | null, max = 255): string | null =>
  v ? v.slice(0, max) : null;

const generateUuid = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (very old browsers)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const getAnonId = (): string => {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = generateUuid();
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
};

/**
 * Capture attribution on app load. First-touch: once stored locally, won't
 * overwrite unless new UTM params are present in the current URL.
 * Also logs UTM-bearing visits to attribution_events so signups can be
 * matched server-side later.
 */
export const captureAttribution = (): void => {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    const hasUtm =
      params.has("utm_source") ||
      params.has("utm_medium") ||
      params.has("utm_campaign");

    const refRaw = params.get("ref");
    const refCode = refRaw ? refRaw.trim().toUpperCase().slice(0, 32) : null;
    const hasRef = !!refCode;

    const anonId = getAnonId();
    const existing = localStorage.getItem(STORAGE_KEY);

    // Log any UTM- or ref-bearing visit to the server, so even users who clear
    // localStorage between visit and signup can be backfilled.
    if ((hasUtm || hasRef) && anonId) {
      const event = {
        anon_id: anonId,
        utm_source: truncate(params.get("utm_source")),
        utm_medium: truncate(params.get("utm_medium")),
        utm_campaign: truncate(params.get("utm_campaign")),
        utm_term: truncate(params.get("utm_term")),
        utm_content: truncate(params.get("utm_content")),
        referrer: truncate(document.referrer || null, 512),
        landing_path: truncate(url.pathname + url.search, 512),
        ref_code: refCode,
      };
      supabase
        .from("attribution_events")
        .insert(event)
        .then(({ error }) => {
          if (error) console.warn("attribution event log failed:", error.message);
        });
    }

    if (existing && !hasUtm && !hasRef) return;

    const attribution: Attribution = {
      utm_source: truncate(params.get("utm_source")),
      utm_medium: truncate(params.get("utm_medium")),
      utm_campaign: truncate(params.get("utm_campaign")),
      utm_term: truncate(params.get("utm_term")),
      utm_content: truncate(params.get("utm_content")),
      referrer: truncate(document.referrer || null, 512),
      landing_path: truncate(url.pathname + url.search, 512),
      landing_at: new Date().toISOString(),
      ref_code: refCode,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // ignore — attribution is best-effort
  }
};

export const getAttribution = (): Attribution | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Attribution;
  } catch {
    return null;
  }
};

/**
 * Ask the server to backfill any missing UTM/referrer fields on the
 * authenticated user's profile. Safe to call repeatedly — server only fills
 * fields that are currently NULL.
 */
export const backfillAttribution = async (): Promise<void> => {
  if (typeof window === "undefined") return;
  try {
    const anonId = getAnonId();
    const attribution = getAttribution();
    if (!anonId && !attribution) return;
    await supabase.functions.invoke("backfill-attribution", {
      body: { anon_id: anonId || undefined, attribution: attribution || undefined },
    });
  } catch (e) {
    console.warn("backfill-attribution invoke failed:", e);
  }
};
