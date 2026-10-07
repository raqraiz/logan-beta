import { describe, it, expect } from "vitest";
import { ownSymptomPairs, symptomCardInsights, symptomDefinition, symptomPageData, type SymptomPageLog } from "@/lib/symptomPage";

const row = (date: string, day: number | null, notes: string | null = null): SymptomPageLog => ({ logged_at: `${date}T12:00:00Z`, cycle_day: day, symptoms: [{ name: "Cramps", severity: 3 }], notes });
describe("Symptom page presentation data", () => {
  it("requires three own logs and pairings in two real cycles, canonicalizing aliases", () => {
    const logs = [row("2026-08-19", 19), row("2026-08-20", 20), row("2026-09-19", 19),
      { ...row("2026-08-20", 20), symptoms: [{ name: "Tiredness", severity: 0 }] },
      { ...row("2026-09-18", 18), symptoms: [{ name: "Fatigue", severity: 1 }] }];
    const now = Date.parse("2026-10-01T12:00:00Z");
    expect(ownSymptomPairs(logs, "Cramps", ["2026-08-01", "2026-09-01"], now)).toEqual(["Fatigue"]);
    expect(ownSymptomPairs(logs, "Cramps", [], now)).toEqual([]);
    expect(ownSymptomPairs(logs, "Cramps", ["2026-08-01"], now)).toEqual([]);
    expect(ownSymptomPairs(logs.filter((r) => r.logged_at !== "2026-08-19T12:00:00Z"), "Cramps", ["2026-08-01", "2026-09-01"], now)).toEqual([]);
  });
  it("keeps insights complete, short and separate from doctor advice", () => {
    const result = symptomCardInsights(["Hormone shifts can affect fluid retention. This can ease later. See a doctor if symptoms persist.", "Sleep matters; stress matters too.", "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen."]);
    expect(result.insights).toEqual(["Hormone shifts can affect fluid retention.", "This can ease later."]);
    expect(result.doctorAdvice).toBe("See a doctor if symptoms persist.");
  });
  it("retains urgency when long doctor advice needs a shorter line", () => {
    expect(symptomCardInsights(["See a doctor today if these symptoms have appeared suddenly and are severe or becoming worse over time."]).doctorAdvice).toBe("Seek medical care today if symptoms are sudden, severe or getting worse.");
  });
  it("counts positive logs and shared cycle groups", () => {
    expect(symptomPageData([row("2026-08-19", 19), row("2026-08-20", 20), row("2026-09-19", 19)], "Cramps")).toMatchObject({ count: 3, cycles: 2, trend: null });
  });
  it("tells one cycle's logs from logs spanning two cycles", () => {
    expect(symptomPageData([row("2026-09-19", 19), row("2026-09-20", 20)], "Cramps")).toMatchObject({ count: 2, cycles: 1 });
  });
  it("keeps a written line whole as one insight", () => {
    const line = "All in one cycle so far. After your next cycle I can tell you when it usually shows up.";
    expect(symptomCardInsights([{ text: line, keepTogether: true }]).insights).toEqual([line]);
  });
  it("counts logs without cycle days without inventing cycles", () => {
    expect(symptomPageData([row("2026-09-19", null)], "Cramps")).toMatchObject({ count: 1, cycles: 0 });
  });
  it("counts severity zero (old sheet default) as Mild, and has a true zero state", () => {
    expect(symptomPageData([{ ...row("2026-09-19", 19), symptoms: [{ name: "Cramps", severity: 0 }] }], "Cramps").count).toBe(1);
    expect(symptomPageData([], "Cramps").count).toBe(0);
  });
  it("compares equal elapsed cycle days, not a partial cycle to a whole one", () => {
    const logs = [row("2026-08-19", 19), row("2026-08-20", 20), row("2026-08-25", 25), row("2026-09-19", 19)];
    expect(symptomPageData(logs, "Cramps", "2026-09-01", Date.parse("2026-09-20T12:00:00Z")).trend).toBe("Less");
    expect(symptomPageData(logs, "Cramps", "2026-10-01").trend).toBeNull();
  });
  it("does not claim arbitrary notes helped", () => {
    expect(symptomPageData([row("2026-09-19", 19, "Went for a walk")], "Cramps").helped).toBeNull();
    expect(symptomPageData([row("2026-09-19", 19, "What helped me: a warm bath.")], "Cramps").helped).toBe("a warm bath");
  });
  it("puts safety ahead of calm definitions without inventing custom definitions", () => {
    expect(symptomDefinition("Hearing loss").safety).toContain("doctor");
    expect(symptomDefinition("Cramps").text).toContain("squeezing");
    expect(symptomDefinition("My custom feeling").text).toContain("name you're using");
  });
});