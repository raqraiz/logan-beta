// Shared cycle grouping for Your patterns and the One pattern page, so the pattern line and grid always agree.
import { canonicalSymptom } from "@/lib/symptomCatalog";

export const DAY = 86400000;
export const PATTERNS_CHANGED = "logan:patterns-changed";

export type LogRow = { logged_at: string; cycle_day: number | null; symptoms: unknown };
export type Pt = { day: number; start: number; t: number };

/** Points per symptom (lowercased): cycle day + estimated cycle start. Severity 0 (old sheet default) counts as Mild. */
export function symptomPoints(rows: LogRow[]): Record<string, Pt[]> {
  const by: Record<string, Pt[]> = {};
  for (const r of rows) {
    if (!r.cycle_day || r.cycle_day < 1) continue;
    const t = new Date(r.logged_at).getTime();
    const start = t - (r.cycle_day - 1) * DAY;
    for (const s of (Array.isArray(r.symptoms) ? r.symptoms : []) as { name?: string; severity?: number }[]) {
      const raw = typeof s === "string" ? s : s?.name;
      if (!raw || !String(raw).trim()) continue;
      if (typeof s !== "string" && typeof s?.severity === "number" && s.severity < 0) continue;
      const key = canonicalSymptom(String(raw)).toLowerCase();
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

/** Her own logs: last 12 months. */
export const PATTERN_WINDOW_DAYS = 365;

export type CycleWindow = { from: number; to: number };

/** Ordered days in a circular window, including an end-to-start stretch. */
export function windowDays(window: CycleWindow, length: number): number[] {
  if (window.from < 1 || window.to < 1 || window.from > length || window.to > length) return [];
  const count = (window.to - window.from + length) % length + 1;
  return Array.from({ length: count }, (_, i) => (window.from - 1 + i) % length + 1);
}

/** Signed shortest distance on the same cycle loop. */
export function cycleDistance(from: number, to: number, length: number): number {
  return ((to - from + length / 2) % length + length) % length - length / 2;
}

export function windowMiddle(window: CycleWindow, length: number): number {
  const days = windowDays(window, length);
  return days[Math.floor((days.length - 1) / 2)] ?? window.from;
}

/** Most logs in each of at least two cycles must fit the same seven-day circular window. */
export function usualWindow(groups: number[][], length: number): (CycleWindow & { n: number }) | null {
  let best: (CycleWindow & { n: number; hits: number; width: number }) | null = null;
  for (let start = 1; start <= length; start++) {
    let n = 0;
    const offsets: number[] = [];
    for (const group of groups) {
      const valid = group.filter((d) => d >= 1 && d <= length);
      const hits = valid.map((d) => (d - start + length) % length).filter((d) => d < 7);
      if (hits.length * 2 > group.length) { n++; offsets.push(...hits); }
    }
    if (n < 2) continue;
    const first = Math.min(...offsets), last = Math.max(...offsets);
    const candidate = { from: (start - 1 + first) % length + 1, to: (start - 1 + last) % length + 1, n, hits: offsets.length, width: last - first };
    if (!best || n > best.n || (n === best.n && (candidate.hits > best.hits || (candidate.hits === best.hits && candidate.width < best.width)))) best = candidate;
  }
  return best ? { from: best.from, to: best.to, n: best.n } : null;
}
