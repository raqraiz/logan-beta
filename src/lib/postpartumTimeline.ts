// ============================================================================
// SINGLE SOURCE OF TRUTH for postpartum timeline math (client copy).
// Mirror of supabase/functions/_shared/postpartumTimeline.ts — keep in sync.
//
// CONVENTION (matches cycleCalculations.ts):
//  - Dates are date-only (YYYY-MM-DD) and parsed at NOON UTC to avoid
//    timezone off-by-one shifts.
//  - "Days postpartum" is a CALENDAR-day difference in the reference
//    timezone (device-local on the client, participant timezone on the
//    server), FLOORed. Birth date itself = day 0.
//    => the number only changes at local midnight, never mid-session.
//  - weeks  = floor(days / 7)   (completed weeks)
//  - months = floor(days / 30)
// ============================================================================

export interface PostpartumTimeline {
  /** Completed calendar days since birth. Birth date = 0. Negative if future. */
  days: number;
  /** Completed weeks = floor(days / 7). */
  weeks: number;
  /** Approximate completed months = floor(days / 30). */
  months: number;
  /** "3 weeks" / "4 months" — canonical human label. */
  label: string;
  /** Stale/invalid stored date (future, or > 3 years ago). */
  isImplausible: boolean;
}

function parseDateOnly(value: string): Date | null {
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function referenceDate(timezone?: string, asOf?: Date | string | null): Date {
  if (asOf) {
    if (typeof asOf === "string") {
      const parsed = parseDateOnly(asOf);
      if (parsed) return parsed;
      const d = new Date(asOf);
      return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0));
    }
    return new Date(Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate(), 12, 0, 0));
  }
  // Today's calendar date in the reference timezone (device local when omitted).
  const todayStr = timezone
    ? new Date().toLocaleDateString("en-CA", { timeZone: timezone })
    : new Date().toLocaleDateString("en-CA");
  const parsed = parseDateOnly(todayStr);
  if (parsed) return parsed;
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0));
}

export function getPostpartumTimeline(
  birthDate?: string | null,
  options: { timezone?: string; asOf?: Date | string | null } = {},
): PostpartumTimeline | null {
  if (!birthDate) return null;
  const start = parseDateOnly(birthDate);
  if (!start) return null;

  const today = referenceDate(options.timezone, options.asOf);
  const days = Math.floor((today.getTime() - start.getTime()) / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const label = months >= 1
    ? `${months} month${months === 1 ? "" : "s"}`
    : `${weeks} week${weeks === 1 ? "" : "s"}`;

  return { days, weeks, months, label, isImplausible: days < 0 || days > 1095 };
}
