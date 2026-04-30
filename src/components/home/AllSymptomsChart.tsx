import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { getPhaseForDate, PHASES } from "@/lib/cycleCorrelation";

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

// Distinct, accessible palette across the spectrum
const PALETTE = [
  "hsl(173, 80%, 50%)",   // teal
  "hsl(355, 75%, 65%)",   // red
  "hsl(40, 85%, 60%)",    // amber
  "hsl(270, 60%, 70%)",   // purple
  "hsl(195, 85%, 60%)",   // sky
  "hsl(140, 60%, 55%)",   // green
  "hsl(20, 85%, 65%)",    // orange
  "hsl(310, 60%, 70%)",   // pink
];

export function AllSymptomsChart({
  logs,
  symptomNames,
  lastPeriodStart,
  cycleLengthDays,
  isNonCycling,
}: Props) {
  const chartData = useMemo(() => {
    // For each phase, compute average severity per symptom
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
      return row;
    });
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

  return (
    <div className="rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/10 backdrop-blur-xl p-3 space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">
          All symptoms × phase
        </p>
        <p className="text-[9px] text-muted-foreground/50">avg intensity</p>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: -28, bottom: 0 }}>
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
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 6 }}
              iconSize={8}
              iconType="circle"
            />
            {symptomNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                name={name}
                stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={{ r: 2.5, strokeWidth: 0, fill: PALETTE[i % PALETTE.length] }}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-muted-foreground/55 text-center leading-snug px-2">
        Average intensity of each symptom by cycle phase, last 90 days.
      </p>
    </div>
  );
}
