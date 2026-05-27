// Phase-based correlation analysis for tracker logs and symptom logs

export type Phase = "Menstruation" | "Follicular" | "Ovulation" | "Luteal";
export const PHASES: Phase[] = ["Menstruation", "Follicular", "Ovulation", "Luteal"];

export interface PhaseStat {
  phase: Phase;
  avg: number;
  count: number;
}

export interface CorrelationResult {
  phaseStats: PhaseStat[];
  totalLogs: number;
  peakPhase: Phase | null;
  lowestPhase: Phase | null;
  spread: number;
  confidence: "preliminary" | "emerging" | "clear";
  insight: string;
}

interface LogPoint {
  phase: string | null;
  intensity: number; // 1-5
}

interface NominalLog {
  phase: string | null;
  option: string;
}

export interface NominalCell {
  phase: Phase;
  option: string;
  count: number;
}

export interface NominalResult {
  cells: NominalCell[];                // phase × option counts
  totalsPerPhase: Record<Phase, number>;
  totalsPerOption: Record<string, number>;
  totalLogs: number;
  topByPhase: Partial<Record<Phase, { option: string; count: number; pct: number }>>;
  topByOption: Record<string, { phase: Phase; count: number; pct: number }>;
  confidence: "preliminary" | "emerging" | "clear";
  insight: string;
}

/**
 * Compute cycle phase from a date + last_period_start + cycle_length_days.
 */
export function getPhaseForDate(
  date: Date,
  lastPeriodStart: string | Date,
  cycleLengthDays: number
): Phase {
  const start = new Date(lastPeriodStart);
  const msPerDay = 24 * 60 * 60 * 1000;
  let dayDiff = Math.floor((date.getTime() - start.getTime()) / msPerDay);
  if (dayDiff < 0) dayDiff = 0;
  const cycleDay = (dayDiff % cycleLengthDays) + 1;

  if (cycleDay <= 5) return "Menstruation";
  const ovulationDay = cycleLengthDays - 14;
  if (cycleDay >= ovulationDay - 1 && cycleDay <= ovulationDay + 1) return "Ovulation";
  if (cycleDay < ovulationDay - 1) return "Follicular";
  return "Luteal";
}

export function analyzeCorrelation(logs: LogPoint[], itemName = "this"): CorrelationResult {
  const buckets: Record<Phase, { sum: number; count: number }> = {
    Menstruation: { sum: 0, count: 0 },
    Follicular: { sum: 0, count: 0 },
    Ovulation: { sum: 0, count: 0 },
    Luteal: { sum: 0, count: 0 },
  };

  for (const l of logs) {
    if (!l.phase) continue;
    const p = l.phase as Phase;
    if (buckets[p]) {
      buckets[p].sum += l.intensity;
      buckets[p].count += 1;
    }
  }

  const phaseStats: PhaseStat[] = PHASES.map((p) => ({
    phase: p,
    avg: buckets[p].count > 0 ? buckets[p].sum / buckets[p].count : 0,
    count: buckets[p].count,
  }));

  const totalLogs = phaseStats.reduce((s, p) => s + p.count, 0);
  const withData = phaseStats.filter((p) => p.count > 0);

  let peakPhase: Phase | null = null;
  let lowestPhase: Phase | null = null;
  let spread = 0;

  if (withData.length > 0) {
    const sorted = [...withData].sort((a, b) => b.avg - a.avg);
    peakPhase = sorted[0].phase;
    lowestPhase = sorted[sorted.length - 1].phase;
    spread = sorted[0].avg - sorted[sorted.length - 1].avg;
  }

  let confidence: CorrelationResult["confidence"] = "preliminary";
  if (totalLogs >= 20 && withData.length >= 3) confidence = "clear";
  else if (totalLogs >= 8 && withData.length >= 2) confidence = "emerging";

  const insight = buildInsight(itemName, peakPhase, lowestPhase, spread, confidence, totalLogs);

  return { phaseStats, totalLogs, peakPhase, lowestPhase, spread, confidence, insight };
}

