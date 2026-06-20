import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from "recharts";

interface SymptomEntry {
  name: string;
  severity: number;
}

interface SymptomLog {
  symptoms: SymptomEntry[];
}

// Vivid palette tuned to the dark UX theme — distinct hues for each slice.
export const PIE_COLORS = [
  "hsl(168 76% 42%)", // teal (primary)
  "hsl(280 70% 65%)", // violet
  "hsl(340 75% 62%)", // pink
  "hsl(35 90% 60%)",  // amber
  "hsl(200 80% 60%)", // blue
  "hsl(140 60% 55%)", // green
  "hsl(15 75% 60%)",  // coral
  "hsl(0 0% 55%)",    // gray (Other)
];

interface SymptomPieChartProps {
  logs: SymptomLog[];
  compact?: boolean;
}

export function SymptomPieChart({ logs, compact = false }: SymptomPieChartProps) {
  // Aggregate symptom counts across all logs
  const counts = new Map<string, number>();
  let totalEntries = 0;
  logs.forEach((log) => {
    log.symptoms.forEach((s) => {
      counts.set(s.name, (counts.get(s.name) || 0) + 1);
      totalEntries += 1;
    });
  });

  if (totalEntries === 0) {
    return (
      <div className="rounded-xl border border-border/40 bg-muted/20 p-4 text-center">
        <p className="text-xs text-muted-foreground">Log a few symptoms to see your breakdown.</p>
      </div>
    );
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const TOP = 6;
  const top = sorted.slice(0, TOP).map(([name, count]) => ({ name, count }));
  const restCount = sorted.slice(TOP).reduce((s, [, c]) => s + c, 0);
  const data = restCount > 0 ? [...top, { name: "Other", count: restCount }] : top;

  const containerSize = compact ? "h-28 w-28" : "h-36 w-36";
  const outerRadius = compact ? 50 : 62;
  const innerRadius = compact ? 22 : 28;

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-foreground">Symptom Breakdown</h4>
        <span className="text-[10px] text-muted-foreground">
          {sorted.length} symptom{sorted.length === 1 ? "" : "s"} · {totalEntries} log{totalEntries === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className={`${containerSize} shrink-0`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="name"
                innerRadius={innerRadius}
                outerRadius={outerRadius}
                paddingAngle={2}
                stroke="hsl(var(--background))"
                strokeWidth={1.5}
                isAnimationActive={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i] || PIE_COLORS[PIE_COLORS.length - 1]} />
                ))}
              </Pie>
              <RTooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 11,
                  padding: "4px 8px",
                }}
                formatter={(v: number, name: string) => [
                  `${v} log${v === 1 ? "" : "s"} (${Math.round((v / totalEntries) * 100)}%)`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          {data.map((d, i) => {
            const pct = Math.round((d.count / totalEntries) * 100);
            return (
              <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ background: PIE_COLORS[i] || PIE_COLORS[PIE_COLORS.length - 1] }}
                />
                <span className="text-foreground/80 truncate flex-1">{d.name}</span>
                <span className="text-muted-foreground tabular-nums">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
