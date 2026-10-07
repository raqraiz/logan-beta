import { supabase } from "@/integrations/supabase/client";

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
  if (c === "Mood & Cognitive") return "mood";
  if (c === "Sleep & Energy") return "sleep";
  if (["Skin & Body", "Pain", "Digestive", "Reproductive & Discharge", "Ear/Nose/Throat"].includes(c)) return "body";
  return null;
}

export const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
export const display = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
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
  const { data } = await supabase.from("community_symptoms").select("name, aliases, category").is("deleted_at", null);
  const m = new Map<string, TogetherCategory>();
  for (const r of (data ?? []) as any[]) {
    const c = mapCategory(r.category);
    if (!c) continue;
    m.set(key(r.name), c);
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
