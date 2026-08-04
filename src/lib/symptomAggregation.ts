export interface SymptomEntryLike {
  name?: string;
  severity?: number;
}

export interface SymptomLogLike {
  symptoms?: SymptomEntryLike[] | null;
  notes?: string | null;
}

export interface SymptomPattern {
  name: string;
  count: number;
  avgSeverity: number;
}

/**
 * A log counts as "notes only" when it carries no named symptom but does carry
 * a written note — e.g. a chat entry or a free-text widget entry. Pattern views
 * used to aggregate purely on `symptoms[].name`, so these logs were silently
 * dropped and the user saw nothing for something she had definitely recorded.
 */
export function isNotesOnlyLog(log: SymptomLogLike): boolean {
  const named = (log.symptoms ?? []).filter((s) => {
    const n = typeof s === "string" ? s : s?.name;
    return Boolean(n && String(n).trim());
  });
  return named.length === 0 && Boolean(log.notes && log.notes.trim());
}

export function countNotesOnlyLogs(logs: SymptomLogLike[]): number {
  return logs.reduce((acc, log) => acc + (isNotesOnlyLog(log) ? 1 : 0), 0);
}

/** Frequency + average severity per named symptom, most frequent first. */
export function aggregateSymptomPatterns(logs: SymptomLogLike[], limit?: number): SymptomPattern[] {
  const freq: Record<string, { count: number; totalSev: number }> = {};
  logs.forEach((log) => {
    (log.symptoms ?? []).forEach((s) => {
      const name = typeof s === "string" ? s : s?.name;
      if (!name || !String(name).trim()) return;
      const key = String(name);
      if (!freq[key]) freq[key] = { count: 0, totalSev: 0 };
      freq[key].count++;
      freq[key].totalSev += Number((s as SymptomEntryLike)?.severity ?? 0) || 0;
    });
  });

  const sorted = Object.entries(freq)
    .map(([name, { count, totalSev }]) => ({
      name,
      count,
      avgSeverity: Math.round((totalSev / count) * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
}
