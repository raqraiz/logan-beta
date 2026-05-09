/**
 * Small SVG-based visual graphics for home screen widgets.
 * Each widget type gets a thematic mini-illustration + a phase arc indicator.
 */

const PHASE_HSL: Record<string, string> = {
  Menstruation: "hsl(355, 78%, 60%)",
  Follicular: "hsl(152, 60%, 52%)",
  Ovulation: "hsl(40, 90%, 56%)",
  Luteal: "hsl(270, 60%, 65%)",
};

const PHASE_HSL_DIM: Record<string, string> = {
  Menstruation: "hsl(355, 78%, 60%, 0.15)",
  Follicular: "hsl(152, 60%, 52%, 0.15)",
  Ovulation: "hsl(40, 90%, 56%, 0.15)",
  Luteal: "hsl(270, 60%, 65%, 0.15)",
};

/* Mini phase arc – shows current position in a tiny ring */
export function MiniPhaseArc({
  cycleDay,
  cycleLengthDays,
  phase,
  size = 36,
}: {
  cycleDay: number;
  cycleLengthDays: number;
  phase: string;
  size?: number;
}) {
  const color = PHASE_HSL[phase] || "hsl(var(--primary))";
  const dimColor = PHASE_HSL_DIM[phase] || "hsl(var(--primary) / 0.15)";
  const r = (size - 6) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.min(cycleDay / cycleLengthDays, 1);
  const dashOffset = circumference * (1 - progress);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={dimColor} strokeWidth={2.5} />
      {/* Progress arc */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r={2} fill={color} />
    </svg>
  );
}

/* Thematic illustrations per widget category */

export function SucceedYouGraphic({ phase }: { phase: string }) {
  const color = PHASE_HSL[phase] || "hsl(var(--primary))";
  const dim = PHASE_HSL_DIM[phase] || "hsl(var(--primary) / 0.15)";
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" className="flex-shrink-0">
      {/* Rising bar chart – growth/success */}
      <rect x="4" y="28" width="6" height="12" rx="2" fill={dim} />
      <rect x="13" y="20" width="6" height="20" rx="2" fill={dim} />
      <rect x="22" y="14" width="6" height="26" rx="2" fill={color} opacity="0.5" />
      <rect x="31" y="6" width="6" height="34" rx="2" fill={color} opacity="0.8" />
      {/* Star accent */}
      <path d="M37 4l1 2.5 2.5 0.5-1.8 1.8 0.4 2.5L37 10l-2.1 1.3 0.4-2.5-1.8-1.8 2.5-0.5z" fill={color} />
    </svg>
  );
}

export function SucceedHimGraphic({ phase }: { phase: string }) {
  const color = PHASE_HSL[phase] || "hsl(var(--primary))";
  const dim = PHASE_HSL_DIM[phase] || "hsl(var(--primary) / 0.15)";
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" className="flex-shrink-0">
      {/* Two connected figures – partnership */}
      <circle cx="15" cy="12" r="5" fill={dim} />
      <path d="M8 28c0-4 3-7 7-7s7 3 7 7" stroke={dim} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="29" cy="12" r="5" fill={color} opacity="0.6" />
      <path d="M22 28c0-4 3-7 7-7s7 3 7 7" stroke={color} opacity="0.6" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* Heart bridge */}
      <path d="M22 32c0-2 1.5-3.5 3-3.5s2.5 1.5 2.5 3c0 2.5-3 4.5-3 4.5S19 34.5 19 32c0-1.5 1-3 2.5-3S22 30 22 32z"
        fill={color} opacity="0.8" />
    </svg>
  );
}

export function DontMessUpYouGraphic({ phase }: { phase: string }) {
  const color = PHASE_HSL[phase] || "hsl(var(--primary))";
  const dim = PHASE_HSL_DIM[phase] || "hsl(var(--primary) / 0.15)";
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" className="flex-shrink-0">
      {/* Shield shape */}
      <path
        d="M22 4L6 12v10c0 9 7 16 16 18 9-2 16-9 16-18V12L22 4z"
        fill={dim}
        stroke={color}
        strokeWidth="1.5"
        opacity="0.7"
      />
      {/* Checkmark inside */}
      <path d="M15 22l5 5 9-10" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DontMessUpHimGraphic({ phase }: { phase: string }) {
  const color = PHASE_HSL[phase] || "hsl(var(--primary))";
  const dim = PHASE_HSL_DIM[phase] || "hsl(var(--primary) / 0.15)";
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" className="flex-shrink-0">
      {/* Compass/navigation – guidance */}
      <circle cx="22" cy="22" r="16" fill={dim} stroke={color} strokeWidth="1.5" opacity="0.5" />
      <circle cx="22" cy="22" r="10" fill="none" stroke={color} strokeWidth="1" opacity="0.3" />
      {/* Compass needle */}
      <path d="M22 10l3 12-3 2-3-2z" fill={color} opacity="0.8" />
      <path d="M22 34l-3-12 3-2 3 2z" fill={color} opacity="0.3" />
      {/* Cardinal dots */}
      <circle cx="22" cy="6" r="1.5" fill={color} opacity="0.6" />
      <circle cx="38" cy="22" r="1.5" fill={color} opacity="0.3" />
      <circle cx="22" cy="38" r="1.5" fill={color} opacity="0.3" />
      <circle cx="6" cy="22" r="1.5" fill={color} opacity="0.3" />
    </svg>
  );
}

export function CustomWidgetGraphic({ phase }: { phase: string }) {
  const color = PHASE_HSL[phase] || "hsl(var(--primary))";
  const dim = PHASE_HSL_DIM[phase] || "hsl(var(--primary) / 0.15)";
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" className="flex-shrink-0">
      {/* Sparkle/magic wand – AI generated */}
      <path d="M22 4v8M22 32v8M4 22h8M32 22h8" stroke={dim} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 10l5 5M29 29l5 5M34 10l-5 5M15 29l-5 5" stroke={dim} strokeWidth="1.5" strokeLinecap="round" />
      {/* Center diamond */}
      <path d="M22 14l6 8-6 8-6-8z" fill={color} opacity="0.6" />
      <path d="M22 16l4 6-4 6-4-6z" fill={color} opacity="0.3" />
    </svg>
  );
}

/* Helper to get the right graphic by widget ID */
export function getWidgetGraphic(widgetId: string, phase: string) {
  switch (widgetId) {
    case "succeed_you":
      return <SucceedYouGraphic phase={phase} />;
    case "succeed_him":
      return <SucceedHimGraphic phase={phase} />;
    case "dontmessup_you":
      return <DontMessUpYouGraphic phase={phase} />;
    case "dontmessup_him":
      return <DontMessUpHimGraphic phase={phase} />;
    default:
      return <CustomWidgetGraphic phase={phase} />;
  }
}
