// User-editable phase lengths.
// All four are optional. When a value is absent we fall back to the historical
// hardcoded assumptions in calculateCycleInfo (derived from cycle length):
//   menstruation = 5 days
//   ovulation window = 4 days (ovulationDay-1 .. ovulationDay+2, ovulationDay = cycleLength - 14)
//   follicular = everything between menstruation end and ovulation start (7 days on a 28-day cycle)
//   luteal = everything after the ovulation window (12 days on a 28-day cycle)

export interface PhaseLengths {
  menstruation_days?: number | null;
  follicular_days?: number | null;
  ovulation_window_days?: number | null;
  luteal_days?: number | null;
}

export const PHASE_LENGTH_BOUNDS = {
  menstruation_days: { min: 1, max: 10 },
  follicular_days: { min: 3, max: 30 },
  ovulation_window_days: { min: 1, max: 7 },
  luteal_days: { min: 5, max: 20 },
} as const;

/** Defaults as they behave today for a given cycle length (28 by default). */
export function defaultPhaseLengths(cycleLengthDays: number = 28) {
  const len = Number.isFinite(cycleLengthDays) && cycleLengthDays > 0 ? cycleLengthDays : 28;
  const menstruation = 5;
  const ovulationDay = len - 14;
  const ovulationStart = ovulationDay - 1;
  const ovulationEnd = ovulationDay + 2;
  return {
    menstruation_days: menstruation,
    follicular_days: Math.max(1, ovulationStart - menstruation - 1 + 1), // days between bleed end and ovulation start
    ovulation_window_days: Math.max(1, ovulationEnd - ovulationStart + 1),
    luteal_days: Math.max(1, len - ovulationEnd),
  };
}

export function clampPhaseLength(key: keyof typeof PHASE_LENGTH_BOUNDS, value: number) {
  const b = PHASE_LENGTH_BOUNDS[key];
  return Math.max(b.min, Math.min(b.max, Math.round(value)));
}

/** Total cycle length implied by the four values (display only). */
export function totalCycleLength(v: PhaseLengths, cycleLengthDays: number = 28) {
  const d = defaultPhaseLengths(cycleLengthDays);
  return (
    (v.menstruation_days ?? d.menstruation_days) +
    (v.follicular_days ?? d.follicular_days) +
    (v.ovulation_window_days ?? d.ovulation_window_days) +
    (v.luteal_days ?? d.luteal_days)
  );
}

// --- Global prefs so every calculateCycleInfo call site (widgets, forecast,
// chat cards) uses the same source of truth without prop drilling. ---
let currentPrefs: PhaseLengths | null = null;

export function setPhaseLengthPrefs(prefs: PhaseLengths | null) {
  currentPrefs = prefs;
}

export function getPhaseLengthPrefs(): PhaseLengths | null {
  return currentPrefs;
}
