// ============================================================================
// SINGLE SOURCE OF TRUTH for cycle day/phase calculation (client copy).
// Canonical logic extracted from chat-ai (the retroactive-date-fix version).
// Mirror of supabase/functions/_shared/cycleCalculations.ts — keep the two
// files in sync. The ONLY intended difference is that this copy imports the
// PhaseLengths type from ./phaseLengths instead of inlining it.
//
// Per-caller policy differences are EXPLICIT options, not silent divergence:
//  - overduePolicy:   chat-ai / generate-insight never wrap an overdue cycle
//                     (running day count, so the overdue detector can fire);
//                     the client ring wraps once past a 14-day grace window
//                     unless periodPending is set.
//  - futureStartPolicy: chat-ai clamps a pre-start reference date to Day 1;
//                     the ring/generate-insight historically wrapped modulo.
//  - overdueCap:      ring-only display state ("Overdue") when periodPending
//                     lets the day count run unbounded.
// ============================================================================

import type { PhaseLengths } from "./phaseLengths";

export type { PhaseLengths };

export interface CalculateCycleInfoOptions {
  timezone?: string;
  /**
   * Optional "as of" reference date (YYYY-MM-DD string, or a Date). When
   * provided, day/phase is computed for THAT date instead of today — used
   * for retroactive/backdated views so no date math is left to chance.
   */
  asOfDate?: string | Date | null;
  currentPeriodEndDate?: string | null;
  periodPending?: boolean;
  periodStillActive?: boolean;
  phaseLengths?: PhaseLengths | null;
  /** Default "no-wrap" (canonical server behavior). */
  overduePolicy?: "no-wrap" | "wrap-after-grace";
  /** Default "clamp" (canonical server behavior). */
  futureStartPolicy?: "clamp" | "wrap";
  /** Ring-only: cap unbounded pending day counts with an "Overdue" phase. */
  overdueCap?: boolean;
}

export interface CycleInfo {
  cycleDay: number;
  phase: string;
  daysUntilNextPhase: number;
  daysSinceStart: number;
}

const OVERDUE_GRACE_DAYS = 14;

