import { describe, expect, it } from "vitest";
import { growthText, monthTitle, noEmDash, prevMonthName, reportToText, retentionText, type Report } from "./reports";

const base: Report = {
  month: "2026-09-01", status: "locked", lockedAt: "2026-10-01T08:00:00Z", late: false,
  numbers: {
    asOf: "2026-09-30", totalUsers: 312, newUsers: 38, prevTotal: 274, growthPct: 13.9, goalCount: 1000, goalDate: "2027-01-01", goalPct: 31.2,
    mau: 120, wau: 64, avgWeeklyActive: 61, stickiness: 0.53,
    retention: { cohort: 50, active: 31, pct: 62 },
    sources: [{ source: "instagram", signups: 20 }, { source: "(direct / none)", signups: 9 }], referralJoins: 7,
    feedback: { total: 5, themes: { bug: 1, praise: 4 } }, chart: [],
  },
  notes: { highlights: "Strong month — referrals up", lowlights: "", asks: "Intros to clinics", finalAt: null }, draft: null,
};

describe("investor report text", () => {
  it("has the title, labelled numbers and the three notes", () => {
    const t = reportToText(base);
    expect(t).toContain("Logan update, September 2026");
    expect(t).toContain("Locked on 1 Oct 2026");
    expect(t).toContain("Total users at month end: 312");
    expect(t).toContain("Growth vs previous month: 13.9%");
    expect(t).toContain("Progress toward goal: 31.2% of the goal of 1,000 women by 1 Jan 2027");
    expect(t).toContain("Stickiness (7 day / 30 day) at month end: 0.53");
    expect(t).toContain("Still active the next month (women who joined in August): 62%, 31 of 50");
    expect(t).toContain("  1. instagram: 20");
    expect(t).toContain("  Praise: 4");
    expect(t.indexOf("HIGHLIGHTS")).toBeLessThan(t.indexOf("LOWLIGHTS"));
    expect(t.indexOf("LOWLIGHTS")).toBeLessThan(t.indexOf("ASKS"));
    expect(t).toContain("LOWLIGHTS\nNone this month.");
  });
  it("never contains an em dash, even from the notes", () => {
    expect(reportToText(base)).not.toContain("—");
    expect(reportToText(base)).toContain("Strong month - referrals up");
    expect(noEmDash("a—b")).toBe("a-b");
  });
  it("labels live and late months", () => {
    expect(reportToText({ ...base, status: "live" })).toContain("So far this month, not locked");
    expect(reportToText({ ...base, late: true })).toContain("Calculated after the month ended");
  });
  it("handles a first month and a small cohort without percentages", () => {
    expect(growthText(null)).toBe("n/a (no users the month before)");
    expect(growthText(0)).toBe("0%");
    expect(retentionText({ cohort: -1, active: null, pct: null })).toBe("Fewer than 10 joined");
    expect(retentionText({ cohort: 50, active: 31, pct: 62 })).toBe("62%, 31 of 50");
  });
  it("names months", () => {
    expect(monthTitle("2026-01-01")).toBe("January 2026");
    expect(prevMonthName("2026-01-01")).toBe("December");
  });
});
