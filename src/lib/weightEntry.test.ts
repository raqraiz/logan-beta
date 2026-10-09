import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import { defaultWeightUnit, kgToInputText, parseWeightInput, readWeightUnit, saveWeightUnit } from "./weightEntry";

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

function withTimeZone(tz: string) {
  vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({ resolvedOptions: () => ({ timeZone: tz }) } as unknown as Intl.DateTimeFormat);
}

describe("weight unit default", () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
  it("is lbs for America/* and kg elsewhere", () => {
    withTimeZone("America/New_York");
    expect(defaultWeightUnit()).toBe("lbs");
    withTimeZone("Europe/London");
    expect(defaultWeightUnit()).toBe("kg");
    withTimeZone("Australia/Sydney");
    expect(defaultWeightUnit()).toBe("kg");
  });
  it("uses the default when nothing is saved, and does not save it", () => {
    withTimeZone("America/Chicago");
    expect(readWeightUnit()).toBe("lbs");
    expect(localStorage.getItem("logan_weight_unit")).toBeNull();
  });
  it("never overrides a saved choice", () => {
    withTimeZone("America/Chicago");
    saveWeightUnit("kg");
    expect(readWeightUnit()).toBe("kg");
    withTimeZone("Europe/Paris");
    saveWeightUnit("lbs");
    expect(readWeightUnit()).toBe("lbs");
  });
});