export function analyzeNominalCorrelation(
  logs: NominalLog[],
  itemName = "this",
  optionsOrder: string[] = []
): NominalResult {
  const totalsPerPhase: Record<Phase, number> = {
    Menstruation: 0, Follicular: 0, Ovulation: 0, Luteal: 0,
  };
  const totalsPerOption: Record<string, number> = {};
  const cellMap = new Map<string, number>();
  let total = 0;

  for (const l of logs) {
    if (!l.phase || !l.option) continue;
    const p = l.phase as Phase;
    if (!(p in totalsPerPhase)) continue;
    const k = `${p}::${l.option}`;
    cellMap.set(k, (cellMap.get(k) || 0) + 1);
    totalsPerPhase[p]++;
    totalsPerOption[l.option] = (totalsPerOption[l.option] || 0) + 1;
    total++;
  }

  const optionList = optionsOrder.length
    ? optionsOrder.filter((o) => totalsPerOption[o])
    : Object.keys(totalsPerOption);

  const cells: NominalCell[] = [];
  for (const phase of PHASES) {
    for (const option of optionList) {
      cells.push({ phase, option, count: cellMap.get(`${phase}::${option}`) || 0 });
    }
  }

  const topByPhase: NominalResult["topByPhase"] = {};
  for (const phase of PHASES) {
    let best: { option: string; count: number } | null = null;
    for (const option of optionList) {
      const c = cellMap.get(`${phase}::${option}`) || 0;
      if (c > 0 && (!best || c > best.count)) best = { option, count: c };
    }
    if (best && totalsPerPhase[phase] > 0) {
      topByPhase[phase] = {
        option: best.option,
        count: best.count,
        pct: best.count / totalsPerPhase[phase],
      };
    }
  }

  const topByOption: NominalResult["topByOption"] = {};
  for (const option of optionList) {
    let best: { phase: Phase; count: number } | null = null;
    for (const phase of PHASES) {
      const c = cellMap.get(`${phase}::${option}`) || 0;
      if (c > 0 && (!best || c > best.count)) best = { phase, count: c };
    }
    if (best && totalsPerOption[option] > 0) {
      topByOption[option] = {
        phase: best.phase,
        count: best.count,
        pct: best.count / totalsPerOption[option],
      };
    }
  }

  let confidence: NominalResult["confidence"] = "preliminary";
  const phasesCovered = PHASES.filter((p) => totalsPerPhase[p] > 0).length;
  if (total >= 20 && phasesCovered >= 3) confidence = "clear";
  else if (total >= 8 && phasesCovered >= 2) confidence = "emerging";

  const insight = buildNominalInsight(itemName, topByOption, confidence, total);

  return { cells, totalsPerPhase, totalsPerOption, totalLogs: total, topByPhase, topByOption, confidence, insight };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

function buildInsight(
  itemRaw: string,
  peak: Phase | null,
  lowest: Phase | null,
  spread: number,
  confidence: CorrelationResult["confidence"],
  totalLogs: number
): string {
  const item = escapeHtml(itemRaw);
  if (totalLogs === 0) return `Start logging ${item} daily to see how it tracks with your cycle.`;
  if (totalLogs < 4 || !peak) {
    return `Only ${totalLogs} log${totalLogs === 1 ? "" : "s"} so far. Keep tracking — patterns emerge after about a week.`;
  }
  if (spread < 0.5) {
    return `${item} stays fairly steady across your cycle so far — not strongly hormone-driven from what we've seen.`;
  }
  const confidencePrefix =
    confidence === "clear" ? "Clear pattern:" : confidence === "emerging" ? "Emerging pattern:" : "Early signal:";
  const direction = spread > 1.2 ? "noticeably higher" : "higher";
  return `${confidencePrefix} ${item} runs ${direction} during your **${peak}** phase${
    lowest && lowest !== peak ? ` and lowest in **${lowest}**` : ""
  }.`;
}

function buildNominalInsight(
  itemRaw: string,
  topByOption: NominalResult["topByOption"],
  confidence: NominalResult["confidence"],
  totalLogs: number
): string {
  const item = escapeHtml(itemRaw);
  if (totalLogs === 0) return `Start logging ${item} daily to see how it tracks with your cycle.`;
  if (totalLogs < 4) {
    return `Only ${totalLogs} log${totalLogs === 1 ? "" : "s"} so far. Keep tracking — patterns emerge after about a week.`;
  }

  // Pick the strongest option→phase signal (highest pct with at least 3 logs of that option)
  const candidates = Object.entries(topByOption)
    .filter(([_, v]) => v.count >= 3)
    .sort((a, b) => b[1].pct - a[1].pct);

  if (candidates.length === 0) {
    return `${item} is spread across phases so far — keep logging and a pattern may emerge.`;
  }
  const [option, info] = candidates[0];
  const prefix =
    confidence === "clear" ? "Clear pattern:" : confidence === "emerging" ? "Emerging pattern:" : "Early signal:";
  const pct = Math.round(info.pct * 100);
  return `${prefix} **${escapeHtml(option)}** shows up most in your **${info.phase}** phase (${pct}% of the time).`;
}
