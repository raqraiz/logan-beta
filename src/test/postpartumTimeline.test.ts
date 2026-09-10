import { describe, it, expect } from "vitest";
import { getPostpartumTimeline } from "@/lib/postpartumTimeline";

describe("postpartum timeline — single source of truth", () => {
  const BIRTH = "2026-07-08";

  it("birth date itself is day 0, week 0", () => {
    const t = getPostpartumTimeline(BIRTH, { asOf: BIRTH })!;
    expect(t).toMatchObject({ days: 0, weeks: 0 });
  });

  it("floors completed weeks", () => {
    expect(getPostpartumTimeline(BIRTH, { asOf: "2026-08-31" })!).toMatchObject({ days: 54, weeks: 7 });
    expect(getPostpartumTimeline(BIRTH, { asOf: "2026-09-02" })!).toMatchObject({ days: 56, weeks: 8 });
    expect(getPostpartumTimeline(BIRTH, { asOf: "2026-09-09" })!).toMatchObject({ days: 63, weeks: 9 });
  });

  it("does not change within a calendar day (no mid-session boundary jump)", () => {
    const early = getPostpartumTimeline(BIRTH, { asOf: new Date(2026, 8, 9, 0, 2) })!;
    const late = getPostpartumTimeline(BIRTH, { asOf: new Date(2026, 8, 9, 23, 58) })!;
    expect(early.weeks).toBe(late.weeks);
  });

  it("flags implausible stored dates", () => {
    expect(getPostpartumTimeline("2030-01-01", { asOf: "2026-09-10" })!.isImplausible).toBe(true);
    expect(getPostpartumTimeline("2015-01-01", { asOf: "2026-09-10" })!.isImplausible).toBe(true);
  });
});
