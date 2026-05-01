import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { getPhaseForDate, PHASES } from "@/lib/cycleCorrelation";
import { getHormoneValue, avg } from "@/lib/hormoneCurves";

interface SymptomEntry {
  name: string;
  severity: number;
}

interface SymptomLog {
  symptoms: SymptomEntry[];
  cycle_phase: string | null;
  logged_at: string;
}

interface Props {
  logs: SymptomLog[];
  symptomNames: string[];
  lastPeriodStart?: string;
  cycleLengthDays: number;
  isNonCycling: boolean;
}

// Distinct symptom palette
const SYMPTOM_PALETTE = [
  "hsl(173, 80%, 50%)",   // teal
  "hsl(355, 75%, 65%)",   // red
  "hsl(40, 85%, 60%)",    // amber
  "hsl(140, 60%, 55%)",   // green
  "hsl(195, 85%, 60%)",   // sky
  "hsl(20, 85%, 65%)",    // orange
  "hsl(310, 60%, 70%)",   // pink
  "hsl(85, 65%, 55%)",    // lime
];

const HORMONES = [
  { key: "estrogen", label: "Estrogen", color: "hsl(187, 100%, 42%)" },
  { key: "progesterone", label: "Progesterone", color: "hsl(270, 60%, 65%)" },
  { key: "fsh", label: "FSH", color: "hsl(40, 85%, 55%)" },
  { key: "lh", label: "LH", color: "hsl(355, 75%, 60%)" },
] as const;

