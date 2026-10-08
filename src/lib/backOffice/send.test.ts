import { describe, expect, it } from "vitest";
import { FEEDBACK_ASK_STARTER, MAX_BODY, SEND_STAGES, audienceKey, canSend, sendErrorText, toCount } from "./send";

describe("send helpers", () => {
  it("-1 from the server means fewer than 10 and cannot be sent", () => {
    expect(toCount(-1)).toEqual({ kind: "small" });
    expect(canSend(toCount(-1))).toBe(false);
    expect(canSend(toCount(0))).toBe(false);
    expect(canSend(toCount(12))).toBe(true);
    expect(canSend(null)).toBe(false);
  });
  it("lists every life stage except IUD", () => {
    expect(SEND_STAGES).not.toContain("bc_iud");
    expect(SEND_STAGES).toContain("bc_hormonal");
    expect(SEND_STAGES).toHaveLength(7);
  });
  it("audience key ignores the order stages were picked in", () => {
    expect(audienceKey({ type: "stages", stages: ["regular", "pregnant"] })).toBe(audienceKey({ type: "stages", stages: ["pregnant", "regular"] }));
  });
  it("feedback ask is warm, short, has no dashes and names the Send feedback button", () => {
    expect(FEEDBACK_ASK_STARTER).not.toMatch(/[–—]/);
    expect(FEEDBACK_ASK_STARTER).toContain("Send feedback button");
    expect(FEEDBACK_ASK_STARTER).toMatch(/what's helping, and what isn't/i);
    expect(FEEDBACK_ASK_STARTER.length).toBeLessThan(MAX_BODY);
  });
  it("turns database refusals into plain words", () => {
    expect(sendErrorText(new Error("audience too small"))).toMatch(/fewer than 10/);
    expect(sendErrorText(new Error("already sent"))).toMatch(/already sent/);
    expect(sendErrorText(new Error("boom"))).toMatch(/try again/);
  });
});
