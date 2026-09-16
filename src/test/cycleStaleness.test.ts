import { describe, it, expect } from "vitest";
import { isCycleStale, CYCLE_STALE_GRACE_DAYS } from "@/lib/cycleCalculations";
import { calculateCycleInfo } from "@/components/chat/ChatCycleCircle";

describe("cycle staleness threshold", () => {
  it("is relative to her own cycle length, not a flat day count", () => {
    expect(isCycleStale(28 + CYCLE_STALE_GRACE_DAYS, 28)).toBe(false);
    expect(isCycleStale(28 + CYCLE_STALE_GRACE_DAYS + 1, 28)).toBe(true);
    // A 35-day cycle needs more elapsed days before it counts as stale.
    expect(isCycleStale(74, 35)).toBe(false);
    expect(isCycleStale(81, 35)).toBe(true);
  });

  it("a few days late is not stale", () => {
    expect(isCycleStale(29, 28)).toBe(false);
    expect(isCycleStale(40, 28)).toBe(false);
  });

  it("no period logged yet is not stale (separate empty state)", () => {
    expect(isCycleStale(null, 28)).toBe(false);
    expect(isCycleStale(0, 28)).toBe(false);
    expect(isCycleStale(10, null)).toBe(false);
  });

  it("logging a new period exits the stale state immediately", () => {
    const stale = calculateCycleInfo("2026-06-28", 28, "UTC", "2026-09-16")!;
    expect(isCycleStale(stale.cycleDay, 28)).toBe(true);
    const fresh = calculateCycleInfo("2026-09-14", 28, "UTC", "2026-09-16")!;
    expect(isCycleStale(fresh.cycleDay, 28)).toBe(false);
  });
});
