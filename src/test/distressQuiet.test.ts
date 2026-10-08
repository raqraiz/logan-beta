import { describe, expect, it } from "vitest";
import { isDistressQuiet, postCrisisLine } from "@/lib/distressQuiet";

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

describe("post-crisis window", () => {
  const end = new Date(now + 3 * 3600_000).toISOString();
  const pc = { distress_post_crisis: true, distress_support_line: "ERAN 1201 is there anytime.", distress_window_end: end };
  it("is quiet until the window end, which does not move", () => {
    expect(isDistressQuiet([msg(5, pc)], now)).toBe(true);
    expect(isDistressQuiet([msg(5, pc)], now + 3 * 3600_000 + 1000)).toBe(false);
  });
  it("shows the quiet line only inside the window", () => {
    expect(postCrisisLine(pc, now)).toBe("ERAN 1201 is there anytime.");
    expect(postCrisisLine(pc, now + 4 * 3600_000)).toBeNull();
    expect(postCrisisLine({ distress_mode: "self_harm" }, now)).toBeNull();
    expect(postCrisisLine(null, now)).toBeNull();
  });
});
