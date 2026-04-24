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
  spread: number; // max - min, indicator of how cyclical the pattern is
  confidence: "preliminary" | "emerging" | "clear";
  insight: string;
}

interface LogPoint {
  phase: string | null;
  intensity: number; // 1-5
}

/**
 * Compute cycle phase from a date + last_period_start + cycle_length_days.
 * Mirrors the biological model used elsewhere (luteal anchored to 14 days before next period).
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

  // Menstruation: days 1-5
  if (cycleDay <= 5) return "Menstruation";
  // Ovulation: 2 days around cycleLength - 14
  const ovulationDay = cycleLengthDays - 14;
  if (cycleDay >= ovulationDay - 1 && cycleDay <= ovulationDay + 1) return "Ovulation";
  // Follicular: post-period, pre-ovulation
  if (cycleDay < ovulationDay - 1) return "Follicular";
  // Luteal: post-ovulation
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

  // Confidence based on volume + phase coverage
  let confidence: CorrelationResult["confidence"] = "preliminary";
  if (totalLogs >= 20 && withData.length >= 3) confidence = "clear";
  else if (totalLogs >= 8 && withData.length >= 2) confidence = "emerging";

  const insight = buildInsight(itemName, peakPhase, lowestPhase, spread, confidence, totalLogs);

  return { phaseStats, totalLogs, peakPhase, lowestPhase, spread, confidence, insight };
}

function buildInsight(
  item: string,
  peak: Phase | null,
  lowest: Phase | null,
  spread: number,
  confidence: CorrelationResult["confidence"],
  totalLogs: number
): string {
  if (totalLogs === 0) {
    return `Start logging ${item} daily to see how it tracks with your cycle.`;
  }
  if (totalLogs < 4 || !peak) {
    return `Only ${totalLogs} log${totalLogs === 1 ? "" : "s"} so far. Keep tracking — patterns emerge after about a week.`;
  }
  if (spread < 0.5) {
    return `${item} stays fairly steady across your cycle so far — not strongly hormone-driven from what we've seen.`;
  }

  const confidencePrefix =
    confidence === "clear"
      ? "Clear pattern:"
      : confidence === "emerging"
      ? "Emerging pattern:"
      : "Early signal:";

  const direction = spread > 1.2 ? "noticeably higher" : "higher";
  return `${confidencePrefix} ${item} runs ${direction} during your **${peak}** phase${
    lowest && lowest !== peak ? ` and lowest in **${lowest}**` : ""
  }.`;
}
