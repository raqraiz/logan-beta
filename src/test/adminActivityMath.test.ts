import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { computeAvgDailyUsers, computeAvgWeeklyUsers, computeStickiness } from "@/lib/metrics/definitions";
import { computeAvgWeeklyActiveUsers } from "@/lib/admin/engagementMetrics";

describe("server-count metric math", () => {
  it("avg daily users is the mean of per-day counts, one decimal, zeros included", () => {
    expect(computeAvgDailyUsers([{ activeUsers: 3 }, { activeUsers: 0 }, { activeUsers: 4 }])).toBe(2.3);
    expect(computeAvgDailyUsers([])).toBeNull();
  });

  it("Overview avg weekly users only counts completed Mon–Sun weeks", () => {
    const weeks = [
      { weekStart: "2020-01-06", daysInRange: 7, activeUsers: 10 },
      { weekStart: "2020-01-13", daysInRange: 7, activeUsers: 15 },
      { weekStart: "2020-01-20", daysInRange: 3, activeUsers: 99 }, // partial, ignored
    ];
    expect(computeAvgWeeklyUsers(weeks)).toBe(12.5);
    expect(computeAvgWeeklyUsers([{ weekStart: "2020-01-20", daysInRange: 3, activeUsers: 9 }])).toBeNull();
  });

  it("a week that has not finished yet is not completed", () => {
    const monday = new Date();
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    expect(computeAvgWeeklyUsers([{ weekStart: key, daysInRange: 7, activeUsers: 5 }])).toBeNull();
  });

  it("Investor avg weekly uses full weeks, else a day-weighted fallback", () => {
    expect(computeAvgWeeklyActiveUsers([{ daysInRange: 7, activeUsers: 4 }, { daysInRange: 7, activeUsers: 6 }, { daysInRange: 2, activeUsers: 50 }]))
      .toEqual({ avgWeeklyUsers: 5, fullWeekCount: 2, usedFallback: false });
    const fb = computeAvgWeeklyActiveUsers([{ daysInRange: 3, activeUsers: 6 }, { daysInRange: 1, activeUsers: 2 }]);
    expect(fb.fullWeekCount).toBe(0);
    expect(fb.usedFallback).toBe(true);
    expect(fb.avgWeeklyUsers).toBe(5); // (6*3/7 + 2*1/7) / (4/7)
    expect(computeAvgWeeklyActiveUsers([])).toEqual({ avgWeeklyUsers: null, fullWeekCount: 0, usedFallback: false });
  });

  it("stickiness is WAU ÷ MAU, null when nobody was active", () => {
    expect(computeStickiness(30, 40)).toBe(75);
    expect(computeStickiness(0, 0)).toBeNull();
  });
});
