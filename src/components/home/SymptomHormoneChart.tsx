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
  Cell,
  ReferenceLine,
} from "recharts";
import {
  analyzeCorrelation,
  getPhaseForDate,
  PHASES,
} from "@/lib/cycleCorrelation";
import { getHormoneValue, avg } from "@/lib/hormoneCurves";
import { Sparkles } from "lucide-react";

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
  { key: "estrogen", label: "Estrogen", color: "hsl(187, 100%, 60%)" },
  { key: "progesterone", label: "Progesterone", color: "hsl(270, 70%, 75%)" },
  { key: "fsh", label: "FSH", color: "hsl(40, 90%, 65%)" },
  { key: "lh", label: "LH", color: "hsl(355, 80%, 70%)" },
] as const;

const PHASE_COLORS: Record<string, string> = {
  Menstruation: "hsl(var(--phase-menstruation))",
  Follicular: "hsl(var(--phase-follicular))",
  Ovulation: "hsl(var(--phase-ovulation))",
  Luteal: "hsl(var(--phase-luteal))",
};

const PHASE_SHORT: Record<string, string> = {
  Menstruation: "Period",
  Follicular: "Follic.",
  Ovulation: "Ovul.",
  Luteal: "Luteal",
};

export function SymptomHormoneChart({
  userId,
  symptomName,
  lastPeriodStart,
  cycleLengthDays,
  isNonCycling,
}: Props) {
  const [logs, setLogs] = useState<SymptomLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const showHormones = true;

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

  const peakPhase = useMemo(() => {
    if (!result.phaseStats.length) return null;
    const withData = result.phaseStats.filter((s) => s.count > 0);
    if (!withData.length) return null;
    return withData.reduce((a, b) => (b.avg > a.avg ? b : a));
  }, [result]);

  const chartData = result.phaseStats.map((s) => ({
    phase: PHASE_SHORT[s.phase] || s.phase,
    fullPhase: s.phase,
    avg: Number(s.avg.toFixed(2)),
    count: s.count,
    isPeak: peakPhase?.phase === s.phase,
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
  const peakColor = peakPhase ? PHASE_COLORS[peakPhase.phase] : "hsl(var(--primary))";

  return (
    <div className="relative rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.01] border border-white/10 backdrop-blur-xl overflow-hidden">
      {/* Subtle peak-phase glow */}
      {peakPhase && (
        <div
          className="absolute inset-x-0 top-0 h-px opacity-60"
          style={{ background: `linear-gradient(90deg, transparent, ${peakColor}, transparent)` }}
        />
      )}

      {/* Hero: insight + peak chip */}
      <div className="px-4 pt-4 pb-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-teal-400" strokeWidth={2.25} />
          <span className="text-[10px] uppercase tracking-[0.14em] text-teal-400/90 font-semibold">
            Your phase pattern
          </span>
        </div>

        <p
          className="text-[13px] text-foreground leading-relaxed font-medium"
          dangerouslySetInnerHTML={{
            __html: result.insight.replace(
              /\*\*(.+?)\*\*/g,
              '<strong class="text-teal-300 font-semibold">$1</strong>'
            ),
          }}
        />

        {peakPhase && peakPhase.count > 0 && (
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium border"
            style={{
              background: `${peakColor.replace("hsl(", "hsla(").replace(")", ", 0.12)")}`,
              borderColor: `${peakColor.replace("hsl(", "hsla(").replace(")", ", 0.35)")}`,
              color: peakColor,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: peakColor, boxShadow: `0 0 6px ${peakColor}` }}
            />
            Peaks in {peakPhase.phase} · {peakPhase.avg.toFixed(1)}/5
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="px-2 pb-1">
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <defs>
                {PHASES.map((p) => (
                  <linearGradient key={p} id={`bar-${safeId}-${p}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PHASE_COLORS[p]} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={PHASE_COLORS[p]} stopOpacity={0.4} />
                  </linearGradient>
                ))}
                {HORMONES.map((h) => (
                  <linearGradient
                    key={h.key}
                    id={`hf-${safeId}-${h.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={h.color} stopOpacity={0.14} />
                    <stop offset="100%" stopColor={h.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                strokeDasharray="2 6"
                stroke="hsl(var(--border))"
                strokeOpacity={0.12}
                vertical={false}
              />
              <XAxis
                dataKey="phase"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                dy={6}
                interval={0}
              />
              <YAxis
                domain={[0, 5]}
                ticks={[0, 2.5, 5]}
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground) / 0.6)" }}
                axisLine={false}
                tickLine={false}
                width={24}
              />
              <ReferenceLine y={2.5} stroke="hsl(var(--border))" strokeOpacity={0.15} strokeDasharray="3 4" />
              <Tooltip
                cursor={{ fill: "hsl(var(--foreground) / 0.04)" }}
                contentStyle={{
                  background: "hsl(var(--card) / 0.96)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid hsl(var(--border) / 0.5)",
                  borderRadius: 12,
                  fontSize: 11,
                  padding: "8px 10px",
                  boxShadow: "0 8px 24px hsl(0 0% 0% / 0.4)",
                }}
                labelFormatter={(_, p: any) => p?.[0]?.payload?.fullPhase || ""}
                labelStyle={{
                  fontSize: 10,
                  color: "hsl(var(--muted-foreground))",
                  marginBottom: 4,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
                formatter={(value: number, name: string, p: any) => {
                  if (name === "Intensity")
                    return [
                      `${value}/5 · ${p.payload.count} log${p.payload.count === 1 ? "" : "s"}`,
                      "Intensity",
                    ];
                  return [value.toFixed(1), name];
                }}
              />
              <Bar
                dataKey="avg"
                name="Intensity"
                radius={[10, 10, 4, 4]}
                barSize={42}
                fillOpacity={showHormones ? 0.75 : 1}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.fullPhase}
                    fill={`url(#bar-${safeId}-${entry.fullPhase})`}
                    stroke={entry.isPeak ? PHASE_COLORS[entry.fullPhase] : "transparent"}
                    strokeWidth={entry.isPeak ? 1.5 : 0}
                  />
                ))}
              </Bar>
              {showHormones &&
                HORMONES.map((h) => (
                  <Area
                    key={`area-${h.key}`}
                    type="monotone"
                    dataKey={h.key}
                    stroke="none"
                    fill={`url(#hf-${safeId}-${h.key})`}
                    isAnimationActive={false}
                    legendType="none"
                    tooltipType="none"
                  />
                ))}
              {showHormones &&
                HORMONES.map((h) => (
                  <Line
                    key={h.key}
                    type="monotone"
                    dataKey={h.key}
                    name={h.label}
                    stroke={h.color}
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0, fill: h.color }}
                    isAnimationActive={false}
                    opacity={0.85}
                  />
                ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Per-phase log counts */}
        <div className="grid grid-cols-4 gap-1 px-2 pb-2 -mt-1">
          {chartData.map((d) => (
            <div key={d.fullPhase} className="text-center">
              <p className="text-[9px] text-muted-foreground/55 tabular-nums">
                {d.count} {d.count === 1 ? "log" : "logs"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Hormone legend */}
      <div className="px-4 pb-3 pt-1 border-t border-white/5 flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
        {HORMONES.map((h) => (
          <div key={h.key} className="flex items-center gap-1">
            <span
              className="w-2.5 h-[2px] rounded-full"
              style={{ background: h.color, boxShadow: `0 0 4px ${h.color}40` }}
            />
            <span className="text-[9px] text-foreground/60">{h.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
