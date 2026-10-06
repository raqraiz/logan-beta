import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from "recharts";

interface SymptomEntry {
  name: string;
  severity: number;
}

interface SymptomLog {
  symptoms: SymptomEntry[];
}

// Premium gradient palette — each slice gets a rich gradient that glows on the dark canvas.
// Stored as [start, end] pairs for radial gradient rendering.
export const PIE_GRADIENTS: [string, string][] = [
  ["#0E8A8F", "#0E8A8F"],
  ["#22C3CE", "#22C3CE"],
  ["#6E675F", "#6E675F"],
  ["#4FA6AA", "#4FA6AA"],
  ["#7AD9DF", "#7AD9DF"],
  ["#A39C93", "#A39C93"],
  ["#0A6468", "#0A6468"],
  ["#C9C3BA", "#C9C3BA"],
];

export const PIE_COLORS = PIE_GRADIENTS.map(([a]) => a);

interface SymptomPieChartProps {
  logs: SymptomLog[];
  compact?: boolean;
}

export function SymptomPieChart({ logs, compact = false }: SymptomPieChartProps) {
  const { data, totalEntries, sortedLength, topName, topPct } = useMemo(() => {
    const counts = new Map<string, number>();
    let total = 0;
    logs.forEach((log) => {
      log.symptoms.forEach((s) => {
        counts.set(s.name, (counts.get(s.name) || 0) + 1);
        total += 1;
      });
    });

    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const TOP = 6;
    const top = sorted.slice(0, TOP).map(([name, count]) => ({ name, count }));
    const restCount = sorted.slice(TOP).reduce((s, [, c]) => s + c, 0);
    const chartData = restCount > 0 ? [...top, { name: "Other", count: restCount }] : top;

    const topEntry = sorted[0];
    const topP = total > 0 && topEntry ? Math.round((topEntry[1] / total) * 100) : 0;

    return {
      data: chartData,
      totalEntries: total,
      sortedLength: sorted.length,
      topName: topEntry?.[0] ?? ", ",
      topPct: topP,
    };
  }, [logs]);

  if (totalEntries === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 text-center">
        <p className="text-xs text-muted-foreground">Log a few symptoms to see your breakdown.</p>
      </div>
    );
  }

  const containerSize = compact ? "h-28 w-28" : "h-40 w-40";
  const outerRadius = compact ? 48 : 64;
  const innerRadius = compact ? 28 : 36;

  // Build unique gradient IDs for this instance
  const gid = "grad";

  return (
    <div className="rounded-xl gradient-card border border-border/40 p-4 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h4
          className="text-[11px] font-semibold uppercase tracking-widest text-foreground/70"
          style={{ fontFamily: "'Quicksand', sans-serif" }}
        >
          Symptom Breakdown
        </h4>
        <span className="text-[10px] text-muted-foreground">
          {sortedLength} symptom{sortedLength === 1 ? "" : "s"} · {totalEntries} log{totalEntries === 1 ? "" : "s"}
        </span>
      </div>

      <div className="hairline mb-3" />

      <div className="flex items-center gap-4">
        {/* Donut */}
        <div className={`${containerSize} shrink-0 relative`}>
          {/* Subtle ambient glow behind chart */}
          <div
            className="absolute inset-0 rounded-full opacity-30 blur-2xl"
            style={{
              background: `radial-gradient(circle, hsl(168 80% 42% / 0.35), transparent 70%)`,
            }}
          />
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <defs>
                {data.map((_, i) => {
                  const [start, end] = PIE_GRADIENTS[i] || PIE_GRADIENTS[PIE_GRADIENTS.length - 1];
                  return (
                    <radialGradient key={i} id={`${gid}-${i}`} cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                      <stop offset="0%" stopColor={start} />
                      <stop offset="100%" stopColor={end} />
                    </radialGradient>
                  );
                })}
              </defs>
              <Pie
                data={data}
                dataKey="count"
                nameKey="name"
                innerRadius={innerRadius}
                outerRadius={outerRadius}
                paddingAngle={2}
                stroke="hsl(var(--background))"
                strokeWidth={2}
                cornerRadius={4}
                isAnimationActive
                animationBegin={100}
                animationDuration={800}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={`url(#${gid}-${i})`} />
                ))}
              </Pie>
              <RTooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const p = payload[0];
                  const v = p.value as number;
                  const name = p.name as string;
                  const pct = Math.round((v / totalEntries) * 100);
                  return (
                    <div className="rounded-lg border border-border/60 bg-popover/95 px-3 py-2 shadow-elevated">
                      <p className="text-[11px] font-medium text-foreground" style={{ fontFamily: "'Quicksand', sans-serif" }}>
                        {name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {v} log{v === 1 ? "" : "s"} · {pct}%
                      </p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Center label */}
          {!compact && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Top</span>
              <span className="text-sm font-bold text-foreground leading-tight" style={{ fontFamily: "'Quicksand', sans-serif" }}>
                {topPct}%
              </span>
              <span className="text-[9px] text-primary/80 truncate max-w-[4.5rem] text-center leading-tight">
                {topName}
              </span>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {data.map((d, i) => {
            const pct = Math.round((d.count / totalEntries) * 100);
            const [gStart] = PIE_GRADIENTS[i] || PIE_GRADIENTS[PIE_GRADIENTS.length - 1];
            return (
              <div key={d.name} className="flex items-center gap-2 text-[11px]">
                <span
                  className="w-2 h-2 rounded-full shrink-0 ring-1 ring-white/10"
                  style={{ background: gStart }}
                />
                <span className="text-foreground/80 truncate flex-1">{d.name}</span>
                <span className="text-muted-foreground tabular-nums text-[10px]">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
