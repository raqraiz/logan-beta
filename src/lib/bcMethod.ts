// Mirrors supabase/functions/_shared/bcMethod.ts. NULL = type unknown.
export const BC_METHOD_OPTIONS = [
  { value: "combined_pill_with_breaks", label: "Pill with a monthly break" },
  { value: "continuous_pill", label: "Pill every day, no break" },
  { value: "progestin_only_pill", label: "Mini pill" },
  { value: "hormonal_iud", label: "Hormonal IUD (like Mirena or Kyleena)" },
  { value: "copper_iud", label: "Copper IUD (non-hormonal)" },
  { value: "implant", label: "Implant" },
  { value: "injection", label: "Shot" },
  { value: "ring_or_patch", label: "Ring or patch" },
  { value: "other", label: "Something else" },
  { value: "not_sure", label: "Not sure" },
] as const;

export type BcMethod = typeof BC_METHOD_OPTIONS[number]["value"];

export const bcMethodLabel = (v: string | null | undefined) =>
  BC_METHOD_OPTIONS.find((o) => o.value === v)?.label ?? null;

export const HORMONAL_BC_METHODS = [
  "combined_pill_with_breaks", "continuous_pill", "progestin_only_pill",
  "hormonal_iud", "implant", "injection", "ring_or_patch",
] as const;
export const isHormonalMethod = (v: string | null | undefined) =>
  !!v && (HORMONAL_BC_METHODS as readonly string[]).includes(v);

/** "Which kind?" options filtered by the parent answer. */
export function bcMethodOptionsFor(parent: "hormonal" | "non_hormonal") {
  const allowed = parent === "non_hormonal"
    ? ["copper_iud", "other", "not_sure"]
    : [...HORMONAL_BC_METHODS, "other", "not_sure"];
  return BC_METHOD_OPTIONS.filter((o) => allowed.includes(o.value));
}

/** Hormonal-BC copy may show only for hormonal methods or unknown (NULL). */
export const allowsHormonalBcCopy = (v: string | null | undefined) => !v || isHormonalMethod(v);
