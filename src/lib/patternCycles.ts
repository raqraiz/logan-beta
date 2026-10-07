// Shared cycle grouping for Your patterns and the One pattern page, so the pattern line and grid always agree.
export const DAY = 86400000;
export const PATTERNS_CHANGED = "logan:patterns-changed";

export type LogRow = { logged_at: string; cycle_day: number | null; symptoms: unknown };
export type Pt = { day: number; start: number; t: number };

/** Points per symptom (lowercased): cycle day + estimated cycle start. Skips severity 0 entries. */
export function symptomPoints(rows: LogRow[]): Record<string, Pt[]> {
  const by: Record<string, Pt[]> = {};
  for (const r of rows) {
    if (!r.cycle_day || r.cycle_day < 1) continue;
    const t = new Date(r.logged_at).getTime();
    const start = t - (r.cycle_day - 1) * DAY;
    for (const s of (Array.isArray(r.symptoms) ? r.symptoms : []) as { name?: string; severity?: number }[]) {
      const raw = typeof s === "string" ? s : s?.name;
      if (!raw || !String(raw).trim()) continue;
      if (typeof s !== "string" && typeof s?.severity === "number" && s.severity <= 0) continue;
      const key = String(raw).trim().toLowerCase();
      (by[key] ??= []).push({ day: r.cycle_day, start, t });
    }
  }
  return by;
}

/** Group estimated cycle starts within ~10 days of each other as one cycle. */
export function groupCycles(points: Pt[]): { start: number; days: number[] }[] {
  const pts = [...points].sort((a, b) => a.start - b.start);
  const groups: { start: number; days: number[] }[] = []; let anchor = -Infinity;
  for (const p of pts) {
    if (p.start - anchor > 10 * DAY) { groups.push({ start: p.start, days: [] }); anchor = p.start; }
    groups[groups.length - 1].days.push(p.day);
  }
  return groups;
}

export const PATTERN_WINDOW_DAYS = 200;
