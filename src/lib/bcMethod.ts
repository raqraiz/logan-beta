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
