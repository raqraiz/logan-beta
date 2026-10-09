import { supabase } from "@/integrations/supabase/client";
import { getAnalyticsConsent } from "@/lib/thirdPartyAnalytics";
import { kgToLbs, lbsToKg } from "@/lib/nutrition";

export type WeightUnit = "kg" | "lbs";

export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 300;
/** Same key the Home weight tracker uses. Goals only reads it, never writes it. */
const UNIT_KEY = "logan_weight_unit";

/** Her unit from the Home weight tracker; kg if she never chose one. */
export function readWeightUnit(): WeightUnit {
  try {
    const v = localStorage.getItem(UNIT_KEY);
    return v === "lbs" ? "lbs" : "kg";
  } catch {
    return "kg";
  }
}

/** kg to the text shown in an input, one decimal, no trailing ".0". */
export function kgToInputText(kg: number | null | undefined, unit: WeightUnit): string {
  if (kg == null || !Number.isFinite(Number(kg)) || Number(kg) <= 0) return "";
  const v = unit === "kg" ? Number(kg) : kgToLbs(Number(kg));
  return String(Math.round(v * 10) / 10);
}

/** ok=false means invalid (see message); empty=true means left blank; otherwise kg is set. */
export interface WeightParse { ok: boolean; empty: boolean; kg: number; message: string }

/** Validates what she typed in her unit and converts to kg (2 decimals, as stored). */
export function parseWeightInput(text: string, unit: WeightUnit): WeightParse {
  const t = text.trim();
  if (t === "") return { ok: true, empty: true, kg: 0, message: "" };
  const n = Number(t);
  const lo = unit === "kg" ? MIN_WEIGHT_KG : Math.ceil(kgToLbs(MIN_WEIGHT_KG));
  const hi = unit === "kg" ? MAX_WEIGHT_KG : Math.floor(kgToLbs(MAX_WEIGHT_KG));
  const message = `Enter a weight between ${lo} and ${hi} ${unit}.`;
  if (!Number.isFinite(n)) return { ok: false, empty: false, kg: 0, message };
  const kg = unit === "kg" ? n : lbsToKg(n);
  if (kg < MIN_WEIGHT_KG - 0.005 || kg > MAX_WEIGHT_KG + 0.005) return { ok: false, empty: false, kg: 0, message };
  return { ok: true, empty: false, kg: Math.round(kg * 100) / 100, message: "" };
}

/** Adds today's entry, or updates it if one exists. Returns true on success. */
export async function saveTodaysWeight(userId: string, kg: number, today: string): Promise<boolean> {
  const { error } = await supabase
    .from("weight_logs")
    .upsert({ user_id: userId, weight_kg: kg, logged_on: today }, { onConflict: "user_id,logged_on" });
  return !error;
}

/** Event name only, never the weight. Respects analytics consent. */
export async function trackWeightEntrySaved(userId: string) {
  if (getAnalyticsConsent() !== "granted") return;
  await supabase.from("feature_events").insert({ user_id: userId, feature_name: "weight_entry_saved" });
}
