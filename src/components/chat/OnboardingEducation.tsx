import { useState, useEffect } from "react";

// ─── Shared helpers ──────────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

// ─── Phase data ──────────────────────────────────────────────────────────

const PHASES = [
  { name: "Menstruation", color: "hsl(355, 78%, 60%)", startAngle: 0, endAngle: 90, description: "Your body resets. Hormones are at their lowest." },
  { name: "Follicular", color: "hsl(152, 60%, 52%)", startAngle: 90, endAngle: 180, description: "Estrogen rises. Energy and mood climb." },
  { name: "Ovulation", color: "hsl(40, 90%, 56%)", startAngle: 180, endAngle: 250, description: "Hormones peak. You feel sharpest." },
  { name: "Luteal", color: "hsl(270, 60%, 65%)", startAngle: 250, endAngle: 360, description: "Progesterone rises then drops. Things slow down." },
];

// ═══════════════════════════════════════════════════════════════════════════
// 1. CYCLE BASICS — Annotated ring with day markers + phase detail cards
// ═══════════════════════════════════════════════════════════════════════════

export function CycleBasicsCard() {
  const [visiblePhases, setVisiblePhases] = useState(0);
  const [activePhase, setActivePhase] = useState<number | null>(null);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    PHASES.forEach((_, i) => {
      timers.push(setTimeout(() => setVisiblePhases(i + 1), 400 * (i + 1)));
    });
    timers.push(setTimeout(() => setShowText(true), 400 * (PHASES.length + 1)));
    return () => timers.forEach(clearTimeout);
  }, []);

  const cx = 80, cy = 80, r = 56, tickR = 66;

  // Day tick marks at key positions
  const dayMarkers = [
    { day: 1, angle: 0 },
    { day: 7, angle: 90 },
    { day: 14, angle: 180 },
    { day: 17, angle: 225 },
    { day: 28, angle: 355 },
  ];

  return (
    <div className="rounded-xl bg-card border border-border/50 p-4 space-y-3 animate-fade-in">
      <p className="text-xs font-semibold text-primary uppercase tracking-wider">Your cycle in 30 seconds</p>

      <div className="flex items-start gap-3">
        {/* Ring diagram */}
        <svg width="160" height="160" viewBox="0 0 160 160" className="flex-shrink-0">
          {/* Background ring */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(220, 10%, 15%)" strokeWidth="10" />

          {/* Phase arcs */}
          {PHASES.slice(0, visiblePhases).map((phase, i) => (
            <path
              key={i}
              d={arcPath(cx, cy, r, phase.startAngle, phase.endAngle)}
              fill="none"
              stroke={phase.color}
              strokeWidth={activePhase === i ? "12" : "10"}
              strokeLinecap="butt"
              className="transition-all duration-300 cursor-pointer"
              style={{ filter: `drop-shadow(0 0 ${activePhase === i ? 6 : 3}px ${phase.color}50)` }}
              onMouseEnter={() => setActivePhase(i)}
              onMouseLeave={() => setActivePhase(null)}
            />
          ))}

          {/* Day tick marks */}
          {dayMarkers.map(({ day, angle }) => {
            const outer = polarToCartesian(cx, cy, tickR, angle);
            const inner = polarToCartesian(cx, cy, r + 6, angle);
            const label = polarToCartesian(cx, cy, tickR + 7, angle);
            return (
              <g key={day}>
                <line
                  x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
                  stroke="hsl(210, 15%, 40%)" strokeWidth="1"
                />
                <text
                  x={label.x} y={label.y}
                  textAnchor="middle" dominantBaseline="central"
                  fill="hsl(210, 15%, 50%)" fontSize="7" fontFamily="Space Grotesk, sans-serif"
                >
                  {day}
                </text>
              </g>
            );
          })}

          {/* Center */}
          <text x={cx} y={cy - 6} textAnchor="middle" fill="hsl(210, 20%, 97%)" fontSize="14" fontWeight="600" fontFamily="Space Grotesk, sans-serif">
            ~28
          </text>
          <text x={cx} y={cy + 8} textAnchor="middle" fill="hsl(210, 15%, 50%)" fontSize="8" fontFamily="DM Sans, sans-serif">
            day cycle
          </text>
        </svg>

        {/* Phase legend with descriptions */}
        <div className="space-y-1 flex-1 pt-1">
          {PHASES.map((phase, i) => (
            <div
              key={i}
              className="rounded-lg p-2 transition-all duration-300 cursor-pointer"
              style={{
                opacity: i < visiblePhases ? 1 : 0,
                transform: i < visiblePhases ? "translateX(0)" : "translateX(-8px)",
                backgroundColor: activePhase === i ? `${phase.color}15` : "transparent",
                borderLeft: `2px solid ${activePhase === i ? phase.color : "transparent"}`,
              }}
              onMouseEnter={() => setActivePhase(i)}
              onMouseLeave={() => setActivePhase(null)}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: phase.color }} />
                <span className="text-xs font-medium text-foreground">{phase.name}</span>
              </div>
              {activePhase === i && (
                <p className="text-[10px] text-foreground mt-0.5 ml-3.5 animate-fade-in leading-snug">
                  {phase.description}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {showText && (
        <p className="text-xs text-muted-foreground leading-relaxed animate-fade-in">
          Tap any phase to learn more. Your cycle repeats roughly every 28 days — Logan tracks where you are so you can stop guessing.
        </p>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// 2. HORMONE TIMELINE — Annotated chart with labeled peaks + crossover
// ═══════════════════════════════════════════════════════════════════════════

export function HormoneBasicsCard() {
  const [animate, setAnimate] = useState(false);
  const [hoveredHormone, setHoveredHormone] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setAnimate(true), 300);
    return () => clearTimeout(t);
  }, []);

  const W = 280, H = 100;
  const pad = { top: 12, right: 10, bottom: 22, left: 10 };

  return (
    <div className="rounded-xl bg-card border border-border/50 p-4 space-y-3 animate-fade-in">
      <p className="text-xs font-semibold text-primary uppercase tracking-wider">Why you feel different each week</p>

      <div className="relative overflow-hidden rounded-lg bg-muted/10 border border-border/30">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 140 }}>
          {/* Phase background bands */}
          {[
            { x: pad.left, w: 70, color: "hsl(355, 78%, 60%)", label: "Menstruation" },
            { x: pad.left + 70, w: 70, color: "hsl(152, 60%, 52%)", label: "Follicular" },
            { x: pad.left + 140, w: 50, color: "hsl(40, 90%, 56%)", label: "Ovulation" },
            { x: pad.left + 190, w: 80, color: "hsl(270, 60%, 65%)", label: "Luteal" },
          ].map((band, i) => (
            <g key={i}>
              <rect
                x={band.x} y={pad.top} width={band.w} height={H - pad.top - pad.bottom}
                fill={band.color} opacity="0.06" rx="2"
              />
              <text
                x={band.x + band.w / 2} y={H - 6}
                textAnchor="middle" fontSize="7" fill="hsl(210, 15%, 45%)"
                fontFamily="DM Sans, sans-serif"
              >
                {band.label}
              </text>
            </g>
          ))}

          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(frac => (
            <line
              key={frac}
              x1={pad.left} y1={pad.top + (H - pad.top - pad.bottom) * (1 - frac)}
              x2={W - pad.right} y2={pad.top + (H - pad.top - pad.bottom) * (1 - frac)}
              stroke="hsl(210, 10%, 20%)" strokeWidth="0.3" strokeDasharray="3,3"
            />
          ))}

          {/* Estrogen curve */}
          <path
            d="M10,72 C40,72 55,25 95,18 C135,11 145,45 170,50 C195,55 220,62 270,68"
            fill="none"
            stroke="hsl(152, 60%, 52%)"
            strokeWidth={hoveredHormone === "estrogen" ? "2.5" : "1.8"}
            strokeLinecap="round"
            className="transition-all duration-700"
            style={{
              strokeDasharray: 400,
              strokeDashoffset: animate ? 0 : 400,
              filter: hoveredHormone === "estrogen" ? "drop-shadow(0 0 4px hsl(152, 60%, 52%, 0.5))" : "none",
            }}
            onMouseEnter={() => setHoveredHormone("estrogen")}
            onMouseLeave={() => setHoveredHormone(null)}
          />

          {/* Estrogen peak label */}
          {animate && (
            <g className="animate-fade-in" style={{ animationDelay: "0.8s", animationFillMode: "both" }}>
              <circle cx="95" cy="18" r="2.5" fill="hsl(152, 60%, 52%)" />
              <line x1="95" y1="20" x2="95" y2="30" stroke="hsl(152, 60%, 52%)" strokeWidth="0.5" strokeDasharray="1,1" />
              <text x="95" y="36" textAnchor="middle" fontSize="6" fill="hsl(152, 60%, 65%)" fontFamily="Space Grotesk">
                estrogen peak
              </text>
            </g>
          )}

          {/* Progesterone curve */}
          <path
            d="M10,76 C60,76 100,72 135,62 C160,52 170,22 195,18 C220,14 250,55 270,70"
            fill="none"
            stroke="hsl(270, 60%, 65%)"
            strokeWidth={hoveredHormone === "progesterone" ? "2.5" : "1.8"}
            strokeLinecap="round"
            className="transition-all duration-700"
            style={{
              strokeDasharray: 400,
              strokeDashoffset: animate ? 0 : 400,
              animationDelay: "0.4s",
              filter: hoveredHormone === "progesterone" ? "drop-shadow(0 0 4px hsl(270, 60%, 65%, 0.5))" : "none",
            }}
            onMouseEnter={() => setHoveredHormone("progesterone")}
            onMouseLeave={() => setHoveredHormone(null)}
          />

          {/* Progesterone peak label */}
          {animate && (
            <g className="animate-fade-in" style={{ animationDelay: "1.4s", animationFillMode: "both" }}>
              <circle cx="195" cy="18" r="2.5" fill="hsl(270, 60%, 65%)" />
              <line x1="195" y1="20" x2="195" y2="30" stroke="hsl(270, 60%, 65%)" strokeWidth="0.5" strokeDasharray="1,1" />
              <text x="195" y="36" textAnchor="middle" fontSize="6" fill="hsl(270, 60%, 75%)" fontFamily="Space Grotesk">
                progesterone peak
              </text>
            </g>
          )}

          {/* Crossover annotation */}
          {animate && (
            <g className="animate-fade-in" style={{ animationDelay: "1.8s", animationFillMode: "both" }}>
              <line x1="155" y1={pad.top} x2="155" y2={H - pad.bottom} stroke="hsl(210, 15%, 35%)" strokeWidth="0.5" strokeDasharray="2,2" />
              <text x="155" y={pad.top - 2} textAnchor="middle" fontSize="5.5" fill="hsl(210, 15%, 50%)" fontFamily="DM Sans">
                crossover
              </text>
            </g>
          )}

          {/* Y-axis label */}
          <text x="4" y={pad.top + 4} fontSize="5" fill="hsl(210, 15%, 40%)" fontFamily="DM Sans">high</text>
          <text x="4" y={H - pad.bottom - 2} fontSize="5" fill="hsl(210, 15%, 40%)" fontFamily="DM Sans">low</text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-[10px]">
        <span
          className="flex items-center gap-1.5 cursor-pointer transition-opacity"
          style={{ opacity: hoveredHormone === "progesterone" ? 0.4 : 1 }}
          onMouseEnter={() => setHoveredHormone("estrogen")}
          onMouseLeave={() => setHoveredHormone(null)}
        >
          <span className="w-5 h-[2px] rounded-full bg-phase-follicular inline-block" /> Estrogen — drives energy & mood
        </span>
        <span
          className="flex items-center gap-1.5 cursor-pointer transition-opacity"
          style={{ opacity: hoveredHormone === "estrogen" ? 0.4 : 1 }}
          onMouseEnter={() => setHoveredHormone("progesterone")}
          onMouseLeave={() => setHoveredHormone(null)}
        >
          <span className="w-5 h-[2px] rounded-full bg-phase-luteal inline-block" /> Progesterone — calming, then drops
        </span>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        These two hormones rise and fall every cycle. When they shift, so does your mood, energy, and focus. That's not random — it's biology you can learn to read.
      </p>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// 3. SYMPTOM HEATMAP — Symptom × week grid with intensity dots
// ═══════════════════════════════════════════════════════════════════════════

const SYMPTOM_DATA = [
  { label: "Energy",    phases: [0.3, 0.8, 0.9, 0.4] },
  { label: "Mood",      phases: [0.3, 0.7, 0.8, 0.3] },
  { label: "Cramps",    phases: [0.9, 0.1, 0.1, 0.5] },
  { label: "Brain fog", phases: [0.4, 0.1, 0.2, 0.8] },
  { label: "Bloating",  phases: [0.5, 0.1, 0.2, 0.7] },
];

const PHASE_LABELS = ["Menstruation", "Follicular", "Ovulation", "Luteal"];
const PHASE_COLORS = ["#EF4444", "#10B981", "#F59E0B", "#8B5CF6"];

export function SymptomExplainerCard() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="rounded-xl bg-card border border-border/50 p-4 space-y-3 animate-fade-in">
      <p className="text-xs font-semibold text-primary uppercase tracking-wider">Your symptoms aren't random</p>

      <div className="space-y-2">
        {/* Column headers */}
        <div className="grid grid-cols-[72px_repeat(4,1fr)] gap-1">
          <div />
          {PHASE_LABELS.map((label, i) => (
            <div key={label} className="text-center">
              <span className="text-[8px] font-medium" style={{ color: PHASE_COLORS[i] }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Rows */}
        {SYMPTOM_DATA.map((symptom, si) => (
          <div
            key={si}
            className="grid grid-cols-[72px_repeat(4,1fr)] gap-1 items-center transition-all duration-400"
            style={{
              opacity: visible ? 1 : 0,
              transitionDelay: `${si * 80}ms`,
            }}
          >
            <span className="text-[10px] text-foreground font-medium">{symptom.label}</span>
            {symptom.phases.map((intensity, wi) => (
              <div key={wi} className="flex justify-center">
                <div
                  className="h-2 rounded-full transition-all duration-600"
                  style={{
                    width: visible ? `${Math.max(intensity * 100, 8)}%` : "0%",
                    backgroundColor: PHASE_COLORS[wi],
                    opacity: 0.25 + intensity * 0.6,
                    transitionDelay: `${si * 80 + wi * 50}ms`,
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Longer bar = stronger effect. Once you see the pattern, you can plan around it.
      </p>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// 4. ANCHOR SYMPTOM — Radar-style target diagram
// ═══════════════════════════════════════════════════════════════════════════

export function AnchorExplainerCard() {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimate(true), 300);
    return () => clearTimeout(t);
  }, []);

  const cx = 60, cy = 60;

  return (
    <div className="rounded-xl bg-card border border-border/50 p-4 space-y-2 animate-fade-in">
      <p className="text-xs font-semibold text-primary uppercase tracking-wider">What's an anchor symptom?</p>

      <div className="flex items-start gap-3">
        {/* Target/radar SVG */}
        <svg width="120" height="120" viewBox="0 0 120 120" className="flex-shrink-0">
          {/* Concentric rings */}
          {[40, 30, 20, 10].map((r, i) => (
            <circle
              key={r}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke="hsl(210, 10%, 22%)"
              strokeWidth="0.5"
              className="transition-all duration-500"
              style={{
                opacity: animate ? 1 : 0,
                transitionDelay: `${i * 100}ms`,
              }}
            />
          ))}

          {/* Crosshairs */}
          <line x1={cx - 44} y1={cy} x2={cx + 44} y2={cy} stroke="hsl(210, 10%, 20%)" strokeWidth="0.4" />
          <line x1={cx} y1={cy - 44} x2={cx} y2={cy + 44} stroke="hsl(210, 10%, 20%)" strokeWidth="0.4" />

          {/* Outer scattered dots (other symptoms) */}
          {[
            { x: 25, y: 30 }, { x: 88, y: 38 }, { x: 35, y: 82 },
            { x: 80, y: 78 }, { x: 18, y: 55 }, { x: 92, y: 60 },
          ].map((dot, i) => (
            <circle
              key={i}
              cx={dot.x} cy={dot.y} r="3"
              fill="hsl(210, 15%, 35%)"
              className="transition-all duration-500"
              style={{
                opacity: animate ? 0.5 : 0,
                transitionDelay: `${300 + i * 80}ms`,
              }}
            />
          ))}

          {/* Center anchor dot with pulse */}
          <circle
            cx={cx} cy={cy} r={animate ? 7 : 0}
            fill="hsl(var(--primary))"
            className="transition-all duration-700"
            style={{
              transitionDelay: "800ms",
              filter: "drop-shadow(0 0 6px hsl(var(--primary) / 0.5))",
            }}
          />
          {animate && (
            <circle
              cx={cx} cy={cy} r="7"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="1"
              className="animate-pulse-soft"
              style={{ opacity: 0.4 }}
            />
          )}

          {/* Labels */}
          {animate && (
            <>
              <text x={cx} y={cy + 20} textAnchor="middle" fontSize="6.5" fill="hsl(var(--primary))" fontWeight="600" fontFamily="Space Grotesk">
                anchor
              </text>
              <text x="16" y="24" fontSize="5.5" fill="hsl(210, 15%, 40%)" fontFamily="DM Sans">other</text>
              <text x="82" y="90" fontSize="5.5" fill="hsl(210, 15%, 40%)" fontFamily="DM Sans">other</text>
            </>
          )}
        </svg>

        {/* Explanation text */}
        <div className="flex-1 space-y-2 pt-1">
          <p className="text-xs text-muted-foreground leading-relaxed">
            It's the <span className="text-foreground font-medium">one thing</span> that bothers you most each cycle. Logan uses it as your main signal — so you'll get a heads-up before it hits, instead of being blindsided.
          </p>
          <div className="bg-muted/30 rounded-lg p-2.5">
            <p className="text-[11px] text-foreground leading-snug">
              Think: the symptom where you later go <span className="italic text-muted-foreground">"oh... that's why"</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// 5. "I'M NOT SURE" BUTTON — with expandable explanation
// ═══════════════════════════════════════════════════════════════════════════

interface NotSureButtonProps {
  field: "cycle_length" | "last_period";
  onUseDefault: (value: string) => void;
  disabled?: boolean;
}

export function NotSureButton({ field, onUseDefault, disabled }: NotSureButtonProps) {
  const [expanded, setExpanded] = useState(false);

  const explanations = {
    cycle_length: {
      title: "Not sure about your cycle length?",
      explanation: "Your cycle length is the number of days from the start of one period to the start of the next. Most cycles are between 24-35 days. If you've never tracked it, that's totally fine!",
      default: "28",
      defaultLabel: "Use 28 days (average)",
    },
    last_period: {
      title: "Can't remember exactly?",
      explanation: "Try to think about your last period — even a rough guess helps Logan get started. You can always update this later as you track.",
      default: "approximate",
      defaultLabel: "It was about 2 weeks ago",
    },
  };

  const info = explanations[field];

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        disabled={disabled}
        className="text-xs text-muted-foreground hover:text-primary transition-colors underline decoration-dotted underline-offset-2 mt-2"
      >
        I'm not sure
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-card border border-border/50 p-3 space-y-2 animate-fade-in mt-2">
      <p className="text-xs font-medium text-foreground">{info.title}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{info.explanation}</p>
      <button
        type="button"
        onClick={() => onUseDefault(info.default)}
        disabled={disabled}
        className="w-full text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-lg py-2 px-3 transition-colors font-medium"
      >
        {info.defaultLabel}
      </button>
    </div>
  );
}
