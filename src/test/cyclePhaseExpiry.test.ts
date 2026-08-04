import { describe, it, expect } from "vitest";
import { calculateCycleInfo } from "@/components/chat/ChatCycleCircle";

/**
 * Regression tests for the sticky-Menstruation bug.
 *
 * Guard under test (identical on client + server):
 *   flagExpired = periodStillActive && (cycleDay > 7 || daysSinceStart > 7)
 * When flagExpired is true, the phase must NOT be forced to Menstruation.
 */

const CYCLE_LENGTH = 28;
const REF_DATE = "2026-06-15"; // fixed reference "today"

/** Build a last_period_start such that REF_DATE lands on the given cycle day. */
function startForDay(cycleDay: number): string {
  const [y, m, d] = REF_DATE.split("-").map(Number);
  const ref = Date.UTC(y, m - 1, d, 12, 0, 0);
  const start = new Date(ref - (cycleDay - 1) * 86400000);
  return start.toISOString().slice(0, 10);
}

function phaseFor(cycleDay: number, periodStillActive: boolean, currentPeriodEndDate?: string) {
  const res = calculateCycleInfo(
    startForDay(cycleDay),
    CYCLE_LENGTH,
    "UTC",
    REF_DATE,
    currentPeriodEndDate ?? null,
    false,
    periodStillActive
  );
  expect(res).not.toBeNull();
  expect(res!.cycleDay).toBe(cycleDay);
  return res!.phase;
}

describe("cycle phase auto-expiry guard (client — calculateCycleInfo)", () => {
  it("expired period does not force Menstruation phase (day 9)", () => {
    expect(phaseFor(9, true)).not.toBe("Menstruation");
  });

  it("active period within window still shows Menstruation phase (day 5)", () => {
    expect(phaseFor(5, true)).toBe("Menstruation");
  });

  it("boundary: day 7 is still within the window (guard is exclusive, cycleDay > 7)", () => {
    // flagExpired requires cycleDay > 7, so day 7 is NOT expired → still Menstruation.
    expect(phaseFor(7, true)).toBe("Menstruation");
    // Day 8 is the first expired day.
    expect(phaseFor(8, true)).not.toBe("Menstruation");
  });

  it("does not force Menstruation when the flag is not set", () => {
    expect(phaseFor(9, false)).toBe("Follicular");
  });
});

/**
 * Server-side parity (chat-ai / generate-insight run on Deno and are not
 * importable here). This replicates their phase decision verbatim so the
 * daysSinceStart branch — unreachable on the client, where cycleDay is
 * derived from daysSinceStart — is still covered.
 */
function serverPhase(opts: {
  cycleDay: number;
  daysSinceStart: number;
  periodStillActive?: boolean;
  cycleLengthDays?: number;
  menstruationEnd?: number;
}): string {
  const { cycleDay, daysSinceStart, periodStillActive } = opts;
  const cycleLengthDays = opts.cycleLengthDays ?? CYCLE_LENGTH;
  const menstruationEnd = opts.menstruationEnd ?? 5;
  const ovulationDay = cycleLengthDays - 14;
  const ovulationStart = ovulationDay - 1;
  const ovulationEnd = ovulationDay + 2;

  const flagExpired = !!periodStillActive && (cycleDay > 7 || daysSinceStart > 7);
  const forceMenstruation = !!periodStillActive && !flagExpired && cycleDay <= 12;

  if (forceMenstruation || cycleDay <= menstruationEnd) return "Menstruation";
  if (cycleDay < ovulationStart) return "Follicular";
  if (cycleDay <= ovulationEnd) return "Ovulation";
  return "Luteal";
}

describe("cycle phase auto-expiry guard (server parity)", () => {
  it("expired period does not force Menstruation phase (day 9)", () => {
    expect(serverPhase({ cycleDay: 9, daysSinceStart: 8, periodStillActive: true })).not.toBe(
      "Menstruation"
    );
  });

  it("active period within window still shows Menstruation phase (day 5)", () => {
    expect(serverPhase({ cycleDay: 5, daysSinceStart: 4, periodStillActive: true })).toBe(
      "Menstruation"
    );
  });

  it("boundary: day 7 is still within the window", () => {
    expect(serverPhase({ cycleDay: 7, daysSinceStart: 6, periodStillActive: true })).toBe(
      "Menstruation"
    );
    expect(serverPhase({ cycleDay: 8, daysSinceStart: 7, periodStillActive: true })).not.toBe(
      "Menstruation"
    );
  });

  it("daysSinceStart threshold triggers expiry independently of cycleDay", () => {
    // cycleDay 3 would normally be Menstruation via the base window, so raise
    // the bleed end to isolate the forced-Menstruation path being expired.
    expect(
      serverPhase({
        cycleDay: 3,
        daysSinceStart: 10,
        periodStillActive: true,
        menstruationEnd: 1,
      })
    ).not.toBe("Menstruation");
  });
});
