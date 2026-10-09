import { describe, expect, it } from "vitest";
import {
  breaksOpenerGuardrail, buildOpenerRules, namesFromLogs, recentCheckinLines,
} from "../../supabase/functions/_shared/openerContext";

describe("check-in opener rules", () => {
  it("says nothing is logged and forbids feelings when she logged nothing", () => {
    const r = buildOpenerRules({ loggedSymptoms: [], checkins: [], rejected: [], styleIdx: 0 });
    expect(r).toContain("Nothing in the last 3 days");
    expect(r).toContain("How's today landing?");
    expect(r).not.toContain("NOT QUITE");
  });
  it("lists only what she logged and the rejected openers", () => {
    const r = buildOpenerRules({ loggedSymptoms: ["Low mood"], checkins: [], rejected: ["old opener"], styleIdx: 1 });
    expect(r).toContain("Low mood");
    expect(r).toContain("- old opener");
  });
  it("names only symptoms from logs, deduped", () => {
    expect(namesFromLogs([{ symptoms: [{ name: "Cramps" }, "cramps", { name: "Joy" }] }])).toEqual(["Cramps", "Joy"]);
  });
  it("keeps check-ins inside the 3 day window", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    const row = (d: number) => ({ created_at: new Date(now - d * 86400000).toISOString(), metadata: { dimension: "energy", response: "low" } });
    expect(recentCheckinLines([row(1), row(5)], now)).toHaveLength(1);
  });
  it("flags supplements, doses and the retired phrase", () => {
    expect(breaksOpenerGuardrail("Magnesium may help")).toBe(true);
    expect(breaksOpenerGuardrail("take 400 mg")).toBe(true);
    expect(breaksOpenerGuardrail("Feeling emotionally allergic")).toBe(true);
    expect(breaksOpenerGuardrail("How's today landing?")).toBe(false);
  });
});
