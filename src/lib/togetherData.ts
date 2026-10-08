import { supabase } from "@/integrations/supabase/client";
import { fetchVisibleSymptoms } from "@/lib/communitySymptoms";
import { canonicalSymptom, groupOf, togetherDisplay, togetherNorm } from "@/lib/symptomCatalog";

export type TogetherCategory = "mood" | "body" | "sleep";
export interface AggRow { filter: string; symptom: string; women_band: "exact" | "few"; women_count: number | null }

export const CATEGORY_PILLS: { id: "all" | TogetherCategory; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "mood", label: "Mood & mind" },
  { id: "body", label: "Body" },
  { id: "sleep", label: "Sleep" },
];

export function mapCategory(c: string | null | undefined): TogetherCategory | null {
  if (!c) return null;
  if (c === "Mood & Cognitive" || c === "Mood & mind") return "mood";
  if (c === "Sleep & Energy" || c === "Sleep & energy") return "sleep";
  if (c === "Body") return "body";
  if (["Skin & Body", "Pain", "Digestive", "Reproductive & Discharge", "Ear/Nose/Throat"].includes(c)) return "body";
  return null;
}

/** Comparison key matching the server totals, with aliases folded into their main name. */
export const key = (s: string) => togetherNorm(canonicalSymptom(togetherDisplay(s)));
export const display = (s: string) => togetherDisplay(s);
/** Exact counts below 10 are never shown, as an extra guard on top of the server. */
export const countLabel = (r: AggRow) =>
  r.women_band === "exact" && (r.women_count ?? 0) >= 10 ? String(r.women_count) : "A few women";
export const isExact = (r: AggRow) => r.women_band === "exact" && (r.women_count ?? 0) >= 10;

export async function loadAggregates(): Promise<AggRow[]> {
  const { data, error } = await supabase.rpc("get_together_aggregates" as any);
  if (error) throw error;
  return (data ?? []) as AggRow[];
}

export async function loadCategories(): Promise<Map<string, TogetherCategory>> {
  const data = await fetchVisibleSymptoms();
  const m = new Map<string, TogetherCategory>();
  for (const r of data as any[]) {
    const c = mapCategory(r.category);
    if (!c) continue;
    m.set(key(r.name), mapCategory(groupOf(r.name)) ?? c);
    for (const a of r.aliases ?? []) m.set(key(a), c);
  }
  return m;
}

/** Made-up totals for the admin preview. Never saved anywhere. */
export function sampleAggregates(): { rows: AggRow[]; mine: Set<string>; cats: Map<string, TogetherCategory> } {
  const list: [string, number | null, TogetherCategory | null][] = [
    ["cramps", 64, "body"], ["bloating", 52, "body"], ["tiredness", 47, "sleep"], ["irritability", 38, "mood"],
    ["headache", 31, "body"], ["anxiety", 27, "mood"], ["trouble sleeping", 22, "sleep"], ["breast tenderness", 18, "body"],
    ["brain fog", 14, "mood"], ["acne", 11, "body"], ["tinnitus", null, "body"], ["vivid dreams", null, "sleep"],
    ["itchy skin", null, "body"], ["feeling teary", null, "mood"], ["muffled hearing", null, "body"],
  ];
  const rows: AggRow[] = [];
  for (const f of ["everyone", "stage", "cycle_day"]) {
    list.forEach(([s, n], i) => {
      const adj = n === null ? null : Math.max(10, n - (f === "everyone" ? 0 : f === "stage" ? 6 + (i % 3) : 9 + (i % 4)));
      rows.push({ filter: f, symptom: s, women_band: adj === null ? "few" : "exact", women_count: adj });
    });
  }
  const cats = new Map<string, TogetherCategory>();
  list.forEach(([s, , c]) => c && cats.set(s, c));
  return { rows, mine: new Set(["bloating", "brain fog"]), cats };
}

/** Admin preview only: sample day shares and her sample usual days for one symptom. Never real data. */
export function sampleSymptomDetail(name: string, cycleLength = 28) {
  const base = sampleAggregates();
  const k = key(name);
  const idx = Math.max(0, base.rows.findIndex((r) => r.filter === "everyone" && key(r.symptom) === k));
  const peak = 3 + ((idx * 5) % (cycleLength - 6));
  const shares = (p: number) => {
    const out: Record<string, number> = {};
    for (let d = 1; d <= cycleLength; d++) out[String(d)] = Math.round(1000 * Math.exp(-((d - p) ** 2) / 8)) / 1000;
    return out;
  };
  const noStage = idx % 4 === 3; // some symptoms show "Not enough women in your stage yet."
  const found = base.rows.filter((r) => key(r.symptom) === k && r.filter !== "cycle_day");
  const rows = (found.length ? found : [
    { filter: "everyone", symptom: k, women_band: "exact" as const, women_count: 24 },
    { filter: "stage", symptom: k, women_band: "exact" as const, women_count: 15 },
  ]).map((r) => ({ ...r, cohort_women: r.filter === "stage" ? 70 : 120, day_shares: r.filter === "stage" ? (noStage ? null : shares(peak + 1)) : shares(peak) }));
  const from = Math.min(cycleLength - 2, peak + 3);
  const hers = [...base.mine].some((m) => key(m) === k);
  const window = hers ? { from, to: from + 2 } : null;
  const now = Date.now();
  const logs = (hers ? [0, 1, 2] : []).map((c) => ({
    logged_at: new Date(now - (c * cycleLength + 2) * 86400000).toISOString(),
    cycle_day: from + (c % 2), symptoms: [{ name: k, severity: 3 }], notes: null,
  }));
  return { rows, window, logs };
}