export function calculateCycleInfoShared(
  lastPeriodStart: string | null,
  cycleLengthDays: number | null,
  options: CalculateCycleInfoOptions = {},
): CycleInfo | null {
  if (!lastPeriodStart || !cycleLengthDays) return null;

  const {
    timezone = "UTC",
    asOfDate = null,
    currentPeriodEndDate = null,
    periodPending = false,
    periodStillActive = false,
    phaseLengths = null,
    overduePolicy = "no-wrap",
    futureStartPolicy = "clamp",
    overdueCap = false,
  } = options;

  // Parse date-only string safely: treat YYYY-MM-DD as noon UTC to avoid
  // timezone off-by-one shifts.
  let periodStart: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(lastPeriodStart)) {
    const [year, month, day] = lastPeriodStart.split("-").map(Number);
    periodStart = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  } else {
    periodStart = new Date(lastPeriodStart);
  }

  // Reference date — defaults to today in the user's timezone.
  let today: Date;
  if (asOfDate) {
    if (typeof asOfDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
      const [y, m, d] = asOfDate.split("-").map(Number);
      today = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    } else if (typeof asOfDate === "string") {
      const d = new Date(asOfDate);
      today = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0));
    } else {
      // Date object — use its local fields, matching historical
      // ChatCycleCircle behavior.
      today = new Date(Date.UTC(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate(), 12, 0, 0));
    }
  } else {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
    const [ty, tm, td] = todayStr.split("-").map(Number);
    today = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0));
  }

  const diffTime = today.getTime() - periodStart.getTime();
  const daysSinceStart = Math.round(diffTime / (1000 * 60 * 60 * 24));

  // Cycle day derivation.
  // Canonical (server): never wrap — keep the running unwrapped count so the
  // overdue detector can fire and Logan can prompt for a real Day-1
  // confirmation instead of silently pretending a new cycle started.
  // Ring ("wrap-after-grace"): wrap past cycleLength + 14d grace unless she
  // has explicitly said her period hasn't started (periodPending).
  let cycleDay: number;
  if (daysSinceStart < 0) {
    cycleDay = futureStartPolicy === "wrap"
      ? (((daysSinceStart % cycleLengthDays) + cycleLengthDays) % cycleLengthDays) + 1
      : 1;
  } else if (
    overduePolicy === "wrap-after-grace" &&
    !periodPending &&
    daysSinceStart >= cycleLengthDays + OVERDUE_GRACE_DAYS
  ) {
    cycleDay = (daysSinceStart % cycleLengthDays) + 1;
  } else {
    cycleDay = daysSinceStart + 1;
  }

  const prefs: PhaseLengths = phaseLengths ?? {};
  const defMenstruation = 5;
  const defOvDay = cycleLengthDays - 14;
  const defFollicular = Math.max(1, (defOvDay - 1) - defMenstruation - 1 + 1);
  const defOvWindow = 4;

  // If she reported her period ended early, shift Follicular forward. Only
  // honor the end date when it's on/after period start and within this cycle.
  let menstruationEnd = prefs.menstruation_days ?? defMenstruation;
  if (currentPeriodEndDate && /^\d{4}-\d{2}-\d{2}$/.test(currentPeriodEndDate)) {
    const [ey, em, ed] = currentPeriodEndDate.split("-").map(Number);
    const endDate = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));
    const endDay = Math.round((endDate.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (endDay >= 1 && endDay <= cycleLengthDays) menstruationEnd = endDay;
  }

  const hasCustomWindow =
    prefs.follicular_days != null || prefs.ovulation_window_days != null || prefs.menstruation_days != null;

  let ovulationStart: number;
  let ovulationEnd: number;
  if (hasCustomWindow) {
    ovulationStart = menstruationEnd + (prefs.follicular_days ?? defFollicular) + 1;
    ovulationEnd = ovulationStart + (prefs.ovulation_window_days ?? defOvWindow) - 1;
  } else {
    ovulationStart = defOvDay - 1;
    ovulationEnd = defOvDay + 2;
  }

  // If she said her period is still ongoing past the default window, keep her
  // in Menstruation (capped at day 12) until she logs an end date or new Day 1.
  // Auto-expiry: the flag is only meaningful during the actual bleed window —
  // past day 7 (or 7+ days elapsed since start) it's stale and ignored.
  // This OVERRIDES the ovulation window so a short cycle can't flip her into
  // Ovulation while she's still bleeding.
  const flagExpired = !!periodStillActive && (cycleDay > 7 || daysSinceStart > 7);
  const forceMenstruation = !!periodStillActive && !flagExpired && cycleDay <= 12;

  let phase: string;
  let daysUntilNextPhase: number;
  if (forceMenstruation || cycleDay <= menstruationEnd) {
    phase = "Menstruation";
    daysUntilNextPhase = Math.max(1, menstruationEnd - cycleDay + 1);
  } else if (cycleDay < ovulationStart) {
    phase = "Follicular";
    daysUntilNextPhase = ovulationStart - cycleDay;
  } else if (cycleDay <= ovulationEnd) {
    phase = "Ovulation";
    daysUntilNextPhase = ovulationEnd - cycleDay + 1;
  } else {
    phase = "Luteal";
    daysUntilNextPhase = cycleLengthDays - cycleDay + 1;
  }

  // Ring-only overdue ceiling: when periodPending disables wrapping, the true
  // day count can run unbounded. Cap what is displayed/derived so the ring
  // shows a distinct "significantly overdue" state.
  if (overdueCap && periodPending) {
    const OVERDUE_CAP = Math.max(90, cycleLengthDays * 3);
    if (cycleDay > OVERDUE_CAP) {
      return { cycleDay: OVERDUE_CAP, phase: "Overdue", daysUntilNextPhase: 1, daysSinceStart };
    }
  }

  return { cycleDay, phase, daysUntilNextPhase, daysSinceStart };
}
