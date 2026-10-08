import { describe, expect, it } from "vitest";
import { guardWord, togetherNorm } from "../../supabase/functions/_shared/togetherWordGuard";

describe("guardWord", () => {
  it("accepts apostrophes", () => {
    expect(guardWord("can't sleep").ok).toBe(true);
    expect(guardWord("Can’t focus").ok).toBe(true);
  });
  it("accepts Hebrew and other scripts", () => {
    expect(guardWord("כאב ראש").ok).toBe(true);
    expect(guardWord("صداع").ok).toBe(true);
    expect(guardWord("мигрень").ok).toBe(true);
  });
  it("tidies spaces without rewriting", () => {
    const r = guardWord("  heavy   legs ");
    expect(r.ok && r.value).toBe("heavy legs");
  });
  it("refuses links, contact details and numbers", () => {
    expect(guardWord("see mysite.com")).toMatchObject({ ok: false, reason: "link" });
    expect(guardWord("https://x.co")).toMatchObject({ ok: false, reason: "link" });
    expect(guardWord("mail me a@b.org")).toMatchObject({ ok: false, reason: "contact" });
    expect(guardWord("call 050 123 4567")).toMatchObject({ ok: false, reason: "contact" });
    expect(guardWord("3am waking")).toMatchObject({ ok: false, reason: "number" });
  });
  it("refuses all caps, long, short and blocked words", () => {
    expect(guardWord("HEADACHE")).toMatchObject({ ok: false, reason: "all_caps" });
    expect(guardWord("x".repeat(61))).toMatchObject({ ok: false, reason: "too_long" });
    expect(guardWord("a")).toMatchObject({ ok: false, reason: "too_short" });
    expect(guardWord("!!!")).toMatchObject({ ok: false, reason: "not_words" });
    expect(guardWord("so much shit")).toMatchObject({ ok: false, reason: "blocked_term" });
  });
  it("does not block words that merely contain a blocked string", () => {
    expect(guardWord("grape craving").ok).toBe(true);
  });
});

describe("togetherNorm", () => {
  it("matches the server rule", () => {
    expect(togetherNorm("  Hot   Flashes ")).toBe("hot flashe");
    expect(togetherNorm("Itchy skin")).toBe("itchy skin");
    expect(togetherNorm("allergies")).toBe("allergy");
  });
});
