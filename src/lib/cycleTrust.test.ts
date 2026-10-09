import { describe, expect, it } from "vitest";
import { autoCycleLengthFromHistory } from "./cyclePhase";
import { cycleUnusualKind, isCycleTrusted } from "./cycleTrust";

describe("cycle trust", () => {
  it("flags long and short cycles", () => {
    expect(cycleUnusualKind(66)).toBe("long");
    expect(cycleUnusualKind(10)).toBe("short");
    expect(cycleUnusualKind(28)).toBeNull();
  });
  it("trusts typical or confirmed cycles only", () => {
    expect(isCycleTrusted({ cycle_length_days: 28 })).toBe(true);
    expect(isCycleTrusted({ cycle_length_days: 66 })).toBe(false);
    expect(isCycleTrusted({ cycle_length_days: 66, confirmed_by_user_at: "2026-10-09T00:00:00Z" })).toBe(true);
  });
  it("predictions use trusted cycles", () => {
    expect(autoCycleLengthFromHistory([{ cycle_length_days: 28 }, { cycle_length_days: 66 }])).toBe(28);
    expect(autoCycleLengthFromHistory([{ cycle_length_days: 28 }, { cycle_length_days: 60, confirmed_by_user_at: "x" }])).toBe(44);
  });
});
