// Guardrails + canonicalization helpers for the community-editable symptom
// library. Used by the "add new symptom" entry point and the admin review
// screen. Server-side, an insert trigger forces status='pending' and enforces
// the 3-per-24h submission cap; these checks are the user-facing mirror.

import { canonicalSymptomKey, findNearDuplicate } from "@/lib/symptomDedupe";

export const MAX_SYMPTOM_LENGTH = 60;
export const MIN_SYMPTOM_LENGTH = 3;
export const MAX_PENDING_PER_DAY = 3;

const URL_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ru|xyz|shop|link|co)\b|@[a-z0-9_]{3,})/i;

// Small, deliberately blunt blocklist. Substring match on word-ish boundaries.
const BLOCKED_TERMS = [
  "fuck", "shit", "bitch", "cunt", "asshole", "bastard", "dick", "pussy",
  "whore", "slut", "nigger", "faggot", "rape", "porn", "xxx", "sex cam",
  "viagra", "cialis", "casino", "crypto", "bitcoin", "forex", "free money",
  "click here", "buy now", "subscribe", "discount", "promo code", "telegram",
  "whatsapp me", "dm me", "follow me", "http", "www",
];

export type SymptomRejectionReason =
  | "too_short"
  | "too_long"
  | "all_caps"
  | "contains_link"
  | "blocked_term"
  | "not_words";

export interface SymptomValidation {
  ok: boolean;
  reason?: SymptomRejectionReason;
  message?: string;
  /** Cleaned value to store when ok. */
  value: string;
}

export function validateSymptomName(raw: string): SymptomValidation {
  const value = String(raw || "").replace(/\s+/g, " ").trim();

  if (value.length < MIN_SYMPTOM_LENGTH) {
    return { ok: false, reason: "too_short", value, message: `Too short — use at least ${MIN_SYMPTOM_LENGTH} characters.` };
  }
  if (value.length > MAX_SYMPTOM_LENGTH) {
    return { ok: false, reason: "too_long", value, message: `Too long — keep it under ${MAX_SYMPTOM_LENGTH} characters.` };
  }
  if (URL_PATTERN.test(value)) {
    return { ok: false, reason: "contains_link", value, message: "Links and handles aren't allowed here." };
  }
  const letters = value.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 3) {
    return { ok: false, reason: "not_words", value, message: "Use words, not symbols or numbers." };
  }
  if (letters.length >= 4 && letters === letters.toUpperCase()) {
    return { ok: false, reason: "all_caps", value, message: "Please don't use all caps." };
  }
  const lower = ` ${value.toLowerCase()} `;
  if (BLOCKED_TERMS.some((t) => lower.includes(t))) {
    return { ok: false, reason: "blocked_term", value, message: "That wording isn't allowed in the shared list." };
  }
  return { ok: true, value };
}

export interface LibraryEntryLike {
  id?: string;
  name: string;
  aliases?: string[] | null;
}

/**
 * Fuzzy match a candidate against approved entry names + their aliases.
 * Returns the matching entry names, best-first, so we can suggest them before
 * offering "add as new".
 */
export function suggestExistingSymptoms(
  candidate: string,
  entries: LibraryEntryLike[],
  limit = 5,
): LibraryEntryLike[] {
  const q = String(candidate || "").trim().toLowerCase();
  if (!q) return [];
  const key = canonicalSymptomKey(q);
  const scored: { entry: LibraryEntryLike; score: number }[] = [];

  for (const entry of entries) {
    const surfaces = [entry.name, ...(entry.aliases ?? [])].filter(Boolean);
    let best = 0;
    for (const s of surfaces) {
      const sl = s.toLowerCase();
      if (sl === q) best = Math.max(best, 1);
      else if (canonicalSymptomKey(sl) === key) best = Math.max(best, 0.95);
      else if (sl.includes(q) || q.includes(sl)) best = Math.max(best, 0.8);
      else if (findNearDuplicate(q, [sl])) best = Math.max(best, 0.7);
    }
    if (best > 0) scored.push({ entry, score: best });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit)
    .map((s) => s.entry);
}

export interface CanonicalRow {
  id: string;
  name: string;
  status: string;
  canonical_id: string | null;
}

/**
 * Historical logs store symptom *names*, not ids, so merges resolve at read
 * time by name: merged entry name -> surviving canonical entry name.
 * Rejected entries map to null (hidden everywhere).
 */
export function buildCanonicalNameMap(rows: CanonicalRow[]): Map<string, string | null> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const map = new Map<string, string | null>();

  for (const row of rows) {
    if (row.status === "rejected") {
      map.set(row.name.toLowerCase(), null);
      continue;
    }
    if (row.status !== "merged" || !row.canonical_id) continue;
    let target = byId.get(row.canonical_id);
    const seen = new Set<string>([row.id]);
    while (target && target.status === "merged" && target.canonical_id && !seen.has(target.id)) {
      seen.add(target.id);
      target = byId.get(target.canonical_id);
    }
    if (target && target.status === "approved") map.set(row.name.toLowerCase(), target.name);
  }
  return map;
}

/** Resolve a logged symptom name to its canonical display name (null = hidden). */
export function resolveSymptomName(name: string, map: Map<string, string | null>): string | null {
  if (!map.size) return name;
  const hit = map.get(String(name || "").toLowerCase());
  return hit === undefined ? name : hit;
}

/** Simple similarity clustering over approved names, for the one-time cleanup pass. */
export function clusterSimilarNames<T extends { id: string; name: string }>(entries: T[]): T[][] {
  const remaining = [...entries];
  const clusters: T[][] = [];

  while (remaining.length) {
    const seed = remaining.shift()!;
    const group = [seed];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const other = remaining[i];
      const dup =
        canonicalSymptomKey(seed.name) === canonicalSymptomKey(other.name) ||
        Boolean(findNearDuplicate(other.name, [seed.name]));
      if (dup) {
        group.push(other);
        remaining.splice(i, 1);
      }
    }
    if (group.length > 1) clusters.push(group);
  }
  return clusters.sort((a, b) => b.length - a.length);
}
