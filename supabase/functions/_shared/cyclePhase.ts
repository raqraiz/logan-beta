// Shared cycle phase helpers — mirror of src/lib/cyclePhase.ts (Deno runtime)

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export type DeclaredPhase = "Menstruation" | "Follicular" | "Ovulation" | "Luteal";

export function inferCycleLengthForDeclaredPhase(
  currentDay: number,
  declaredPhase: DeclaredPhase,
  currentLength: number,
): number | null {
  if (!Number.isFinite(currentDay) || currentDay < 1) return null;
  if (declaredPhase === "Luteal") return clamp(currentDay + 11, 18, 45);
  if (declaredPhase === "Ovulation") return clamp(currentDay + 14, 18, 45);
  if (declaredPhase === "Follicular")
    return currentDay <= 5 ? currentLength : clamp(Math.max(currentLength, currentDay + 16), 18, 45);
  // Menstruation
  return currentDay <= 5 ? currentLength : null;
}

export function autoCycleLengthFromHistory(rows: { cycle_length_days: number }[]): number {
  if (!rows?.length) return 28;
  const avg = Math.round(rows.reduce((s, r) => s + (r.cycle_length_days || 0), 0) / rows.length);
  return clamp(avg || 28, 18, 45);
}

/**
 * Single source of truth for "is phase tracking on". Driven by life_stage
 * ONLY. Birth control (on_hormonal_bc / birth_control_method) never turns
 * phase tracking off: many people on a hormonal IUD still cycle.
 * Mirror of src/lib/cyclePhase.ts — keep both in sync.
 */
export function isPhaseTrackingOn(
  input: string | null | undefined | { life_stage?: string | null },
): boolean {
  const stage = (typeof input === "object" && input !== null ? input.life_stage : input) || "cycling";
  return stage === "cycling" || stage === "perimenopause";
}
