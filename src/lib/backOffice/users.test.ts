import { describe, expect, it } from "vitest";
import { buildCsv, CSV_HEADER, relativeDay } from "./users";

describe("users csv", () => {
  it("has exactly the visible columns plus email, and no health columns", () => {
    expect(CSV_HEADER).toEqual(["Name", "Email", "Joined", "Last active", "Msgs 30d", "Referrals", "Came from"]);
  });
  it("quotes cells and defuses formulas", () => {
    const csv = buildCsv([{ name: 'Maya "M" L.', email: "m@x.com", joinedAt: "2026-10-05T10:00:00Z", lastActiveAt: null, msgs30d: 3, referrals: 1, cameFrom: "=HYPERLINK(1)" }]);
    expect(csv.split("\r\n")[1]).toBe(`"Maya ""M"" L.","m@x.com","2026-10-05","","3","1","'=HYPERLINK(1)"`);
  });
});

describe("relativeDay", () => {
  const now = new Date("2026-10-08T01:00:00Z");
  it("uses UTC days", () => {
    expect(relativeDay("2026-10-07T23:59:00Z", now)).toBe("Yesterday");
    expect(relativeDay("2026-10-08T00:10:00Z", now)).toBe("Today");
    expect(relativeDay("2026-10-06T12:00:00Z", now)).toBe("2 days ago");
    expect(relativeDay(null, now)).toBe("—");
  });
});
