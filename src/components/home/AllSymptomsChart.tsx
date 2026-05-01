import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { getPhaseForDate, PHASES } from "@/lib/cycleCorrelation";
import { getHormoneValue } from "@/lib/hormoneCurves";

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

const SYMPTOM_PALETTE = [
  "hsl(173, 80%, 50%)",
  "hsl(355, 75%, 65%)",
  "hsl(40, 85%, 60%)",
  "hsl(140, 60%, 55%)",
  "hsl(195, 85%, 60%)",
  "hsl(20, 85%, 65%)",
  "hsl(310, 60%, 70%)",
  "hsl(85, 65%, 55%)",
];

const HORMONES = [
  { key: "estrogen", label: "Estrogen", color: "hsl(187, 100%, 42%)" },
  { key: "progesterone", label: "Progesterone", color: "hsl(270, 60%, 65%)" },
  { key: "fsh", label: "FSH", color: "hsl(40, 85%, 55%)" },
  { key: "lh", label: "LH", color: "hsl(355, 75%, 60%)" },
] as const;

const PHASE_FULL: Record<string, string> = {
  Menstruation: "Menstruation",
  Follicular: "Follicular",
  Ovulation: "Ovulation",
  Luteal: "Luteal",
};

export function AllSymptomsChart({
  logs,
  symptomNames,
  lastPeriodStart,
  cycleLengthDays,
  isNonCycling,
}: Props) {
  const { chartData, phaseMidDays } = useMemo(() => {
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

    const midDays: Record<string, number> = {};
    for (const phase of PHASES) {
      const [s, e] = phaseRanges[phase];
      midDays[phase] = Math.round((s + e) / 2);
    }

    // Bucket symptom logs per phase
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
        } catch { /* ignore */ }
      }
      if (!phase || !buckets[phase]) continue;
      const arr = Array.isArray(l.symptoms) ? l.symptoms : [];
      for (const s of arr) {
        if (!s?.severity) continue;
        if (!symptomNames.includes(s.name)) continue;
        buckets[phase][s.name].push(s.severity);
      }
    }
    const symAvgByPhase: Record<string, Record<string, number | undefined>> = {};
    for (const phase of PHASES) {
      symAvgByPhase[phase] = {};
      for (const name of symptomNames) {
        const v = buckets[phase][name];
        if (v.length > 0) {
          symAvgByPhase[phase][name] = Number(
            (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)
          );
        }
      }
    }

    // Build per-day rows for smooth hormone curves
    const data: Record<string, number | string | undefined>[] = [];
    for (let d = 1; d <= len; d++) {
      const row: Record<string, number | string | undefined> = { day: d };
      row.estrogen = Number(
        (getHormoneValue("estrogen", d, len, menEnd, ovDay, ovStart, ovEnd) * 5).toFixed(2)
      );
      row.progesterone = Number(
        (getHormoneValue("progesterone", d, len, menEnd, ovDay, ovStart, ovEnd) * 5).toFixed(2)
      );
      row.fsh = Number(
        (getHormoneValue("fsh", d, len, menEnd, ovDay, ovStart, ovEnd) * 5).toFixed(2)
      );
      row.lh = Number(
        (getHormoneValue("lh", d, len, menEnd, ovDay, ovStart, ovEnd) * 5).toFixed(2)
      );

      // Attach symptom bars only at phase midpoints
      let phaseAtDay: string | null = null;
      for (const phase of PHASES) {
        if (midDays[phase] === d) {
          phaseAtDay = phase;
          break;
        }
      }
      if (phaseAtDay) {
        for (const name of symptomNames) {
          const v = symAvgByPhase[phaseAtDay][name];
          if (typeof v === "number") row[name] = v;
        }
      }
      data.push(row);
    }

    return { chartData: data, phaseMidDays: midDays };
  }, [logs, symptomNames, lastPeriodStart, cycleLengthDays, isNonCycling]);

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

  const phaseTicks = PHASES.map((p) => phaseMidDays[p]);

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
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -28, bottom: 0 }}>
            <defs>
              {HORMONES.map((h) => (
                <linearGradient
                  key={h.key}
                  id={`allHormFill-${h.key}`}
                  x1="0" y1="0" x2="0" y2="1"
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
              dataKey="day"
              type="category"
              ticks={phaseTicks.map(String)}
              tickFormatter={(d: string) => {
                const phase = PHASES.find((p) => String(phaseMidDays[p]) === String(d));
                return phase ? PHASE_FULL[phase] : "";
              }}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
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
              labelFormatter={(d: number | string) => {
                const phase = PHASES.find((p) => String(phaseMidDays[p]) === String(d));
                return phase ? phase : `Day ${d}`;
              }}
              formatter={(value: number, name: string) => [value.toFixed(2), name]}
            />

            {/* Hormone areas + smooth lines */}
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
                strokeWidth={2}
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0, fill: h.color }}
                isAnimationActive={false}
                opacity={0.95}
              />
            ))}

            {/* Symptom bars at phase midpoints (grouped) */}
            {symptomNames.map((name, i) => (
              <Bar
                key={name}
                dataKey={name}
                name={name}
                fill={SYMPTOM_PALETTE[i % SYMPTOM_PALETTE.length]}
                radius={[4, 4, 1, 1]}
                maxBarSize={12}
                isAnimationActive={false}
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
                className="w-2.5 h-2.5 rounded-sm"
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
                style={{ background: h.color, boxShadow: `0 0 6px ${h.color}40` }}
              />
              <span className="text-[10px] text-muted-foreground/70">{h.label}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground/55 text-center leading-snug px-2">
        Typical hormone curves overlaid on your logged intensity per phase — see which hormones may be driving each pattern.
      </p>
    </div>
  );
}
