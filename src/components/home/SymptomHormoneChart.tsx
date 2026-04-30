import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import {
  analyzeCorrelation,
  getPhaseForDate,
  PHASES,
} from "@/lib/cycleCorrelation";
import { getHormoneValue, avg } from "@/lib/hormoneCurves";

interface SymptomEntry {
  name: string;
  severity: number;
}

interface SymptomLogRow {
  id: string;
  symptoms: SymptomEntry[] | unknown;
  cycle_phase: string | null;
  logged_at: string;
}

interface Props {
  userId: string;
  symptomName: string;
  lastPeriodStart?: string;
  cycleLengthDays: number;
  isNonCycling: boolean;
}

const HORMONES = [
  { key: "estrogen", label: "Estrogen", color: "hsl(187, 100%, 42%)" },
  { key: "progesterone", label: "Progesterone", color: "hsl(270, 60%, 65%)" },
  { key: "fsh", label: "FSH", color: "hsl(40, 85%, 55%)" },
  { key: "lh", label: "LH", color: "hsl(355, 75%, 60%)" },
] as const;

export function SymptomHormoneChart({
  userId,
  symptomName,
  lastPeriodStart,
  cycleLengthDays,
  isNonCycling,
}: Props) {
  const [logs, setLogs] = useState<SymptomLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("symptom_logs")
        .select("id, symptoms, cycle_phase, logged_at")
        .eq("user_id", userId)
        .order("logged_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      setLogs((data as SymptomLogRow[]) || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Reduce to enriched (phase, intensity) pairs for THIS symptom only
  const enrichedLogs = useMemo(() => {
    const out: { phase: string | null; intensity: number }[] = [];
    for (const l of logs) {
      const arr = Array.isArray(l.symptoms) ? (l.symptoms as SymptomEntry[]) : [];
      const match = arr.find((s) => s?.name === symptomName);
      if (!match || !match.severity) continue;
      let phase = l.cycle_phase;
      if (!phase && lastPeriodStart && !isNonCycling) {
        try {
          phase = getPhaseForDate(new Date(l.logged_at), lastPeriodStart, cycleLengthDays);
        } catch {
          /* ignore */
        }
      }
      out.push({ phase, intensity: match.severity });
    }
    return out;
  }, [logs, symptomName, lastPeriodStart, cycleLengthDays, isNonCycling]);

  const result = useMemo(
    () => analyzeCorrelation(enrichedLogs, symptomName),
    [enrichedLogs, symptomName]
  );

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

  const chartData = result.phaseStats.map((s) => ({
    phase: s.phase,
    fullPhase: s.phase,
    avg: Number(s.avg.toFixed(2)),
    count: s.count,
    estrogen: Number(hormoneByPhase[s.phase].estrogen.toFixed(2)),
    progesterone: Number(hormoneByPhase[s.phase].progesterone.toFixed(2)),
    fsh: Number(hormoneByPhase[s.phase].fsh.toFixed(2)),
    lh: Number(hormoneByPhase[s.phase].lh.toFixed(2)),
  }));

  if (loading) {
    return (
      <p className="text-[11px] text-muted-foreground/70 px-1 py-3">Loading pattern…</p>
    );
  }

  if (isNonCycling) {
    return (
      <p className="text-[11px] text-muted-foreground/70 px-1 py-3">
        Phase correlation isn't applied in your current life stage.
      </p>
    );
  }

  if (result.totalLogs === 0) {
    return (
      <p className="text-[11px] text-muted-foreground/70 px-1 py-3">
        Not enough data yet to show a phase pattern.
      </p>
    );
  }

  const safeId = symptomName.replace(/[^a-z0-9]/gi, "");

  return (
    <div className="rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.01] border border-white/10 backdrop-blur-xl p-3 space-y-2.5">
      {/* Insight */}
      <p
        className="text-[11px] text-foreground/85 leading-snug px-1"
        dangerouslySetInnerHTML={{
          __html: result.insight.replace(
            /\*\*(.+?)\*\*/g,
            '<strong class="text-teal-400">$1</strong>'
          ),
        }}
      />

      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">
          Symptom × Hormones
        </p>
        <p className="text-[9px] text-muted-foreground/50">avg per phase</p>
      </div>

      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id={`symBar-${safeId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(173 80% 50%)" stopOpacity={0.95} />
                <stop offset="100%" stopColor="hsl(173 80% 35%)" stopOpacity={0.55} />
              </linearGradient>
              {HORMONES.map((h) => (
                <linearGradient
                  key={h.key}
                  id={`symHormFill-${safeId}-${h.key}`}
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
              cursor={{ fill: "hsl(var(--foreground) / 0.04)" }}
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
              formatter={(value: number, name: string, p: any) => {
                if (name === "Symptom")
                  return [
                    `${value} · ${p.payload.count} log${p.payload.count === 1 ? "" : "s"}`,
                    "Symptom",
                  ];
                return [value.toFixed(2), name];
              }}
            />
            <Bar
              dataKey="avg"
              name="Symptom"
              fill={`url(#symBar-${safeId})`}
              radius={[6, 6, 2, 2]}
              barSize={28}
            />
            {HORMONES.map((h) => (
              <Area
                key={`area-${h.key}`}
                type="monotone"
                dataKey={h.key}
                stroke="none"
                fill={`url(#symHormFill-${safeId}-${h.key})`}
                isAnimationActive={false}
                legendType="none"
                tooltipType="none"
              />
            ))}
            {HORMONES.map((h) => (
              <Line
                key={h.key}
                type="monotone"
                dataKey={h.key}
                name={h.label}
                stroke={h.color}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0, fill: h.color }}
                isAnimationActive={false}
                opacity={0.9}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 pt-1 border-t border-white/5">
        <div className="flex items-center gap-1.5 pt-1.5">
          <span className="w-2 h-2.5 rounded-sm bg-gradient-to-b from-teal-400 to-teal-600" />
          <span className="text-[10px] text-foreground/70 font-medium">Symptom</span>
        </div>
        {HORMONES.map((h) => (
          <div key={h.key} className="flex items-center gap-1.5 pt-1.5">
            <span
              className="w-3.5 h-[2px] rounded-full"
              style={{ background: h.color, boxShadow: `0 0 6px ${h.color}40` }}
            />
            <span className="text-[10px] text-foreground/70">{h.label}</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground/55 text-center leading-snug px-2">
        Typical hormone curves overlaid on your logged intensity — see which hormones may be driving this.
      </p>
    </div>
  );
}
