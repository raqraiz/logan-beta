import { describe, it, expect } from "vitest";
import { calculateCycleInfoShared } from "@/lib/cycleCalculations";
import { calculateCycleInfo } from "@/components/chat/ChatCycleCircle";

/**
 * Parity tests for the consolidated calculateCycleInfo.
 *
 * Scenario from the retroactive-entry bug: Day 1 = Aug 5 2026 (backdated),
 * "today" = Aug 16 2026 → Day 12. Asking about Aug 9 must yield Day 5,
 * Menstruation — from code, not model math — and every surface must agree.
 */

const START = "2026-08-05";
const LEN = 28;
const TODAY = "2026-08-16"; // Day 12

describe("shared calculateCycleInfo — canonical server policy (chat-ai / generate-insight)", () => {
  it("computes today's day/phase", () => {
    const r = calculateCycleInfoShared(START, LEN, { timezone: "UTC", asOfDate: TODAY });
    expect(r).toMatchObject({ cycleDay: 12, phase: "Follicular" });
  });

  it("backdated reference: Aug 9 = Day 5, Menstruation", () => {
    const r = calculateCycleInfoShared(START, LEN, { timezone: "UTC", asOfDate: "2026-08-09" });
    expect(r).toMatchObject({ cycleDay: 5, phase: "Menstruation" });
  });

  it("multiple past dates stay internally consistent", () => {
    const expectDay = (date: string, day: number, phase: string) =>
      expect(calculateCycleInfoShared(START, LEN, { timezone: "UTC", asOfDate: date }))
        .toMatchObject({ cycleDay: day, phase });
    expectDay("2026-08-05", 1, "Menstruation");
    expectDay("2026-08-09", 5, "Menstruation");
    expectDay("2026-08-10", 6, "Follicular");
    expectDay("2026-08-18", 14, "Ovulation");
    expectDay("2026-08-20", 16, "Luteal");
  });

  it("never wraps an overdue cycle (running count)", () => {
    const r = calculateCycleInfoShared(START, LEN, { timezone: "UTC", asOfDate: "2026-10-15" });
    expect(r!.cycleDay).toBe(72); // unwrapped, not Day 16 of a fake cycle
  });

  it("clamps a pre-start reference date to Day 1", () => {
    const r = calculateCycleInfoShared(START, LEN, { timezone: "UTC", asOfDate: "2026-08-01" });
    expect(r!.cycleDay).toBe(1);
  });
});

describe("ChatCycleCircle ring policy — agrees on normal + retroactive cases", () => {
  it("matches server for today and backdated dates", () => {
    const server = calculateCycleInfoShared(START, LEN, { timezone: "UTC", asOfDate: TODAY })!;
    const ring = calculateCycleInfo(START, LEN, "UTC", TODAY)!;
    expect(ring).toMatchObject({ cycleDay: server.cycleDay, phase: server.phase });

    const serverPast = calculateCycleInfoShared(START, LEN, { timezone: "UTC", asOfDate: "2026-08-09" })!;
    const ringPast = calculateCycleInfo(START, LEN, "UTC", "2026-08-09")!;
    expect(ringPast).toMatchObject({ cycleDay: serverPast.cycleDay, phase: serverPast.phase });
  });

  it("ring still wraps only after the 14-day overdue grace window", () => {
    // 10 days overdue (day 38 on 28d cycle) → within grace, unwrapped
    const grace = calculateCycleInfo(START, LEN, "UTC", "2026-09-11")!;
    expect(grace.cycleDay).toBe(38);
    // 40 days overdue → wrapped (ring display policy)
    const wrapped = calculateCycleInfo(START, LEN, "UTC", "2026-10-10")!;
    expect(wrapped.cycleDay).toBeLessThanOrEqual(LEN);
    // periodPending never wraps
    const pending = calculateCycleInfo(START, LEN, "UTC", "2026-10-10", null, true)!;
    expect(pending.cycleDay).toBe(67);
  });
});