export function AllSymptomsChart({
  logs,
  symptomNames,
  lastPeriodStart,
  cycleLengthDays,
  isNonCycling,
}: Props) {
  const hormoneByPhase = useMemo(() => {
    const len = cycleLengthDays || 28;
    const menEnd = 5;
    const ovDay = len - 14;
    const ovStart = ovDay - 1;
    const ovEnd = ovDay + 2;
    const phaseRanges: Record<string, [number, number]> = {
      Menstruation: [1, menEnd],
      Follicular: [menEnd + 1, ovStart - 1],
      Ovulation: [ovStart, ovEnd],
      Luteal: [ovEnd + 1, len],
    };
    const out: Record<string, Record<string, number>> = {};
    for (const phase of PHASES) {
      const [s, e] = phaseRanges[phase];
      const vals: Record<string, number[]> = { estrogen: [], progesterone: [], fsh: [], lh: [] };
      for (let d = s; d <= e; d++) {
        vals.estrogen.push(getHormoneValue("estrogen", d, len, menEnd, ovDay, ovStart, ovEnd));
        vals.progesterone.push(getHormoneValue("progesterone", d, len, menEnd, ovDay, ovStart, ovEnd));
        vals.fsh.push(getHormoneValue("fsh", d, len, menEnd, ovDay, ovStart, ovEnd));
        vals.lh.push(getHormoneValue("lh", d, len, menEnd, ovDay, ovStart, ovEnd));
      }
      out[phase] = {
        estrogen: avg(vals.estrogen) * 5,
        progesterone: avg(vals.progesterone) * 5,
        fsh: avg(vals.fsh) * 5,
        lh: avg(vals.lh) * 5,
      };
    }
    return out;
  }, [cycleLengthDays]);

  const chartData = useMemo(() => {
    const buckets: Record<string, Record<string, number[]>> = {};
    for (const phase of PHASES) {
      buckets[phase] = {};
      for (const name of symptomNames) buckets[phase][name] = [];
    }

    for (const l of logs) {
      let phase = l.cycle_phase;
      if (!phase && lastPeriodStart && !isNonCycling) {
        try {
          phase = getPhaseForDate(new Date(l.logged_at), lastPeriodStart, cycleLengthDays);
        } catch {
          /* ignore */
        }
      }
      if (!phase || !buckets[phase]) continue;
      const arr = Array.isArray(l.symptoms) ? l.symptoms : [];
      for (const s of arr) {
        if (!s?.severity) continue;
        if (!symptomNames.includes(s.name)) continue;
        buckets[phase][s.name].push(s.severity);
      }
    }

    return PHASES.map((phase) => {
      const row: Record<string, number | string> = { phase };
      for (const name of symptomNames) {
        const vals = buckets[phase][name];
        if (vals.length > 0) {
          row[name] = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
        }
      }
      const h = hormoneByPhase[phase] || {};
      row.estrogen = Number((h.estrogen ?? 0).toFixed(2));
      row.progesterone = Number((h.progesterone ?? 0).toFixed(2));
      row.fsh = Number((h.fsh ?? 0).toFixed(2));
      row.lh = Number((h.lh ?? 0).toFixed(2));
      return row;
    });
  }, [logs, symptomNames, lastPeriodStart, cycleLengthDays, isNonCycling, hormoneByPhase]);

  if (isNonCycling) {
    return (
      <p className="text-[11px] text-muted-foreground/70 px-1 py-3">
        Phase correlation isn't applied in your current life stage.
      </p>
    );
  }

  const hasAnyData = chartData.some((row) =>
    symptomNames.some((n) => typeof row[n] === "number")
  );

  if (!hasAnyData) {
    return (
      <p className="text-[11px] text-muted-foreground/70 px-1 py-3">
        Not enough data yet to show phase patterns.
      </p>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/10 backdrop-blur-xl p-3 space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">
          All symptoms × Hormones
        </p>
        <p className="text-[9px] text-muted-foreground/50">avg per phase</p>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}>
            <defs>
              {HORMONES.map((h) => (
                <linearGradient
                  key={h.key}
                  id={`allHormFill-${h.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={h.color} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={h.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid
              strokeDasharray="2 4"
              stroke="hsl(var(--border))"
              strokeOpacity={0.18}
              vertical={false}
            />
            <XAxis
              dataKey="phase"
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              dy={4}
              interval={0}
            />
            <YAxis
              domain={[0, 5]}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--foreground) / 0.1)" }}
              contentStyle={{
                background: "hsl(var(--card) / 0.95)",
                backdropFilter: "blur(12px)",
                border: "1px solid hsl(var(--border) / 0.5)",
                borderRadius: 12,
                fontSize: 11,
                padding: "8px 10px",
                boxShadow: "0 8px 24px hsl(0 0% 0% / 0.4)",
              }}
              labelStyle={{
                fontSize: 10,
                color: "hsl(var(--muted-foreground))",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
              formatter={(value: number, name: string) => [value.toFixed(2), name]}
            />

            {/* Hormone areas + lines (background) */}
            {HORMONES.map((h) => (
              <Area
                key={`area-${h.key}`}
                type="monotone"
                dataKey={h.key}
                stroke="none"
                fill={`url(#allHormFill-${h.key})`}
                isAnimationActive={false}
                legendType="none"
                tooltipType="none"
              />
            ))}
            {HORMONES.map((h) => (
              <Line
                key={`hline-${h.key}`}
                type="monotone"
                dataKey={h.key}
                name={h.label}
                stroke={h.color}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0, fill: h.color }}
                isAnimationActive={false}
                opacity={0.75}
              />
            ))}

            {/* Symptom lines (foreground) */}
            {symptomNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                name={name}
                stroke={SYMPTOM_PALETTE[i % SYMPTOM_PALETTE.length]}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={{ r: 2.5, strokeWidth: 0, fill: SYMPTOM_PALETTE[i % SYMPTOM_PALETTE.length] }}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="space-y-1.5 pt-1 border-t border-white/5">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1.5">
          {symptomNames.map((name, i) => (
            <div key={name} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: SYMPTOM_PALETTE[i % SYMPTOM_PALETTE.length] }}
              />
              <span className="text-[10px] text-foreground/70">{name}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {HORMONES.map((h) => (
            <div key={h.key} className="flex items-center gap-1.5">
              <span
                className="w-3.5 h-[2px] rounded-full"
                style={{
                  background: `repeating-linear-gradient(90deg, ${h.color} 0 3px, transparent 3px 6px)`,
                }}
              />
              <span className="text-[10px] text-muted-foreground/70">{h.label}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/55 text-center leading-snug px-2">
        Your symptoms (solid) overlaid with typical hormone curves (dashed) — spot which hormones may be driving each pattern.
      </p>
    </div>
  );
}
