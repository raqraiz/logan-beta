import { describe, expect, it } from "vitest";
import { isDistressQuiet } from "@/lib/distressQuiet";

const now = new Date("2026-10-08T12:00:00Z").getTime();
const msg = (min: number, metadata: unknown) => ({ created_at: new Date(now - min * 60000).toISOString(), metadata });

describe("isDistressQuiet", () => {
  it("is quiet during and for 6 hours after distress-mode messages", () => {
    expect(isDistressQuiet([msg(5, { distress_mode: "acute" })], now)).toBe(true);
    expect(isDistressQuiet([msg(300, { distress_mode: "self_harm" })], now)).toBe(true);
    expect(isDistressQuiet([msg(10, { distress_post: true }), msg(2, {})], now)).toBe(true);
    expect(isDistressQuiet([msg(5, { distress_checkin: true })], now)).toBe(true);
  });
  it("ends after 6 hours and ignores ordinary chat", () => {
    expect(isDistressQuiet([msg(361, { distress_mode: "acute" })], now)).toBe(false);
    expect(isDistressQuiet([msg(5, { cycle_day: 4 }), msg(1, null)], now)).toBe(false);
    expect(isDistressQuiet([], now)).toBe(false);
  });
});
