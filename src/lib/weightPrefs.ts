// Weight tracker settings live on the weight_trend widget config (home_widget_preferences).
export interface WeightPrefs { visible: boolean; showExact?: boolean; inDoctorSummary?: boolean; remind?: boolean }

/** One plain sentence about the trend. Never a judgement, never a number. */
export function weightTrendLine(kgOldestFirst: number[]): string {
  if (kgOldestFirst.length < 3) return "Log a few weigh-ins and I'll show you the shape of it.";
  const first = kgOldestFirst.slice(0, Math.ceil(kgOldestFirst.length / 3));
  const last = kgOldestFirst.slice(-Math.ceil(kgOldestFirst.length / 3));
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const d = avg(last) - avg(first);
  if (Math.abs(d) < 0.5) return "Steady. Small daily swings are normal.";
  return d > 0 ? "Up a little lately. Shifts around your period are often water, not fat." : "Down a little lately. Small swings are normal.";
}
