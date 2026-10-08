import { supabase } from "@/integrations/supabase/client";

/**
 * The shared symptom list is read through database functions, never straight from
 * the table. The functions return no author columns and apply the visibility rules
 * (approved, not deleted, built-in or used by 10+ women, plus her own words).
 *
 * Until the matching migration is applied, the functions do not exist yet. In that
 * case we fall back to the old direct read so the app keeps working during rollout.
 * Remove the fallbacks once the migration is live.
 */
const functionMissing = (err: { code?: string } | null) =>
  !!err && (err.code === "PGRST202" || err.code === "42883");

export interface VisibleSymptom {
  id: string;
  name: string;
  category: string | null;
  canonical_id: string | null;
  aliases: string[] | null;
}

export async function fetchVisibleSymptoms(): Promise<VisibleSymptom[]> {
  const { data, error } = await (supabase as any).rpc("get_visible_symptoms");
  if (!error) return (data ?? []) as VisibleSymptom[];
  if (!functionMissing(error)) {
    console.warn("symptom list unavailable:", error.message);
    return [];
  }
  const legacy = await supabase
    .from("community_symptoms")
    .select("id, name, category, canonical_id, aliases")
    .is("deleted_at", null);
  return (legacy.data ?? []) as VisibleSymptom[];
}

export interface SymptomNameRow {
  id: string;
  name: string;
  status: string;
  canonical_id: string | null;
}

/** Rows used to resolve merged or retired words found in old logs. */
export async function fetchSymptomNameMapRows(): Promise<SymptomNameRow[]> {
  const { data, error } = await (supabase as any).rpc("get_symptom_name_map");
  if (!error) return (data ?? []) as SymptomNameRow[];
  if (!functionMissing(error)) {
    console.warn("symptom name map unavailable:", error.message);
    return [];
  }
  const legacy = await supabase
    .from("community_symptoms")
    .select("id, name, status, canonical_id")
    .in("status", ["approved", "merged", "deprecated"]);
  return (legacy.data ?? []) as SymptomNameRow[];
}
