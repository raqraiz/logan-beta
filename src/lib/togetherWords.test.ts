import { describe, expect, it } from "vitest";
import { allSingle, isTrackerValue, type TogetherWord } from "@/lib/togetherWords";
import { canonicalSymptom } from "@/lib/symptomCatalog";

const w = (label: TogetherWord["label"]): TogetherWord => ({ word: "x", label, women_count: null, mine: false });

describe("isTrackerValue", () => {
  it("catches Prefix: value names from trackers", () => {
    expect(isTrackerValue("Discharge: Sticky / Tacky")).toBe(true);
    expect(isTrackerValue("Flow: Heavy")).toBe(true);
  });
  it("leaves ordinary words alone", () => {
    expect(isTrackerValue("Heavy legs")).toBe(false);
    expect(isTrackerValue("note:")).toBe(false);
  });
});

describe("allSingle", () => {
  it("is true only when every word is under 3 women", () => {
    expect(allSingle([w("single"), w("single")])).toBe(true);
    expect(allSingle([w("single"), w("few")])).toBe(false);
    expect(allSingle([])).toBe(false);
  });
});

describe("library aliases", () => {
  it("resolves angry, burn out and burnout", () => {
    expect(canonicalSymptom("angry")).toBe("Anger");
    expect(canonicalSymptom("burn out")).toBe("Fatigue");
    expect(canonicalSymptom("Burnout")).toBe("Fatigue");
  });
});
