import { useMemo, useState } from "react";
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
import { getPhaseForDate, PHASES } from "@/lib/cycleCorrelation";
import { getHormoneValue, avg } from "@/lib/hormoneCurves";
import { Sparkles } from "lucide-react";

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
  lifeStage?: string;
}

const SYMPTOM_PALETTE = [
  "hsl(173, 80%, 55%)",
  "hsl(355, 75%, 68%)",
  "hsl(40, 90%, 62%)",
  "hsl(140, 60%, 58%)",
  "hsl(195, 85%, 62%)",
  "hsl(20, 85%, 65%)",
  "hsl(310, 65%, 72%)",
  "hsl(85, 65%, 58%)",
];

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

export function AllSymptomsChart({
  logs,
  symptomNames,
  lastPeriodStart,
  cycleLengthDays,
  isNonCycling,
  lifeStage,
}: Props) {
  const [showHormones, setShowHormones] = useState(false);

  const { perPhase, hormoneByPhase } = useMemo(() => {
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

    // Bucket symptom values per phase
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

    const perPhase = PHASES.map((phase) => {
      const items: { name: string; avg: number; count: number }[] = [];
      let total = 0;
      let total_n = 0;
      for (const name of symptomNames) {
        const v = buckets[phase][name];
        if (v.length > 0) {
          const a = v.reduce((x, y) => x + y, 0) / v.length;
          items.push({ name, avg: Number(a.toFixed(2)), count: v.length });
          total += a;
          total_n += 1;
        }
      }
      items.sort((a, b) => b.avg - a.avg);
      return {
        phase,
        items,
        load: total_n > 0 ? Number((total / total_n).toFixed(2)) : 0,
        symptomCount: total_n,
      };
    });

    // Hormone avg per phase (for chart overlay)
    const hormoneByPhase: Record<string, Record<string, number>> = {};
    for (const phase of PHASES) {
      const [s, e] = phaseRanges[phase];
      const vals: Record<string, number[]> = { estrogen: [], progesterone: [], fsh: [], lh: [] };
      for (let d = s; d <= e; d++) {
        vals.estrogen.push(getHormoneValue("estrogen", d, len, menEnd, ovDay, ovStart, ovEnd));
        vals.progesterone.push(getHormoneValue("progesterone", d, len, menEnd, ovDay, ovStart, ovEnd));
        vals.fsh.push(getHormoneValue("fsh", d, len, menEnd, ovDay, ovStart, ovEnd));
        vals.lh.push(getHormoneValue("lh", d, len, menEnd, ovDay, ovStart, ovEnd));
      }
      hormoneByPhase[phase] = {
        estrogen: avg(vals.estrogen) * 5,
        progesterone: avg(vals.progesterone) * 5,
        fsh: avg(vals.fsh) * 5,
        lh: avg(vals.lh) * 5,
      };
    }

    return { perPhase, hormoneByPhase };
  }, [logs, symptomNames, lastPeriodStart, cycleLengthDays, isNonCycling]);

  const peakPhase = useMemo(() => {
    const withData = perPhase.filter((p) => p.symptomCount > 0);
    if (!withData.length) return null;
    return withData.reduce((a, b) => (b.load > a.load ? b : a));
  }, [perPhase]);

  const insight = useMemo(() => {
    if (!peakPhase || peakPhase.items.length === 0) return null;
    const esc = (s: string) =>
      s.replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
      );
    const top = peakPhase.items.slice(0, 2).map((i) => esc(i.name));
    const phase = esc(peakPhase.phase);
    if (top.length === 2) {
      return `Your hardest stretch is **${phase}** — **${top[0]}** and **${top[1]}** lead the pattern.`;
    }
    return `Your hardest stretch is **${phase}** — **${top[0]}** leads the pattern.`;
  }, [peakPhase]);

  if (isNonCycling) {
    return (
      <p className="text-[11px] text-muted-foreground/70 px-1 py-3">
        Phase correlation isn't applied in your current life stage.
      </p>
    );
  }

  const hasAnyData = perPhase.some((p) => p.symptomCount > 0);
  if (!hasAnyData) {
    return (
      <p className="text-[11px] text-muted-foreground/70 px-1 py-3">
        Not enough data yet to show phase patterns.
      </p>
    );
  }

  // Symptom-name → palette color map (used in detail rows)
  const colorFor = (name: string) =>
    SYMPTOM_PALETTE[symptomNames.indexOf(name) % SYMPTOM_PALETTE.length];

  const chartData = perPhase.map((p) => ({
    phase: PHASE_SHORT[p.phase],
    fullPhase: p.phase,
    load: p.load,
    isPeak: peakPhase?.phase === p.phase,
    estrogen: Number(hormoneByPhase[p.phase].estrogen.toFixed(2)),
    progesterone: Number(hormoneByPhase[p.phase].progesterone.toFixed(2)),
    fsh: Number(hormoneByPhase[p.phase].fsh.toFixed(2)),
    lh: Number(hormoneByPhase[p.phase].lh.toFixed(2)),
    topSymptom: perPhase.find((x) => x.phase === p.phase)?.items[0]?.name,
  }));

  return (
    <div className="relative rounded-2xl bg-gradient-to-b from-white/[0.06] to-white/[0.01] border border-white/10 backdrop-blur-xl overflow-hidden">
      {peakPhase && (
        <div
          className="absolute inset-x-0 top-0 h-px opacity-60"
          style={{
            background: `linear-gradient(90deg, transparent, ${PHASE_COLORS[peakPhase.phase]}, transparent)`,
          }}
        />
      )}

      {/* Hero insight */}
      <div className="px-4 pt-4 pb-3 space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-teal-400" strokeWidth={2.25} />
          <span className="text-[10px] uppercase tracking-[0.14em] text-teal-400/90 font-semibold">
            Your phase pattern
          </span>
        </div>
        {insight && (
          <p
            className="text-[13px] text-foreground leading-relaxed font-medium"
            dangerouslySetInnerHTML={{
              __html: insight.replace(
                /\*\*(.+?)\*\*/g,
                '<strong class="text-teal-300 font-semibold">$1</strong>'
              ),
            }}
          />
        )}
      </div>

      {/* Phase-load chart: one chunky bar per phase */}
      <div className="px-2">
        <div className="flex items-center justify-between px-3 pb-1">
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-medium">
            Symptom load by phase
          </p>
          <p className="text-[9px] text-muted-foreground/50">avg intensity</p>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <defs>
                {PHASES.map((p) => (
                  <linearGradient key={p} id={`allBar-${p}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PHASE_COLORS[p]} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={PHASE_COLORS[p]} stopOpacity={0.4} />
                  </linearGradient>
                ))}
                {HORMONES.map((h) => (
                  <linearGradient
                    key={h.key}
                    id={`allHormFill-${h.key}`}
                    x1="0" y1="0" x2="0" y2="1"
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
                  if (name === "Load") {
                    const top = p.payload.topSymptom;
                    return [top ? `${value}/5 · top: ${top}` : `${value}/5`, "Load"];
                  }
                  return [value.toFixed(1), name];
                }}
              />
              <Bar
                dataKey="load"
                name="Load"
                radius={[10, 10, 4, 4]}
                barSize={42}
                fillOpacity={showHormones ? 0.75 : 1}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.fullPhase}
                    fill={`url(#allBar-${entry.fullPhase})`}
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
                    fill={`url(#allHormFill-${h.key})`}
                    isAnimationActive={false}
                    legendType="none"
                    tooltipType="none"
                  />
                ))}
              {showHormones &&
                HORMONES.map((h) => (
                  <Line
                    key={`hline-${h.key}`}
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
      </div>

      {/* Per-phase top symptoms */}
      <div className="px-3 pt-2 pb-3 space-y-2">
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 font-medium px-1">
          Top symptoms per phase
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {perPhase.map((p) => {
            const color = PHASE_COLORS[p.phase];
            const top = p.items.slice(0, 3);
            return (
              <div
                key={p.phase}
                className={`rounded-xl border p-2.5 space-y-1.5 ${
                  peakPhase?.phase === p.phase
                    ? "bg-white/[0.04] border-white/15"
                    : "bg-white/[0.02] border-white/8"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                    />
                    <span className="text-[11px] font-semibold" style={{ color }}>
                      {p.phase}
                    </span>
                  </div>
                  <span className="text-[9px] text-muted-foreground/55 tabular-nums">
                    {p.load > 0 ? `${p.load.toFixed(1)}/5` : "—"}
                  </span>
                </div>
                {top.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/50 italic">No logs yet</p>
                ) : (
                  <div className="space-y-1">
                    {top.map((s) => (
                      <div key={s.name} className="flex items-center gap-2">
                        <span
                          className="text-[10.5px] text-foreground/85 truncate flex-1"
                          title={s.name}
                        >
                          {s.name}
                        </span>
                        <div className="w-12 h-1 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(s.avg / 5) * 100}%`,
                              background: colorFor(s.name),
                            }}
                          />
                        </div>
                        <span className="text-[9.5px] text-muted-foreground/70 tabular-nums w-6 text-right">
                          {s.avg.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {lifeStage === "irregular" && (
        <p className="px-4 pb-2 pt-1 text-[11px] text-muted-foreground/70">
          Phase estimates are approximate — your cycle may not follow a predictable pattern.
        </p>
      )}

      {/* Hormone toggle */}
      <div className="px-4 pb-3 pt-1 border-t border-white/5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowHormones((v) => !v)}
          className="text-[10.5px] text-muted-foreground/80 hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          <span
            className={`w-7 h-3.5 rounded-full relative transition-colors ${
              showHormones ? "bg-teal-500/60" : "bg-white/10"
            }`}
          >
            <span
              className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${
                showHormones ? "left-[14px]" : "left-0.5"
              }`}
            />
          </span>
          {showHormones ? "Hide hormones" : "Compare with hormones"}
        </button>
        {showHormones && (
          <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
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
        )}
      </div>
    </div>
  );
}
