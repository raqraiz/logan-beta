import { useState, useEffect } from "react";
import { Droplets, Sprout, Zap, Moon, Frown, Brain, BatteryLow, Smile, Crosshair, HelpCircle } from "lucide-react";

// ─── Animated Cycle Basics Card ─────────────────────────────────────────

const PHASES = [
  { name: "Period", color: "hsl(355, 78%, 60%)", startAngle: 0, endAngle: 90, description: "Your body resets", Icon: Droplets },
  { name: "Build-up", color: "hsl(152, 60%, 52%)", startAngle: 90, endAngle: 180, description: "Energy rises", Icon: Sprout },
  { name: "Peak", color: "hsl(40, 90%, 56%)", startAngle: 180, endAngle: 250, description: "You're sharpest", Icon: Zap },
  { name: "Wind-down", color: "hsl(270, 60%, 65%)", startAngle: 250, endAngle: 360, description: "Body slows down", Icon: Moon },
];

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

export function CycleBasicsCard() {
  const [visiblePhases, setVisiblePhases] = useState(0);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    PHASES.forEach((_, i) => {
      timers.push(setTimeout(() => setVisiblePhases(i + 1), 400 * (i + 1)));
    });
    timers.push(setTimeout(() => setShowText(true), 400 * (PHASES.length + 1)));
    return () => timers.forEach(clearTimeout);
  }, []);

  const cx = 60, cy = 60, r = 44;

  return (
    <div className="rounded-xl bg-card border border-border/50 p-4 space-y-3 animate-fade-in">
      <p className="text-xs font-semibold text-primary uppercase tracking-wider">Your cycle in 30 seconds</p>
      
      <div className="flex items-center gap-4">
        {/* Animated ring */}
        <svg width="120" height="120" viewBox="0 0 120 120" className="flex-shrink-0">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(220, 10%, 18%)" strokeWidth="8" />
          {PHASES.slice(0, visiblePhases).map((phase, i) => (
            <path
              key={i}
              d={arcPath(cx, cy, r, phase.startAngle, phase.endAngle)}
              fill="none"
              stroke={phase.color}
              strokeWidth="8"
              strokeLinecap="round"
              className="transition-all duration-500"
              style={{ opacity: 1, filter: `drop-shadow(0 0 4px ${phase.color}40)` }}
            />
          ))}
          <text x={cx} y={cy - 4} textAnchor="middle" fill="hsl(210, 20%, 97%)" fontSize="11" fontWeight="600" fontFamily="Space Grotesk, sans-serif">
            ~28
          </text>
          <text x={cx} y={cy + 10} textAnchor="middle" fill="hsl(210, 15%, 55%)" fontSize="8" fontFamily="DM Sans, sans-serif">
            days
          </text>
        </svg>

        {/* Phase labels */}
        <div className="space-y-1.5 flex-1">
          {PHASES.map((phase, i) => (
            <div
              key={i}
              className="flex items-center gap-2 transition-all duration-300"
              style={{
                opacity: i < visiblePhases ? 1 : 0,
                transform: i < visiblePhases ? "translateX(0)" : "translateX(-8px)",
              }}
            >
              <phase.Icon size={14} className="flex-shrink-0" style={{ color: phase.color }} />
              <div>
                <span className="text-xs font-medium text-foreground">{phase.name}</span>
                <span className="text-[10px] text-muted-foreground ml-1">— {phase.description}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showText && (
        <p className="text-xs text-muted-foreground leading-relaxed animate-fade-in">
          Every month your body goes through these 4 phases. Each one changes how you feel, think, and perform. Logan tracks where you are so you can stop guessing.
        </p>
      )}
    </div>
  );
}


// ─── Hormone Basics Card ────────────────────────────────────────────────

export function HormoneBasicsCard() {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimate(true), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="rounded-xl bg-card border border-border/50 p-4 space-y-3 animate-fade-in">
      <p className="text-xs font-semibold text-primary uppercase tracking-wider">Why you feel different each week</p>
      
      <div className="relative h-16 overflow-hidden rounded-lg bg-muted/30">
        <svg viewBox="0 0 200 60" className="w-full h-full" preserveAspectRatio="none">
          <path
            d="M0,50 C30,50 40,15 70,10 C100,5 110,30 130,35 C150,40 170,45 200,48"
            fill="none" stroke="hsl(152, 60%, 52%)" strokeWidth="2" strokeLinecap="round"
            className="transition-all duration-1000"
            style={{ strokeDasharray: 300, strokeDashoffset: animate ? 0 : 300 }}
          />
          <path
            d="M0,55 C50,55 80,50 100,45 C120,40 130,15 150,10 C170,5 190,40 200,50"
            fill="none" stroke="hsl(270, 60%, 65%)" strokeWidth="2" strokeLinecap="round"
            className="transition-all duration-1000 delay-500"
            style={{ strokeDasharray: 300, strokeDashoffset: animate ? 0 : 300 }}
          />
          <text x="20" y="58" fontSize="5" fill="hsl(210, 15%, 55%)" fontFamily="DM Sans">Period</text>
          <text x="65" y="58" fontSize="5" fill="hsl(210, 15%, 55%)" fontFamily="DM Sans">Build-up</text>
          <text x="115" y="58" fontSize="5" fill="hsl(210, 15%, 55%)" fontFamily="DM Sans">Peak</text>
          <text x="165" y="58" fontSize="5" fill="hsl(210, 15%, 55%)" fontFamily="DM Sans">Wind-down</text>
        </svg>
      </div>

      <div className="flex gap-3 text-[10px]">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-phase-follicular" /> Estrogen (energy)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-phase-luteal" /> Progesterone (calm)
        </span>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Two main hormones rise and fall throughout your cycle. When they shift, so does your mood, energy, and focus. That's not random — it's a pattern you can learn.
      </p>
    </div>
  );
}


