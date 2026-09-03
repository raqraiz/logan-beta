import { type PhaseLengths, getPhaseLengthPrefs } from "@/lib/phaseLengths";
import { calculateCycleInfoShared } from "@/lib/cycleCalculations";

type LifeStage = "cycling" | "irregular" | "postpartum" | "menopause" | "perimenopause" | "pregnancy_loss" | "pregnant";


interface ChatCycleCircleProps {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
  size?: "sm" | "md";
  lifeStage?: LifeStage;
  dueDate?: string;
  pregnancyLmp?: string;
  postpartumStartDate?: string;
  /** Source of truth for birth-control copy. null/undefined = unknown -> no BC wording */
  onHormonalBc?: boolean | null;
  /** When true (and lifeStage='cycling'), overlay a small postpartum recovery badge */
  postpartumActive?: boolean;
  lossDate?: string;
}

function formatPpShort(postpartumStartDate?: string): string | null {
  if (!postpartumStartDate) return null;
  const start = new Date(postpartumStartDate + "T12:00:00Z");
  const diffDays = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0 || diffDays > 1095) return null;
  if (diffDays < 7) return `${diffDays + 1}d`;
  const weeks = Math.floor(diffDays / 7);
  if (weeks < 12) return `${weeks}w`;
  const months = Math.floor(diffDays / 30);
  return `${months}mo`;
}

