import { describe, expect, it } from "vitest";
import { active14, buildPath, cell, goalPace, rangeDates, returnedPct, stickiness, weekLabel } from "./math";

describe("back office maths", () => {
  it("stickiness is a 2-decimal ratio, empty when nobody is active", () => {
    expect(stickiness(53, 100)).toBe(0.53);
    expect(stickiness(0, 0)).toBeNull();
  });
  it("range dates are UTC and inclusive", () => {
    const now = new Date("2026-10-08T23:30:00Z");
    expect(rangeDates("7d", now)).toEqual({ from: "2026-10-02", to: "2026-10-08" });
    expect(rangeDates("30d", now)).toEqual({ from: "2026-09-09", to: "2026-10-08" });
    expect(rangeDates("all", now)).toEqual({ from: null, to: "2026-10-08" });
  });
  it("pace: women needed per day", () => {
    expect(goalPace(100, 1000, "2027-01-01", "2026-10-08")).toEqual({ perDay: 10.6, status: "on" }); // 900 / 85 days
    expect(goalPace(1000, 1000, "2027-01-01", "2026-10-08").status).toBe("reached");
    expect(goalPace(10, 1000, "2026-10-01", "2026-10-08").status).toBe("passed");
  });
  it("path: straight goal line, actual stops today", () => {
    const p = buildPath([{ day: "2026-10-01", total: 2 }, { day: "2026-10-02", total: 5 }], 100, "2026-10-11", "2026-10-02", null);
    expect(p[0]).toEqual({ day: "2026-10-01", actual: 2, goal: 0 });
    expect(p[1].actual).toBe(5);
    expect(p[2].actual).toBeNull();
    expect(p[p.length - 1]).toEqual({ day: "2026-10-11", actual: null, goal: 100 });
  });
  it("cells: dash for unknown, 'Fewer than 10' for the server marker", () => {
    expect(cell(null)).toBe("—");
    expect(cell(-1)).toBe("Fewer than 10");
    expect(cell(1234)).toBe("1,234");
    expect(returnedPct(20, 5)).toBe("25%");
    expect(returnedPct(null, null)).toBe("—");
    expect(returnedPct(-1, -1)).toBe("Fewer than 10");
    expect(returnedPct(30, -1)).toBe("Fewer than 10");
    expect(active14(0, 0)).toBe("—");
    expect(active14(8, 3)).toBe("3 of 8");
  });
  it("week label runs Monday to Sunday", () => {
    expect(weekLabel("2026-10-05")).toBe("5 – 11 Oct");
    expect(weekLabel("2026-09-28")).toBe("28 Sep – 4 Oct");
  });
});