// ─── Symptom Explainer Card ─────────────────────────────────────────────

const SYMPTOM_ITEMS = [
  { label: "Mood dips", when: "Usually weeks 3-4", Icon: Frown },
  { label: "Brain fog", when: "Usually weeks 3-4", Icon: Brain },
  { label: "Energy crashes", when: "Week 1 & 3-4", Icon: BatteryLow },
  { label: "Feeling great", when: "Usually weeks 2-3", Icon: Smile },
];

export function SymptomExplainerCard() {
  return (
    <div className="rounded-xl bg-card border border-border/50 p-4 space-y-3 animate-fade-in">
      <p className="text-xs font-semibold text-primary uppercase tracking-wider">Your symptoms aren't random</p>
      
      <div className="grid grid-cols-2 gap-2">
        {SYMPTOM_ITEMS.map((item, i) => (
          <div key={i} className="rounded-lg bg-muted/30 p-2.5 space-y-1">
            <item.Icon size={16} className="text-primary" />
            <p className="text-xs font-medium text-foreground">{item.label}</p>
            <p className="text-[10px] text-muted-foreground">{item.when}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Most symptoms follow a predictable timing. Once you spot your pattern, you can plan around it instead of being caught off guard.
      </p>
    </div>
  );
}


// ─── Anchor Symptom Explainer ───────────────────────────────────────────

export function AnchorExplainerCard() {
  return (
    <div className="rounded-xl bg-card border border-border/50 p-4 space-y-2 animate-fade-in">
      <p className="text-xs font-semibold text-primary uppercase tracking-wider">What's an anchor symptom?</p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        It's the <span className="text-foreground font-medium">one thing</span> that bothers you most each cycle. Logan uses it as your main signal — so you'll get a heads-up before it hits, instead of being blindsided.
      </p>
      <div className="flex items-center gap-2 bg-muted/30 rounded-lg p-2.5">
        <Crosshair size={16} className="text-primary flex-shrink-0" />
        <p className="text-[11px] text-foreground">Think: the symptom where you later go <span className="italic text-muted-foreground">"oh... that's why"</span></p>
      </div>
    </div>
  );
}


// ─── "I'm Not Sure" Button ──────────────────────────────────────────────

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
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors underline decoration-dotted underline-offset-2 mt-2"
      >
        <HelpCircle size={12} />
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
