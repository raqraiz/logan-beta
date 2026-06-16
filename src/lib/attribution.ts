// First-touch attribution capture.
// Reads UTM params + referrer + landing path on first visit and persists
// them in localStorage so we can attach them to the user's profile at signup.

const STORAGE_KEY = "logan_attribution_v1";

export interface Attribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  landing_path: string | null;
  landing_at: string | null;
}

const truncate = (v: string | null, max = 255): string | null =>
  v ? v.slice(0, max) : null;

/**
 * Capture attribution on app load. First-touch: once stored, won't overwrite
 * unless new UTM params are present in the current URL.
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

    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && !hasUtm) return;

    // If new UTMs arrive (e.g. user clicks a different campaign link),
    // overwrite with the more recent campaign context.
    const attribution: Attribution = {
      utm_source: truncate(params.get("utm_source")),
      utm_medium: truncate(params.get("utm_medium")),
      utm_campaign: truncate(params.get("utm_campaign")),
      utm_term: truncate(params.get("utm_term")),
      utm_content: truncate(params.get("utm_content")),
      referrer: truncate(document.referrer || null, 512),
      landing_path: truncate(url.pathname + url.search, 512),
      landing_at: new Date().toISOString(),
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
