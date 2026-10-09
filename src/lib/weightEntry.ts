import { supabase } from "@/integrations/supabase/client";
import { getAnalyticsConsent } from "@/lib/thirdPartyAnalytics";
import { kgToLbs, lbsToKg } from "@/lib/nutrition";

export type WeightUnit = "kg" | "lbs";

export const MIN_WEIGHT_KG = 30;
export const MAX_WEIGHT_KG = 300;
// v2: the first version was also written automatically on load, so those values were not real choices.
const UNIT_KEY = "logan_weight_unit_v2";
const OLD_UNIT_KEY = "logan_weight_unit";

/** US time zones (IANA zone.tab for US, plus older names browsers can still report). */
const US_TIME_ZONES = new Set([
  "America/New_York", "America/Detroit", "America/Chicago", "America/Menominee",
  "America/Denver", "America/Boise", "America/Phoenix", "America/Los_Angeles",
  "America/Anchorage", "America/Juneau", "America/Sitka", "America/Metlakatla", "America/Yakutat", "America/Nome", "America/Adak",
  "Pacific/Honolulu",
  // legacy names for the same places
  "America/Indianapolis", "America/Fort_Wayne", "America/Louisville", "America/Knox_IN", "America/Shiprock", "America/Atka", "Pacific/Johnston",
  "US/Eastern", "US/Central", "US/Mountain", "US/Pacific", "US/Alaska", "US/Arizona", "US/Hawaii", "US/Aleutian", "US/Michigan", "US/East-Indiana", "US/Indiana-Starke",
]);
const US_TIME_ZONE_PREFIXES = ["America/Indiana/", "America/Kentucky/", "America/North_Dakota/"];

function isUsTimeZone(tz: string | undefined): boolean {
  if (!tz) return false;
  return US_TIME_ZONES.has(tz) || US_TIME_ZONE_PREFIXES.some((p) => tz.startsWith(p));
}

/** lbs for US time zones, kg everywhere else. Only used until she picks a unit. */
export function defaultWeightUnit(): WeightUnit {
  try {
    return isUsTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) ? "lbs" : "kg";
  } catch {
    return "kg";
  }
}

/** The one place the weight unit is read: her saved choice, else the time zone default. */
export function readWeightUnit(): WeightUnit {
  try {
    localStorage.removeItem(OLD_UNIT_KEY); // one-time clear of values the old auto-save wrote
    const v = localStorage.getItem(UNIT_KEY);
    if (v === "kg" || v === "lbs") return v;
  } catch { /* storage blocked: fall through to the default */ }
  return defaultWeightUnit();
}

/** Saves her choice. Call only when she picks a unit, never to store the default. */
export function saveWeightUnit(unit: WeightUnit) {
  try { localStorage.setItem(UNIT_KEY, unit); } catch { /* storage blocked: choice lasts this session only */ }
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
