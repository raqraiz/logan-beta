import { describe, expect, it } from "vitest";
import { kgToInputText, parseWeightInput } from "./weightEntry";

describe("parseWeightInput", () => {
  it("treats blank as empty, not zero", () => {
    expect(parseWeightInput("  ", "kg")).toMatchObject({ ok: true, empty: true });
  });
  it("accepts kg in range and rounds to 2 decimals", () => {
    expect(parseWeightInput("68.5", "kg")).toMatchObject({ ok: true, empty: false, kg: 68.5 });
    expect(parseWeightInput("30", "kg")).toMatchObject({ ok: true });
    expect(parseWeightInput("300", "kg")).toMatchObject({ ok: true });
  });
  it("rejects kg out of range and non-numbers", () => {
    expect(parseWeightInput("29.9", "kg")).toMatchObject({ ok: false });
    expect(parseWeightInput("301", "kg")).toMatchObject({ ok: false });
    expect(parseWeightInput("abc", "kg")).toMatchObject({ ok: false });
    expect(parseWeightInput("0", "kg")).toMatchObject({ ok: false });
  });
  it("converts lbs to kg and validates in lbs", () => {
    const r = parseWeightInput("150", "lbs");
    expect(r).toMatchObject({ ok: true, empty: false });
    expect(r.kg).toBeCloseTo(68.04, 2);
    expect(parseWeightInput("60", "lbs")).toMatchObject({ ok: false });
    expect(parseWeightInput("700", "lbs")).toMatchObject({ ok: false });
    expect(parseWeightInput("66.2", "lbs")).toMatchObject({ ok: true });
  });
  it("names the range in her unit", () => {
    const r = parseWeightInput("5", "lbs");
    expect(r).toMatchObject({ ok: false, message: "Enter a weight between 67 and 661 lbs." });
  });
});

describe("kgToInputText", () => {
  it("is empty when there is no entry", () => {
    expect(kgToInputText(null, "kg")).toBe("");
    expect(kgToInputText(0, "lbs")).toBe("");
  });
  it("shows her unit", () => {
    expect(kgToInputText(68, "kg")).toBe("68");
    expect(kgToInputText(68, "lbs")).toBe("149.9");
  });
});
