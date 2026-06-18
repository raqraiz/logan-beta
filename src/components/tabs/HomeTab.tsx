import { useState, useCallback } from "react";
import { ChatCycleCircle } from "@/components/chat/ChatCycleCircle";
import { CycleAnalytics } from "@/components/chat/CycleAnalytics";
import { HormoneChart } from "@/components/chat/HormoneChart";
import { SymptomMap } from "@/components/chat/SymptomMap";
import { LoganLogo } from "@/components/LoganLogo";
import { WidgetEditMode } from "@/components/home/WidgetEditMode";
import { AddCustomWidgetDialog } from "@/components/home/AddCustomWidgetDialog";
import { CustomAIWidget } from "@/components/home/CustomAIWidget";
import { SymptomLogWidget } from "@/components/home/SymptomLogWidget";
import { SymptomHistory } from "@/components/home/SymptomHistory";
import { CycleCorrelationsWidget } from "@/components/home/CycleCorrelationsWidget";
import { LabResultsWidget } from "@/components/home/LabResultsWidget";
import { NutritionTodayWidget } from "@/components/home/NutritionTodayWidget";
import { WeightTrendWidget } from "@/components/home/WeightTrendWidget";
import { MiniPhaseArc, getWidgetGraphic } from "@/components/home/WidgetGraphics";
import { DailyBriefingHero } from "@/components/home/DailyBriefingHero";
import { useWidgetPreferences, getWidgetLabel } from "@/hooks/useWidgetPreferences";
import {
  getPostpartumPhase,
  PP_SUCCEED_HER,
  PP_DONTMESS_HER,
  PP_SUCCEED_HIM,
  PP_DONTMESS_HIM,
} from "@/lib/postpartumPhases";
import { format } from "date-fns";
import { useTrackFeature } from "@/hooks/useTrackFeature";
import { X, Pencil, Check, Shield, Users, Sparkles, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// ── Tip data ──────────────────────────────────────────────

const DONT_MESS_UP_HER: Record<string, string[]> = {
  Menstruation: [
    "Don't schedule anything you can cancel tomorrow — you'll want to.",
    "Skip the intense workout. A walk counts. Your body is recovering.",
    "Eat warm, iron-rich food. Now is not the time for a salad cleanse.",
    "If someone irritates you, wait 24 hours before responding.",
    "Go to bed 30 minutes earlier than you think you need to.",
  ],
  Follicular: [
    "Don't waste this energy on busywork — tackle the hard thing first.",
    "Say yes to the social plan. You actually have the bandwidth right now.",
    "Start the project you've been putting off. Motivation is real today.",
    "Eat enough protein — your muscles recover faster this week.",
    "Don't overcommit for next week. Luteal-you will not have this energy.",
  ],
  Ovulation: [
    "Have the hard conversation today — you'll handle it with grace.",
    "Push for the PR or the big presentation. You're at peak performance.",
    "Don't make long-term commitments based on how invincible you feel.",
    "Stay hydrated — the estrogen surge can cause subtle dehydration.",
    "Warm up properly. Ligament injury risk is quietly elevated right now.",
  ],
  Luteal: [
    "Lower the bar on purpose. 'Good enough' is the goal today.",
    "Don't send the emotional text. Write it, sleep on it, revisit tomorrow.",
    "Eat the carbs. Your brain needs serotonin and fighting cravings backfires.",
    "Cancel the optional plans without guilt. Protect your energy.",
    "When you feel like everything is falling apart — it's progesterone, not reality.",
  ],
};

const DONT_MESS_UP_HIM: Record<string, string[]> = {
  Menstruation: [
    "Don't ask 'what's wrong?' — just bring her tea and a blanket.",
    "Take one thing off her plate without being asked. Dishes, kids, dinner — pick one.",
    "She's not being dramatic. Her pain is real and her patience is gone. Don't test it.",
    "Don't suggest she 'just take a painkiller and push through.' Read the room.",
    "If she snaps at you, don't take it personally. She'll feel guilty about it later without your help.",
  ],
  Follicular: [
    "She's got energy again — match it. Plan something fun together.",
    "This is your window to bring up the thing you've been sitting on. She can handle it now.",
    "Don't coast just because she's in a good mood. Show up — she notices.",
    "Support the new idea or project she's excited about. Her confidence is climbing.",
    "If you've been meaning to apologize for something, now's the time. She's receptive.",
  ],
  Ovulation: [
    "She's at her sharpest and most social. Don't be boring — step up.",
    "Plan the date night. She's feeling herself and wants to connect.",
    "If you disagree on something, bring it up now — she'll debate fairly, not emotionally.",
    "Don't be intimidated by her confidence. Hype her up, not down.",
    "Pay attention. She's giving you her best self right now — notice it and say something.",
  ],
  Luteal: [
    "She's not picking fights — her brain is literally wired to notice threats right now.",
    "Don't say 'is it that time of the month?' Ever. Just don't.",
    "Bring her comfort food without commentary. No diet advice. No jokes.",
    "Handle bedtime or the morning routine without being asked. She's running on fumes.",
    "When she says 'I'm fine' — she's not. Sit with her. You don't have to fix it.",
  ],
};

const SUCCEED_HER: Record<string, string[]> = {
  Menstruation: [
    "Journal for 5 minutes. Clarity comes easier when your body is slowing down.",
    "Batch-cook something nourishing — future you should be grateful.",
    "Use this low-energy window to plan your week ahead. Strategy over hustle.",
    "Do one kind thing for yourself that costs nothing. A bath, a nap, silence.",
    "Reflect on last cycle's wins. You accomplished more than you remember.",
  ],
  Follicular: [
    "Brainstorm and start — this is your creative superpower phase.",
    "Book the thing you've been nervous about. Your confidence is rising.",
    "Network or reconnect with someone. You're naturally magnetic right now.",
    "Try a new workout or recipe. Your brain craves novelty this week.",
    "Set one clear goal for this cycle. You have the momentum to hit it.",
  ],
  Ovulation: [
    "Negotiate the raise, pitch the idea, lead the meeting. You're built for this today.",
    "Record a voice memo of your ideas — you may be sharper than you should be next week.",
    "Celebrate a recent win out loud. Own it. You earned it.",
    "Strengthen a relationship — your empathy and communication peak now.",
    "Do the scary thing. Your risk tolerance is at its highest.",
  ],
  Luteal: [
    "Finish and polish — your detail-oriented brain catches what others miss.",
    "Organize your space. Nesting energy is real and productive.",
    "Write the honest feedback, review, or reflection. Your filter is off — use it wisely.",
    "Meal-prep comfort food so you're not relying on willpower later.",
    "Say no to one thing that drains you. Boundaries are a success strategy.",
  ],
};

const SUCCEED_HIM: Record<string, string[]> = {
  Menstruation: [
    "Run a hot bath for her without being asked. Small effort, huge impact.",
    "Pick up dinner so she doesn't have to think about it.",
    "Send her a text that says 'I've got everything handled tonight.'",
    "Watch her favorite show with her — even if it's not your thing.",
    "Ask 'what would make tonight easier?' and actually do it.",
  ],
  Follicular: [
    "Suggest an adventure — hike, day trip, trying a new restaurant. She's game.",
    "Start a project together. Her creative energy is contagious right now.",
    "Compliment something specific she did, not just how she looks.",
    "Be playful. She has the bandwidth for fun and wants you to match it.",
    "Share something you've been thinking about. She's open to deep conversation.",
  ],
  Ovulation: [
    "Tell her she's impressive. She won't fish for it, but she'll light up.",
    "Be her hype man in public — brag about her to friends.",
    "Plan something romantic. She's feeling connected and wants closeness.",
    "Ask her opinion on something you're working on. She'll see angles you miss.",
    "Match her energy. She's operating at 100% — show up fully.",
  ],
  Luteal: [
    "Anticipate what she needs before she has to ask. Proactive > reactive.",
    "Leave a note, a snack, or a playlist somewhere she'll find it.",
    "Validate her feelings even if they seem disproportionate. They're real to her.",
    "Take the kids or the dog out so she gets 30 minutes of silence.",
    "Tell her 'you're doing better than you think.' She needs to hear it.",
  ],
};

// ── Postpartum & Menopause tips ──────────────────────────
// Postpartum tip lists are imported from src/lib/postpartumPhases.ts so all 6 phases
// (acute, early, healing, rebuilding, late, extended) stay consistent across the app.


const MENOPAUSE_SUCCEED_HER: string[] = [
  "Lift heavy 2-3x a week. Strength training is your bone and brain insurance now.",
  "Protect sleep aggressively — cool room, no late alcohol, consistent bedtime.",
  "Eat protein at every meal (30g+) — muscle preservation is your top priority.",
  "Track hot flashes and triggers for one week. Patterns lead to control.",
  "Invest in this chapter — many women describe it as their most powerful, free, and clear.",
];

const MENOPAUSE_DONTMESS_HER: string[] = [
  "Don't push through symptoms alone. HRT and other tools exist — talk to a menopause-trained doctor.",
  "Don't drop protein or strength work. Sarcopenia accelerates fast in this window.",
  "Don't assume brain fog is permanent. Sleep, protein, and movement move the needle.",
  "Don't dismiss anxiety or mood shifts as 'just stress' — estrogen drop is real.",
  "Don't believe the story that this is the end. It's a transition, not a verdict.",
];

const MENOPAUSE_SUCCEED_HIM: string[] = [
  "Adjust the thermostat without comment. Be the climate control, not the critic.",
  "Cheer her strength training — it's not vanity, it's longevity.",
  "Plan low-stress activity together — walks, weekend trips, shared hobbies.",
  "Listen when she names what's hard. You don't need to solve — just witness.",
  "Show up for the new chapter. Many couples report their best years after this transition.",
];

const MENOPAUSE_DONTMESS_HIM: string[] = [
  "Don't joke about hot flashes, mood, or 'the change'. Ever.",
  "Don't take mood shifts personally — declining estrogen rewires the nervous system.",
  "Don't assume intimacy works the same. Ask, adapt, stay close in other ways.",
  "Don't expect her to push through symptoms alone. Encourage real medical support.",
  "Don't write off her ambitions because she's 'in menopause'. She's not done — she's reloading.",
];

// Irregular / hormonal birth control — phase prediction doesn't apply.
const IRREGULAR_SUCCEED_HER: string[] = [
  "Hormonal BC flattens your cycle — your daily levers are sleep, protein, and stress, not phase timing.",
  "Strength train 2-3x a week. Steady hormones still need steady muscle work.",
  "Track sleep quality and mood for two weeks — patterns matter more than calendar days for you.",
  "Hydrate and prioritize iron-rich meals — the pill can deplete B6, B12, magnesium, and zinc.",
  "Notice your own rhythms — energy, focus, libido shifts still exist, they're just not phase-locked.",
];
const IRREGULAR_DONTMESS_HER: string[] = [
  "Don't expect 'phase-based' advice to map cleanly — your hormones are externally set, not cycling.",
  "Don't skip blood work. Hormonal BC can mask underlying issues worth knowing about.",
  "Don't ignore persistent low mood or low libido — they're worth raising with your doctor.",
  "Don't assume you can't get pregnant if you miss doses or change formulations — confirm with your provider.",
  "Don't compare your day to a cycling friend's — your baseline is different, not worse.",
];
const IRREGULAR_SUCCEED_HIM: string[] = [
  "Don't ask 'what phase are you in?' — she's on hormonal BC, the rhythm is steady.",
  "Notice her actual mood and energy day-to-day instead of guessing from a calendar.",
  "Support consistent sleep and meals — those move her needle more than any phase strategy.",
  "If she's exploring coming off BC, ask how you can help — it can take months to recalibrate.",
];
const IRREGULAR_DONTMESS_HIM: string[] = [
  "Don't tell her 'it's just the pill' if she names a real symptom.",
  "Don't make jokes about hormones — her chemistry is being managed, not malfunctioning.",
  "Don't pressure her on contraception choices — it's her body, her call.",
  "Don't assume libido shifts are about you. BC affects desire for many women.",
];




// ── Widget-specific color schemes for visual variety ────
// Each widget category has its own identity, independent of cycle phase

const WIDGET_COLORS: Record<string, {
  border: string;
  bgGradient: string;
  dot: string;
  iconBg: string;
  iconColor: string;
  labelColor: string;
}> = {
  succeed_you: {
    border: "border-l-emerald-500",
    bgGradient: "from-emerald-500/10 via-emerald-500/5 to-transparent",
    dot: "bg-emerald-500",
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-400",
    labelColor: "text-emerald-400/80",
  },
  succeed_him: {
    border: "border-l-sky-500",
    bgGradient: "from-sky-500/10 via-sky-500/5 to-transparent",
    dot: "bg-sky-500",
    iconBg: "bg-sky-500/15",
    iconColor: "text-sky-400",
    labelColor: "text-sky-400/80",
  },
  dontmessup_you: {
    border: "border-l-amber-500",
    bgGradient: "from-amber-500/10 via-amber-500/5 to-transparent",
    dot: "bg-amber-500",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-400",
    labelColor: "text-amber-400/80",
  },
  dontmessup_him: {
    border: "border-l-violet-500",
    bgGradient: "from-violet-500/10 via-violet-500/5 to-transparent",
    dot: "bg-violet-500",
    iconBg: "bg-violet-500/15",
    iconColor: "text-violet-400",
    labelColor: "text-violet-400/80",
  },
  symptom_tracker: {
    border: "border-l-rose-500",
    bgGradient: "from-rose-500/10 via-rose-500/5 to-transparent",
    dot: "bg-rose-500",
    iconBg: "bg-rose-500/15",
    iconColor: "text-rose-400",
    labelColor: "text-rose-400/80",
  },
  hormone_chart: {
    border: "border-l-cyan-500",
    bgGradient: "from-cyan-500/10 via-cyan-500/5 to-transparent",
    dot: "bg-cyan-500",
    iconBg: "bg-cyan-500/15",
    iconColor: "text-cyan-400",
    labelColor: "text-cyan-400/80",
  },
  symptom_map: {
    border: "border-l-fuchsia-500",
    bgGradient: "from-fuchsia-500/10 via-fuchsia-500/5 to-transparent",
    dot: "bg-fuchsia-500",
    iconBg: "bg-fuchsia-500/15",
    iconColor: "text-fuchsia-400",
    labelColor: "text-fuchsia-400/80",
  },
  custom: {
    border: "border-l-primary",
    bgGradient: "from-primary/10 via-primary/5 to-transparent",
    dot: "bg-primary",
    iconBg: "bg-primary/15",
    iconColor: "text-primary",
    labelColor: "text-primary/80",
  },
};

// ── TipCard ───────────────────────────────────────────────

// ── TipCard ───────────────────────────────────────────────

function TipCard({
  label,
  tips,
  widgetId = "custom",
  icon: Icon,
}: {
  label: string;
  tips: string[];
  phase: string;
  widgetId?: string;
  cycleDay: number;
  cycleLengthDays: number;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const phaseTips = tips.length > 0 ? tips : ["No tips available for this phase."];
  const colors = WIDGET_COLORS[widgetId] || WIDGET_COLORS.custom;

  return (
    <div
      className={`w-full rounded-2xl border border-border/40 ${colors.border} border-l-[3px]
        bg-card overflow-hidden relative`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${colors.bgGradient} pointer-events-none`} />

      <div className="relative px-5 py-4">
        <div className="flex items-center gap-2.5 mb-3">
          {Icon && (
            <div className={`w-7 h-7 rounded-lg ${colors.iconBg} flex items-center justify-center`}>
              <Icon className={`w-4 h-4 ${colors.iconColor}`} />
            </div>
          )}
          <span className={`text-[10px] font-semibold uppercase tracking-widest ${colors.labelColor}`}>
            {label}
          </span>
        </div>

        <ul className="space-y-2.5">
          {phaseTips.map((tip, i) => (
            <li key={i} className="flex gap-2.5 items-start">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${colors.dot}`} />
              <span className="text-[14px] text-foreground/85 leading-snug">{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}



// ── Types ─────────────────────────────────────────────────

interface CycleData {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
  lastPeriodStart?: string;
  lifeStage?: "cycling" | "irregular" | "postpartum" | "menopause";
  postpartumStartDate?: string;
  postpartumActive?: boolean;
}

interface HomeTabProps {
  cycleData: CycleData | null;
  anchorSymptom?: string | null;
  onPeriodUpdate?: (date: Date) => void;
  onCycleLengthUpdate?: (days: number) => void;
  userId?: string;
}

// ── HomeTab ───────────────────────────────────────────────

export function HomeTab({ cycleData, anchorSymptom, onPeriodUpdate, onCycleLengthUpdate, userId }: HomeTabProps) {
  useTrackFeature("home_tab");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [editedLength, setEditedLength] = useState<number>(28);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [showSymptomHistory, setShowSymptomHistory] = useState(false);

  const { widgets, loading, save, toggleWidget, renameWidget, setWidgets, addCustomWidget, removeWidget } = useWidgetPreferences(userId);

  if (!cycleData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <LoganLogo size="md" />
        <h2 className="font-display font-semibold text-lg text-foreground mt-4">Welcome to Logan</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs">
          Complete your onboarding in the Ask tab to see your cycle overview here.
        </p>
      </div>
    );
  }

  const visibleWidgets = widgets.filter(w => w.visible);
  const hasPostpartumContext = cycleData.lifeStage === "postpartum" || !!cycleData.postpartumActive;
  const isIrregular = cycleData.lifeStage === "irregular";
  const isNonCycling = cycleData.lifeStage === "postpartum" || cycleData.lifeStage === "menopause" || isIrregular;
  const stagePhase = isNonCycling
    ? (cycleData.lifeStage === "postpartum"
        ? "Postpartum"
        : cycleData.lifeStage === "menopause"
          ? "Menopause"
          : "Steady")
    : cycleData.phase;

  // Helper to get life-stage-aware tips
  const ppPhase = getPostpartumPhase(cycleData.postpartumStartDate);
  const getTipsHer = (widgetId: string): string[] => {
    const isSucceed = widgetId.startsWith("succeed");
    if (hasPostpartumContext) {
      return isSucceed ? PP_SUCCEED_HER[ppPhase] : PP_DONTMESS_HER[ppPhase];
    }
    if (cycleData.lifeStage === "menopause") {
      return isSucceed ? MENOPAUSE_SUCCEED_HER : MENOPAUSE_DONTMESS_HER;
    }
    if (isIrregular) {
      return isSucceed ? IRREGULAR_SUCCEED_HER : IRREGULAR_DONTMESS_HER;
    }
    return isSucceed ? (SUCCEED_HER[cycleData.phase] || []) : (DONT_MESS_UP_HER[cycleData.phase] || []);
  };
  const getTipsHim = (widgetId: string): string[] => {
    const isSucceed = widgetId.startsWith("succeed");
    if (hasPostpartumContext) {
      return isSucceed ? PP_SUCCEED_HIM[ppPhase] : PP_DONTMESS_HIM[ppPhase];
    }
    if (cycleData.lifeStage === "menopause") {
      return isSucceed ? MENOPAUSE_SUCCEED_HIM : MENOPAUSE_DONTMESS_HIM;
    }
    if (isIrregular) {
      return isSucceed ? IRREGULAR_SUCCEED_HIM : IRREGULAR_DONTMESS_HIM;
    }
    return isSucceed ? (SUCCEED_HIM[cycleData.phase] || []) : (DONT_MESS_UP_HIM[cycleData.phase] || []);
  };


  const renderWidget = (widget: typeof widgets[number]) => {
    const id = widget.id;
    const label = getWidgetLabel(widget);
    switch (id) {
      case "cycle_circle": {
        return (
          <div className="w-full flex flex-col items-center" key={id}>
            <DailyBriefingHero
              cycleDay={cycleData.cycleDay}
              phase={stagePhase}
              cycleLengthDays={cycleData.cycleLengthDays}
              lifeStage={cycleData.lifeStage}
              postpartumStartDate={cycleData.postpartumStartDate}
              postpartumActive={cycleData.postpartumActive}
              onCircleClick={isNonCycling ? undefined : () => setShowAnalytics(true)}
            />
            {!isNonCycling && !dismissed && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground/70">
                <span>Not accurate?</span>
                <button
                  onClick={() => {
                    setEditedLength(cycleData.cycleLengthDays);
                    setShowDatePicker(true);
                  }}
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  Update period date
                </button>
                <button onClick={() => setDismissed(true)} className="ml-1 hover:text-foreground transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        );
      }
      case "symptom_tracker": {
        const colors = WIDGET_COLORS.symptom_tracker;
        return userId ? (
          <div className="w-full flex flex-col gap-2" key={id}>
            <div
              className={`w-full rounded-2xl border border-border/40 ${colors.border} border-l-[3px] bg-card overflow-hidden relative`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${colors.bgGradient} pointer-events-none`} />
              <div className="relative">
                <SymptomLogWidget
                  userId={userId}
                  cycleDay={isNonCycling ? undefined : cycleData.cycleDay}
                  phase={isNonCycling ? stagePhase : cycleData.phase}
                  lastPeriodStart={cycleData.lastPeriodStart}
                  cycleLengthDays={cycleData.cycleLengthDays}
                  isNonCycling={!!isNonCycling}
                />
              </div>
            </div>
            <button
              onClick={() => setShowSymptomHistory(true)}
              className="text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors underline underline-offset-2 self-center"
            >
              View symptom history & patterns
            </button>
          </div>
        ) : null;
      }
      case "lab_results":
        return userId ? (
          <div className="w-full" key={id}>
            <LabResultsWidget userId={userId} />
          </div>
        ) : null;
      case "nutrition_today":
        return userId ? (
          <div className="w-full" key={id}>
            <NutritionTodayWidget userId={userId} />
          </div>
        ) : null;
      case "weight_trend":
        return userId ? (
          <div className="w-full" key={id}>
            <WeightTrendWidget userId={userId} />
          </div>
        ) : null;
      case "cycle_correlations":
        return userId ? (
          <div className="w-full" key={id}>
            <CycleCorrelationsWidget
              userId={userId}
              cyclePhase={cycleData.phase}
              cycleDay={cycleData.cycleDay}
              lastPeriodStart={cycleData.lastPeriodStart}
              cycleLengthDays={cycleData.cycleLengthDays}
              isNonCycling={!!isNonCycling}
            />
          </div>
        ) : null;
      case "succeed_you":
        return (
          <div className="w-full" key={id}>
            <TipCard label={label} tips={getTipsHer("succeed")} phase={stagePhase} widgetId="succeed_you" cycleDay={cycleData.cycleDay} cycleLengthDays={cycleData.cycleLengthDays} icon={Sparkles} />
          </div>
        );
      case "succeed_him":
        return (
          <div className="w-full" key={id}>
            <TipCard label={label} tips={getTipsHim("succeed")} phase={stagePhase} widgetId="succeed_him" cycleDay={cycleData.cycleDay} cycleLengthDays={cycleData.cycleLengthDays} icon={Heart} />
          </div>
        );
      case "dontmessup_you":
        return (
          <div className="w-full" key={id}>
            <TipCard label={label} tips={getTipsHer("dontmessup")} phase={stagePhase} widgetId="dontmessup_you" cycleDay={cycleData.cycleDay} cycleLengthDays={cycleData.cycleLengthDays} icon={Shield} />
          </div>
        );
      case "dontmessup_him":
        return (
          <div className="w-full" key={id}>
            <TipCard label={label} tips={getTipsHim("dontmessup")} phase={stagePhase} widgetId="dontmessup_him" cycleDay={cycleData.cycleDay} cycleLengthDays={cycleData.cycleLengthDays} icon={Users} />
          </div>
        );
      case "hormone_chart":
        if (isNonCycling) return null;
        return (
          <div className="w-full" key={id}>
            <HormoneChart
              cycleDay={cycleData.cycleDay}
              phase={cycleData.phase}
              cycleLengthDays={cycleData.cycleLengthDays}
            />
          </div>
        );
      case "symptom_map":
        if (isNonCycling) return null;
        return (
          <div className="w-full" key={id}>
            <SymptomMap
              anchorSymptom={anchorSymptom || undefined}
              cycleDay={cycleData.cycleDay}
              cycleLengthDays={cycleData.cycleLengthDays}
              phase={cycleData.phase}
            />
          </div>
        );
      default:
        if (widget.type === "custom" && widget.prompt) {
          return (
            <div className="w-full" key={id}>
              <CustomAIWidget
                title={label}
                prompt={widget.prompt}
                phase={stagePhase}
                cycleDay={isNonCycling ? 0 : cycleData.cycleDay}
                cycleLengthDays={cycleData.cycleLengthDays}
                targetUserId={userId}
                lifeStage={cycleData.lifeStage}
                postpartumStartDate={cycleData.postpartumStartDate}
                postpartumActive={cycleData.postpartumActive}
              />
            </div>
          );
        }
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center pb-16">
      {/* Edit mode toggle */}
      <div className="w-full max-w-xs flex justify-end px-2 pt-2 mb-2">
        <Button
          variant={editMode ? "default" : "ghost"}
          size="sm"
          className="gap-1.5 text-xs h-8"
          onClick={async () => {
            if (editMode) {
              await save(widgets);
            }
            setEditMode(!editMode);
          }}
        >
          {editMode ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Done
            </>
          ) : (
            <>
              <Pencil className="w-3.5 h-3.5" />
              Customize
            </>
          )}
        </Button>
      </div>

      {editMode ? (
        <WidgetEditMode
          widgets={widgets}
          onToggle={toggleWidget}
          onRename={renameWidget}
          onReorder={setWidgets}
          onRemove={removeWidget}
          onAddCustom={() => setShowAddWidget(true)}
        />
      ) : (
        <div className="flex flex-col items-center gap-7 px-4 sm:px-6 lg:px-8 w-full pt-1">
          <div className="w-full max-w-3xl xl:max-w-5xl 2xl:max-w-6xl">
            <div className="flex flex-col gap-5">
              {visibleWidgets.map(w => (
                <div className="w-full" key={w.id}>
                  {renderWidget(w)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Date picker dialog */}
      <Dialog open={showDatePicker} onOpenChange={setShowDatePicker}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>When did your last period start?</DialogTitle>
            <DialogDescription>
              Pick the first day of your most recent period so we can recalculate your cycle.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={(d) => d > new Date()}
              className="p-3 pointer-events-auto"
            />
          </div>
          <div className="flex items-center justify-between gap-3 px-1">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Cycle length</span>
            <div className="flex items-center gap-2 flex-1 max-w-[180px]">
              <Slider
                min={18}
                max={45}
                step={1}
                value={[editedLength]}
                onValueChange={([v]) => setEditedLength(v)}
                className="flex-1"
              />
              <span className="text-xs font-medium text-muted-foreground w-12 text-right">{editedLength} days</span>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowDatePicker(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                setIsSubmitting(true);
                try {
                  if (selectedDate && onPeriodUpdate) await onPeriodUpdate(selectedDate);
                  if (editedLength !== cycleData.cycleLengthDays && onCycleLengthUpdate) await onCycleLengthUpdate(editedLength);
                  setShowDatePicker(false);
                  setSelectedDate(undefined);
                } finally {
                  setIsSubmitting(false);
                }
              }}
              disabled={(!selectedDate && editedLength === cycleData.cycleLengthDays) || isSubmitting}
            >
              {isSubmitting ? "Updating…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cycle Analytics */}
      {userId && (
        <CycleAnalytics
          open={showAnalytics}
          onOpenChange={setShowAnalytics}
          userId={userId}
          currentCycleLength={cycleData.cycleLengthDays}
          currentPhase={cycleData.phase}
          currentCycleDay={cycleData.cycleDay}
        />
      )}

      {/* Add Custom Widget Dialog */}
      <AddCustomWidgetDialog
        open={showAddWidget}
        onOpenChange={setShowAddWidget}
        onAdd={(title, prompt) => {
          addCustomWidget(title, prompt);
        }}
      />

      {/* Symptom History */}
      {userId && (
        <SymptomHistory
          open={showSymptomHistory}
          onOpenChange={setShowSymptomHistory}
          userId={userId}
          lastPeriodStart={cycleData.lastPeriodStart}
          cycleLengthDays={cycleData.cycleLengthDays}
          isNonCycling={!!isNonCycling}
        />
      )}
    </div>
  );
}
