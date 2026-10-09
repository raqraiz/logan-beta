/** Cycles outside this range are flagged as unusual unless she confirms them. */
export const TYPICAL_CYCLE_MIN_DAYS = 15;
export const TYPICAL_CYCLE_MAX_DAYS = 45;

export type TrustCheckRow = {
  cycle_length_days: number;
  confirmed_by_user_at?: string | null;
};

/** Unusually long or short, regardless of confirmation. */
export function cycleUnusualKind(lengthDays: number): "long" | "short" | null {
  if (lengthDays > TYPICAL_CYCLE_MAX_DAYS) return "long";
  if (lengthDays < TYPICAL_CYCLE_MIN_DAYS) return "short";
  return null;
}

/** The one "is this cycle trusted" check: typical length, or confirmed by her. */
export function isCycleTrusted(row: TrustCheckRow): boolean {
  return cycleUnusualKind(row.cycle_length_days) === null || !!row.confirmed_by_user_at;
}