function PpBadgeInside({ postpartumStartDate, size }: { postpartumStartDate?: string; size: "sm" | "md" }) {
  const label = formatPpShort(postpartumStartDate);
  if (!label) return null;
  if (size === "sm") {
    // Tiny pink dot at bottom of ring for compact size
    return (
      <div
        className="absolute bottom-[2px] left-1/2 -translate-x-1/2 z-30 w-1.5 h-1.5 rounded-full bg-pink-400 shadow-[0_0_6px_rgba(244,114,182,0.8)]"
        title={`${label} postpartum`}
      />
    );
  }
  return (
    <div
      className="absolute bottom-[18%] left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-[3px] rounded-full bg-card border border-pink-400/30"
      title={`${label} postpartum`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-pink-400 shadow-[0_0_4px_rgba(244,114,182,0.9)]" />
      <span className="text-[9px] font-medium tracking-wider text-pink-300 uppercase leading-none">{label} pp</span>
    </div>
  );
}

const PHASE_STYLES: Record<string, { color: string; ringColor: string; hex: string }> = {
  Menstruation: {
    color: "text-phase-menstruation",
    ringColor: "stroke-phase-menstruation",
    hex: "#E05262",
  },
  Follicular: {
    color: "text-phase-follicular",
    ringColor: "stroke-phase-follicular",
    hex: "#3DBF8A",
  },
  Ovulation: {
    color: "text-phase-ovulation",
    ringColor: "stroke-phase-ovulation",
    hex: "#E8A830",
  },
  Luteal: {
    color: "text-phase-luteal",
    ringColor: "stroke-phase-luteal",
    hex: "#9B6DD7",
  },
  Postpartum: {
    color: "text-pink-400",
    ringColor: "stroke-pink-400",
    hex: "#F472B6",
  },
  Menopause: {
    color: "text-amber-400",
    ringColor: "stroke-amber-400",
    hex: "#FBBF24",
  },
  Perimenopause: {
    color: "text-amber-300",
    ringColor: "stroke-amber-300",
    hex: "#FCD34D",
  },
  Overdue: {
    color: "text-amber-300",
    ringColor: "stroke-amber-300",
    hex: "#FCD34D",
  },
};

function CycleRing({ cycleDay, phase, cycleLengthDays, ringSize, fontSize, labelSize, showPhase = false }: {
  cycleDay: number; phase: string; cycleLengthDays: number;
  ringSize: string; fontSize: string; labelSize: string; showPhase?: boolean;
}) {
  const styles = PHASE_STYLES[phase] || PHASE_STYLES.Follicular;
  const progress = Math.min(cycleDay / cycleLengthDays, 1) * 100;
  const radius = 42;
  const trackWidth = 3;
  const arcWidth = 3;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className={`relative ${ringSize} flex-shrink-0`}>
      {/* Inner disc with subtle depth */}
      <div className="absolute inset-[6px] rounded-full bg-[hsl(220,10%,8%)] shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)]" />
      {/* SVG ring */}
      <svg className="w-full h-full -rotate-90 relative z-10" viewBox="0 0 100 100">
        {/* Track */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          strokeWidth={trackWidth}
          stroke="hsl(220 10% 16%)"
        />
        {/* Progress arc */}
        <circle
          cx="50" cy="50" r={radius}
          fill="none"
          strokeWidth={arcWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          stroke={styles.hex}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
        <span className={`${fontSize} font-bold ${styles.color}`}>{cycleDay}</span>
        {showPhase ? (
          <span className={`${labelSize} font-medium ${styles.color} opacity-80`}>{phase}</span>
        ) : (
          <span className={`${labelSize} text-muted-foreground uppercase tracking-wide`}>Day</span>
        )}
      </div>
    </div>
  );
}

// Static badge for non-cycling/steady life stages (postpartum, menopause, irregular/on-the-pill, pregnancy loss, pregnant, or stale cycling)
function LifeStageBadge({ lifeStage, size, postpartumStartDate, lossDate, dueDate, pregnancyLmp, steadyReason, onHormonalBc }: { lifeStage: "postpartum" | "menopause" | "perimenopause" | "irregular" | "steady" | "pregnancy_loss" | "pregnant"; size: "sm" | "md"; postpartumStartDate?: string; lossDate?: string; dueDate?: string; pregnancyLmp?: string; steadyReason?: "pill" | "stale"; onHormonalBc?: boolean | null }) {
  const stageKey =
    lifeStage === "postpartum" ? "Postpartum" :
    lifeStage === "menopause" ? "Menopause" :
    lifeStage === "perimenopause" ? "Perimenopause" :
    "Follicular"; // reuse a calm teal-ish for irregular/steady
  const styles = lifeStage === "irregular" || lifeStage === "steady"
    ? { color: "text-primary", ringColor: "stroke-primary", hex: "#15B88C" }
    : lifeStage === "pregnancy_loss"
      ? { color: "text-rose-300", ringColor: "stroke-rose-300", hex: "#D4A5A5" }
      : lifeStage === "pregnant"
        ? { color: "text-emerald-300", ringColor: "stroke-emerald-300", hex: "#86D7B5" }
        : PHASE_STYLES[stageKey];
  const label =
    lifeStage === "postpartum" ? "Postpartum" :
    lifeStage === "menopause" ? "Menopause" :
    lifeStage === "perimenopause" ? "Perimenopause" :
    lifeStage === "pregnancy_loss" ? "Healing" :
    lifeStage === "pregnant" ? "Pregnant" :
    lifeStage === "steady" ? (steadyReason === "stale" ? "Overdue" : "Steady") :
    "Steady";


  // Calculate weeks postpartum (or a default number for menopause/irregular)
  let displayNumber = "—";
  // BC copy is driven ONLY by on_hormonal_bc. null/undefined = unknown -> neutral wording.
  const bcLabel = onHormonalBc === true ? "Hormonal BC" : "Own rhythm";
  let subLabel = lifeStage === "postpartum" ? "Recovery" : lifeStage === "menopause" ? "Transition" : lifeStage === "perimenopause" ? "Transition" : lifeStage === "pregnancy_loss" ? "Recovery" : bcLabel;
  if (lifeStage === "steady") {
    subLabel = steadyReason === "stale" ? "Period overdue" : bcLabel;
  }
  if (lifeStage === "irregular") {
    subLabel = onHormonalBc === true ? "On the pill / irregular" : "Irregular cycle";
  }
  if (lifeStage === "postpartum" && postpartumStartDate) {
    const start = new Date(postpartumStartDate + "T12:00:00Z");
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      displayNumber = "0";
      subLabel = "Week";
    } else if (diffDays < 7) {
      displayNumber = String(diffDays + 1);
      subLabel = "Day";
    } else {
      const weeks = Math.floor(diffDays / 7);
      displayNumber = String(weeks);
      subLabel = weeks === 1 ? "Week" : "Weeks";
    }
  } else if (lifeStage === "postpartum") {
    displayNumber = "—";
    subLabel = "Week";
  }
  if (lifeStage === "pregnancy_loss") {
    if (lossDate) {
      const start = new Date(lossDate + "T12:00:00Z");
      const diffDays = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        displayNumber = "♡";
        subLabel = "Healing";
      } else if (diffDays < 14) {
        displayNumber = String(diffDays + 1);
        subLabel = diffDays === 0 ? "Day 1" : "Day";
      } else {
        const weeks = Math.floor(diffDays / 7);
        displayNumber = String(weeks);
        subLabel = weeks === 1 ? "Week" : "Weeks";
      }
    } else {
      displayNumber = "♡";
      subLabel = "Healing";
    }
  }
  if (lifeStage === "pregnant") {
    // Compute gestational week. Prefer LMP (standard OB method = days since LMP / 7).
    // If only due date is known: gestational age ≈ 40w - (due - today).
    const today = new Date();
    let gestWeeks: number | null = null;
    if (pregnancyLmp) {
      const lmp = new Date(pregnancyLmp + "T12:00:00Z");
      const days = Math.floor((today.getTime() - lmp.getTime()) / (1000 * 60 * 60 * 24));
      if (days >= 0) gestWeeks = Math.floor(days / 7);
    } else if (dueDate) {
      const due = new Date(dueDate + "T12:00:00Z");
      const daysToDue = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      gestWeeks = Math.max(0, 40 - Math.ceil(daysToDue / 7));
    }
    if (gestWeeks !== null && gestWeeks >= 0 && gestWeeks <= 45) {
      displayNumber = String(gestWeeks);
      subLabel = gestWeeks <= 13 ? "Trimester 1" : gestWeeks <= 27 ? "Trimester 2" : "Trimester 3";
    } else {
      displayNumber = "🌱";
      subLabel = "Pregnant";
    }
  }
  // Irregular / on-the-pill / steady: no day number, show a glyph instead.
  // Pill 💊 only for irregular users explicitly on hormonal BC; hourglass ⏳ for stale/overdue cycles.
  // Non-BC irregular users get the same neutral dot as steady non-stale users.
  const showGlyph = lifeStage === "irregular" || lifeStage === "steady";
  const glyph =
    lifeStage === "irregular"
      ? onHormonalBc === true
        ? "💊"
        : "•"
      : (steadyReason === "stale" ? "⏳" : "•");

  // Perforated (dashed) ring style
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  // For steady/irregular, draw a smooth continuous ring (no dashes — nothing is cycling)
  const dashAttr = showGlyph ? undefined : "12 8";
  const dashAttrLg = showGlyph ? undefined : "14 10";

  if (size === "sm") {
    return (
      <div className="relative w-10 h-10 flex-shrink-0" title={`${label}${subLabel ? ` · ${subLabel}` : ""}`}>
        <div className="absolute inset-[3px] rounded-full bg-[hsl(220,10%,8%)]" />
        <svg className="w-full h-full relative z-10" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            strokeWidth="3.5"
            stroke="hsl(var(--muted))"
            opacity="0.9"
          />
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            stroke={styles.hex}
            strokeDasharray={dashAttr}
            opacity="0.95"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          {showGlyph ? (
            <span className="text-[14px] leading-none" aria-hidden>{glyph}</span>
          ) : (
            <span className="text-[11px] font-bold leading-none" style={{ color: styles.hex }}>
              {displayNumber}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-4">
      <div className="relative w-56 h-56 flex-shrink-0">
        <div className="absolute inset-[6px] rounded-full bg-[hsl(220,10%,8%)] shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)]" />
        <svg className="w-full h-full relative z-10" viewBox="0 0 100 100">
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            strokeWidth="5"
            stroke="hsl(var(--muted))"
            opacity="0.9"
          />
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            stroke={styles.hex}
            strokeDasharray={dashAttrLg}
            opacity="0.9"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 px-4 text-center">
          {showGlyph ? (
            <span className="text-4xl leading-none" aria-hidden>{glyph}</span>
          ) : (
            <span className="text-4xl font-bold leading-none" style={{ color: styles.hex }}>
              {displayNumber}
            </span>
          )}
          <span className="text-xs text-muted-foreground mt-2">{subLabel}</span>
          <span className="text-sm font-semibold mt-0.5" style={{ color: styles.hex }}>{label}</span>
        </div>
      </div>
    </div>
  );
}

// Dedicated visual for pregnancy: 40-week progress arc with trimester zones,
// growing seedling glyph that scales with gestational age, soft emerald palette.
function PregnancyCircle({ size, dueDate, pregnancyLmp }: { size: "sm" | "md"; dueDate?: string; pregnancyLmp?: string }) {
  // Compute gestational days
  const today = new Date();
  let gestDays: number | null = null;
  if (pregnancyLmp) {
    const lmp = new Date(pregnancyLmp + "T12:00:00Z");
    const d = Math.floor((today.getTime() - lmp.getTime()) / (1000 * 60 * 60 * 24));
    if (d >= 0) gestDays = d;
  } else if (dueDate) {
    const due = new Date(dueDate + "T12:00:00Z");
    const daysToDue = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    gestDays = Math.max(0, 280 - daysToDue);
  }

  const totalDays = 280; // 40w
  const gestWeeks = gestDays !== null ? Math.floor(gestDays / 7) : null;
  const progress = gestDays !== null ? Math.min(gestDays / totalDays, 1) : 0;

  const trimesterLabel =
    gestWeeks === null ? "Pregnant" :
    gestWeeks <= 13 ? "Trimester 1" :
    gestWeeks <= 27 ? "Trimester 2" : "Trimester 3";

  // Glyph grows by trimester: bud → sprout → blossom
  const glyph = gestWeeks === null ? "🌱" : gestWeeks <= 13 ? "🌱" : gestWeeks <= 27 ? "🌿" : "🌸";

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - progress * circumference;

  // Trimester arc segments (in % of circumference): T1 = 13/40, T2 = 14/40, T3 = 13/40
  const seg1 = (13 / 40) * circumference;
  const seg2 = (14 / 40) * circumference;
  const seg3 = (13 / 40) * circumference;
  const gap = 2;

  const T1 = "#86D7B5"; // emerald-300
  const T2 = "#F5C089"; // warm peach
  const T3 = "#E8A4C9"; // soft pink

  if (size === "sm") {
    return (
      <div className="relative w-10 h-10 flex-shrink-0" title={`${trimesterLabel}${gestWeeks !== null ? ` · Week ${gestWeeks}` : ""}`}>
        <div className="absolute inset-[3px] rounded-full bg-[hsl(220,10%,8%)]" />
        <svg className="w-full h-full -rotate-90 relative z-10" viewBox="0 0 100 100">
          {/* Trimester track segments */}
          <circle
            cx="50" cy="50" r={radius}
            fill="none" strokeWidth="3" stroke={T1} opacity="0.35"
            strokeDasharray={`${seg1 - gap} ${circumference - seg1 + gap}`}
            strokeDashoffset={0}
          />
          <circle
            cx="50" cy="50" r={radius}
            fill="none" strokeWidth="3" stroke={T2} opacity="0.35"
            strokeDasharray={`${seg2 - gap} ${circumference - seg2 + gap}`}
            strokeDashoffset={-seg1}
          />
          <circle
            cx="50" cy="50" r={radius}
            fill="none" strokeWidth="3" stroke={T3} opacity="0.35"
            strokeDasharray={`${seg3 - gap} ${circumference - seg3 + gap}`}
            strokeDashoffset={-(seg1 + seg2)}
          />
          {/* Progress arc */}
          <circle
            cx="50" cy="50" r={radius} fill="none" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            stroke="#86D7B5"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center z-20">
          {gestWeeks !== null ? (
            <span className="text-[11px] font-bold leading-none text-emerald-300">{gestWeeks}w</span>
          ) : (
            <span className="text-[14px] leading-none" aria-hidden>{glyph}</span>
          )}
        </div>
      </div>
    );
  }

  // Large
  return (
    <div className="flex items-center justify-center py-4">
      <div className="relative w-56 h-56 flex-shrink-0">
        {/* Soft glow */}
        <div className="absolute inset-0 rounded-full bg-emerald-300/5 blur-xl" />
        <div className="absolute inset-[6px] rounded-full bg-[hsl(220,10%,8%)] shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)]" />
        <svg className="w-full h-full -rotate-90 relative z-10" viewBox="0 0 100 100">
          {/* Trimester segments */}
          <circle
            cx="50" cy="50" r={radius}
            fill="none" strokeWidth="5" stroke={T1} opacity="0.3"
            strokeDasharray={`${seg1 - gap} ${circumference - seg1 + gap}`}
            strokeDashoffset={0}
          />
          <circle
            cx="50" cy="50" r={radius}
            fill="none" strokeWidth="5" stroke={T2} opacity="0.3"
            strokeDasharray={`${seg2 - gap} ${circumference - seg2 + gap}`}
            strokeDashoffset={-seg1}
          />
          <circle
            cx="50" cy="50" r={radius}
            fill="none" strokeWidth="5" stroke={T3} opacity="0.3"
            strokeDasharray={`${seg3 - gap} ${circumference - seg3 + gap}`}
            strokeDashoffset={-(seg1 + seg2)}
          />
          {/* Progress arc */}
          <circle
            cx="50" cy="50" r={radius} fill="none" strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            stroke="#86D7B5"
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 px-4 text-center">
          <span className="text-2xl leading-none mb-1" aria-hidden>{glyph}</span>
          {gestWeeks !== null ? (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold leading-none text-emerald-300">{gestWeeks}</span>
                <span className="text-sm text-muted-foreground">/ 40w</span>
              </div>
              <span className="text-xs text-muted-foreground mt-2">{trimesterLabel}</span>
              {dueDate && (
                <span className="text-[10px] text-muted-foreground/70 mt-0.5 uppercase tracking-wider">
                  Due {new Date(dueDate + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="text-2xl font-bold text-emerald-300 mt-1">Pregnant</span>
              <span className="text-xs text-muted-foreground mt-1">Add LMP or due date</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


export function ChatCycleCircle({ cycleDay, phase, cycleLengthDays, size = "md", lifeStage = "cycling", postpartumStartDate, postpartumActive = false, lossDate, dueDate, pregnancyLmp, onHormonalBc = null }: ChatCycleCircleProps) {
  // Postpartum/menopause/pregnancy-loss/pregnant/irregular users get a static badge.
  if (lifeStage === "postpartum" || lifeStage === "menopause" || lifeStage === "perimenopause") {
    return <LifeStageBadge lifeStage={lifeStage} size={size} postpartumStartDate={postpartumStartDate} />;
  }
  if (lifeStage === "pregnancy_loss") {
    return <LifeStageBadge lifeStage="pregnancy_loss" size={size} lossDate={lossDate} />;
  }
  if (lifeStage === "pregnant") {
    return <PregnancyCircle size={size} dueDate={dueDate} pregnancyLmp={pregnancyLmp} />;
  }
  if (lifeStage === "irregular") {
    return <LifeStageBadge lifeStage="irregular" size={size} onHormonalBc={onHormonalBc} />;
  }
  // Cycling users always wrap to their input cycle length — no "overdue" pseudo-state.
  // Proactive check-in messages before the assumed day 1 confirm whether the cycle has shifted.

  const showPpBadge = postpartumActive && !!postpartumStartDate;
  const isSmall = size === "sm";

  if (isSmall) {
    const styles = PHASE_STYLES[phase] || PHASE_STYLES.Follicular;
    const progress = Math.min(cycleDay / cycleLengthDays, 1) * 100;
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
      <div className="relative w-10 h-10 flex-shrink-0 group cursor-pointer transition-colors duration-200">
        <div className="absolute inset-[3px] rounded-full bg-[hsl(220,10%,8%)]" />
        <svg className="w-full h-full -rotate-90 relative z-10" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="5" stroke="hsl(220 10% 16%)" />
          <circle
            cx="50" cy="50" r={radius} fill="none" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            stroke={styles.hex}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <span className={`text-xs font-bold ${styles.color}`}>{cycleDay}</span>
        </div>
        {showPpBadge && <PpBadgeInside postpartumStartDate={postpartumStartDate} size="sm" />}
      </div>
    );
  }

  // Large centered circle
  return (
    <div className="flex items-center justify-center py-4">
      <div className="relative">
        <CycleRing
          cycleDay={cycleDay}
          phase={phase}
          cycleLengthDays={cycleLengthDays}
          ringSize="w-56 h-56"
          fontSize="text-5xl"
          labelSize="text-sm"
          showPhase
        />
        {showPpBadge && <PpBadgeInside postpartumStartDate={postpartumStartDate} size="md" />}
      </div>
    </div>
  );
}

// Helper to calculate cycle info from dates — delegates to the single source
// of truth in @/lib/cycleCalculations (canonical logic from chat-ai, mirrored
// for the client in supabase/functions/_shared/cycleCalculations.ts).
// Ring-specific display policy is passed explicitly: overdue cycles now match
// the server and never wrap (true running day count), pre-start reference
// dates still wrap modulo, and unbounded pending counts cap into an "Overdue"
// phase for the ring's visual state only.
export function calculateCycleInfo(
  lastPeriodStart: string | null,
  cycleLengthDays: number | null,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
  forDate?: Date | string | null,
  currentPeriodEndDate?: string | null,
  /** When true, do NOT wrap an overdue cycle to the next assumed cycle.
   * Used after the user has explicitly told Logan her period has NOT started
   * yet — we keep showing the true (overdue) day count and wait for her to
   * confirm Day 1, rather than silently rolling into a fake next cycle. */
  periodPending?: boolean,
  /** When true, the user has told Logan her period is still ongoing past the
   * default 5-day window — keep phase as Menstruation until she logs an end
   * date or starts a new cycle. */
  periodStillActive?: boolean,
  /** Per-user phase lengths. Falls back to the global prefs, then to the
   * historical hardcoded defaults, per field. */
  phaseLengths?: PhaseLengths | null
): { cycleDay: number; phase: string } | null {
  return calculateCycleInfoShared(lastPeriodStart, cycleLengthDays, {
    timezone,
    asOfDate: forDate ?? null,
    currentPeriodEndDate: currentPeriodEndDate ?? null,
    periodPending: !!periodPending,
    periodStillActive: !!periodStillActive,
    phaseLengths: phaseLengths ?? getPhaseLengthPrefs() ?? null,
    overduePolicy: "no-wrap",
    futureStartPolicy: "wrap",
    overdueCap: true,
  });
}
