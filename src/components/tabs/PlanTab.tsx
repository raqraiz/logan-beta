import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dumbbell, Brain, Heart, Utensils, TrendingUp, Loader2,
  AlertTriangle, Zap, ChevronRight, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addDays } from "date-fns";
import { CycleForecast } from "@/components/chat/CycleForecast";

interface CycleData {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
  lastPeriodStart?: string;
}

interface PlanTabProps {
  userId: string;
  cycleData: CycleData | null;
}

interface CheckinEntry {
  dimension: string;
  response: string;
  phase: string;
  cycle_day: number;
  created_at: string;
}

// ── Phase calculation (mirrors server logic) ──
function getPhaseForDay(day: number, cycleLength: number): string {
  const menEnd = 5;
  const ovDay = cycleLength - 14;
  const ovStart = ovDay - 1;
  const ovEnd = ovDay + 2;
  if (day <= menEnd) return "Menstruation";
  if (day < ovStart) return "Follicular";
  if (day <= ovEnd) return "Ovulation";
  return "Luteal";
}

function getDayMetrics(day: number, cycleLength: number) {
  const ovDay = cycleLength - 14;
  let energy = 0.5;
  if (day <= 2) energy = 0.2;
  else if (day <= 5) energy = 0.3 + (day - 2) * 0.05;
  else if (day < ovDay - 1) energy = 0.5 + (day - 5) / (ovDay - 6) * 0.4;
  else if (day <= ovDay + 2) energy = 0.9;
  else energy = Math.max(0.3, 0.85 - (day - ovDay - 2) / (cycleLength - ovDay - 2) * 0.55);

  let mood = 0.5;
  if (day <= 2) mood = 0.3;
  else if (day <= 5) mood = 0.4;
  else if (day < ovDay - 1) mood = 0.5 + (day - 5) / (ovDay - 6) * 0.4;
  else if (day <= ovDay + 2) mood = 0.85;
  else {
    const daysIntoLuteal = day - (ovDay + 2);
    const lutealLength = cycleLength - (ovDay + 2);
    mood = Math.max(0.2, 0.8 - (daysIntoLuteal / lutealLength) * 0.6);
  }

  return {
    energy: Math.min(1, Math.max(0, energy)),
    mood: Math.min(1, Math.max(0, mood)),
  };
}

// ── Phase colors ──
const PHASE_COLOR: Record<string, string> = {
  Menstruation: "text-phase-menstruation",
  Follicular: "text-phase-follicular",
  Ovulation: "text-phase-ovulation",
  Luteal: "text-phase-luteal",
};
const PHASE_BG_FAINT: Record<string, string> = {
  Menstruation: "bg-phase-menstruation/15",
  Follicular: "bg-phase-follicular/15",
  Ovulation: "bg-phase-ovulation/15",
  Luteal: "bg-phase-luteal/15",
};

// ── Workout guidance by phase ──
const WORKOUT_GUIDANCE: Record<string, { intensity: string; suggestion: string; examples: string[] }> = {
  Menstruation: {
    intensity: "Low",
    suggestion: "Honor your body. Light movement helps cramps; skip anything that drains you.",
    examples: ["Gentle yoga", "20-min walk", "Stretching / foam roll"],
  },
  Follicular: {
    intensity: "Moderate → High",
    suggestion: "Energy is climbing — ramp up gradually. Try new things, challenge yourself.",
    examples: ["Strength training", "Dance / spin class", "Longer runs"],
  },
  Ovulation: {
    intensity: "Peak",
    suggestion: "Your strongest window. Go for PRs, compete, push your limits.",
    examples: ["HIIT / CrossFit", "Heavy lifts", "Competitive sports"],
  },
  Luteal: {
    intensity: "High → Low",
    suggestion: "Front-load intensity early. As energy drops, shift to recovery.",
    examples: ["Moderate strength (early)", "Swimming / Pilates (mid)", "Walks / rest (late)"],
  },
};

// ── Nutrition guidance by phase ──
const NUTRITION_GUIDANCE: Record<string, { focus: string; foods: string[]; avoid: string }> = {
  Menstruation: {
    focus: "Replenish iron & reduce inflammation",
    foods: ["Red meat / lentils + Vitamin C", "Warm soups & stews", "Dark chocolate (magnesium)"],
    avoid: "Excess caffeine & processed sugar — they worsen cramps",
  },
  Follicular: {
    focus: "Support estrogen metabolism",
    foods: ["Cruciferous veggies (broccoli, kale)", "Fermented foods (kimchi, yogurt)", "Lean protein & seeds"],
    avoid: "Skipping meals — your metabolism needs consistent fuel",
  },
  Ovulation: {
    focus: "Clear excess estrogen, stay hydrated",
    foods: ["Fiber-rich veggies & whole grains", "Berries & antioxidant-rich fruit", "Light, fresh meals"],
    avoid: "Heavy, greasy food — it can amplify bloating",
  },
  Luteal: {
    focus: "Boost serotonin & manage cravings",
    foods: ["Complex carbs (sweet potato, oats)", "Magnesium-rich foods (nuts, seeds)", "Dark leafy greens"],
    avoid: "Ignoring cravings completely — lean into them smartly",
  },
};

// ── Mood guidance by phase ──
const MOOD_GUIDANCE: Record<string, { outlook: string; headsUp: string; selfCare: string }> = {
  Menstruation: {
    outlook: "Introspective & lower patience",
    headsUp: "You may feel more irritable or tearful — this is hormonal, not personal.",
    selfCare: "Protect your calendar. Say no. Ask for help with kids, chores, decisions.",
  },
  Follicular: {
    outlook: "Rising optimism & confidence",
    headsUp: "Great mood window. You'll feel more patient, creative, and resilient.",
    selfCare: "Channel this energy into things that matter — relationships, projects, connection.",
  },
  Ovulation: {
    outlook: "Peak social & verbal confidence",
    headsUp: "You'll feel like your best self. Enjoy it — but don't overcommit.",
    selfCare: "Have the hard conversation. Present the idea. Be visible.",
  },
  Luteal: {
    outlook: "Declining patience & rising sensitivity",
    headsUp: "The days before your period are when you're most likely to snap. It's not a character flaw.",
    selfCare: "Give yourself grace. Tell your partner. Reduce obligations. Prioritize sleep.",
  },
};

interface DayForecast {
  date: Date;
  cycleDay: number;
  phase: string;
  energy: number;
  mood: number;
  isToday: boolean;
}

const DIMENSION_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  energy: { icon: TrendingUp, label: "Energy", color: "text-phase-follicular" },
  focus: { icon: Brain, label: "Focus", color: "text-phase-ovulation" },
  emotions: { icon: Heart, label: "Emotions", color: "text-phase-menstruation" },
  nutrition: { icon: Utensils, label: "Nutrition", color: "text-phase-luteal" },
};

// Anchor symptom insight per phase
const ANCHOR_INSIGHTS: Record<string, Record<string, string>> = {
  Menstruation: {
    Bloating: "Bloating tends to ease as your period progresses — stay hydrated and reduce sodium.",
    Cramps: "Cramps are typically strongest now. Gentle heat and magnesium can help.",
    Fatigue: "Your energy is at its lowest — honor rest and skip intense workouts.",
    Headaches: "Hormonal headaches may peak. Stay hydrated and consider magnesium.",
    "Mood swings": "Emotions may still feel raw. Give yourself permission to slow down.",
    Acne: "Breakouts from last phase may linger. Gentle skincare — don't over-treat.",
    Cravings: "Cravings may ease as hormones stabilize. Warm, nourishing foods help.",
    "Brain fog": "Mental clarity is low — keep tasks simple and avoid big decisions.",
    Anxiety: "Anxiety often softens during your period as progesterone drops fully.",
    Insomnia: "Sleep may actually improve now. Lean into earlier bedtimes.",
  },
  Follicular: {
    Bloating: "Bloating should be minimal — your body is in its lightest phase.",
    Cramps: "Cramps are behind you. Energy is building — enjoy the relief.",
    Fatigue: "Energy is climbing steadily. This is your window to tackle big tasks.",
    Headaches: "Headaches are less likely now as estrogen rises smoothly.",
    "Mood swings": "Mood is stabilizing and optimism is building. Ride this wave.",
    Acne: "Skin is clearing up as estrogen rises. Great time for active skincare.",
    Cravings: "Cravings are typically low. Your appetite is balanced and manageable.",
    "Brain fog": "Mental sharpness is returning — schedule your most demanding work here.",
    Anxiety: "Anxiety tends to be low. Use this calm window for planning ahead.",
    Insomnia: "Sleep quality is generally good. Maintain your routine.",
  },
  Ovulation: {
    Bloating: "Some mid-cycle bloating is normal from the hormonal surge.",
    Cramps: "Mild ovulation cramps (mittelschmerz) are normal and brief.",
    Fatigue: "You're at peak energy — make the most of it before the shift.",
    Headaches: "The estrogen peak can trigger headaches in some. Stay hydrated.",
    "Mood swings": "You're feeling your best socially. Have important conversations now.",
    Acne: "Skin is at its best. Testosterone peaks may cause minor oiliness.",
    Cravings: "Appetite is moderate. You may not feel as hungry — that's normal.",
    "Brain fog": "Peak mental clarity. Your brain is firing on all cylinders.",
    Anxiety: "Confidence is high but the post-ovulation drop can feel sudden.",
    Insomnia: "Sleep may feel lighter around ovulation — it's a temporary hormonal effect.",
  },
  Luteal: {
    Bloating: "Bloating is likely building as progesterone rises. Reduce salt and stay active.",
    Cramps: "Pre-menstrual cramping may start. Magnesium and gentle movement help.",
    Fatigue: "Energy is declining — front-load demanding tasks early in this phase.",
    Headaches: "Headache risk increases as estrogen drops. Track triggers like caffeine.",
    "Mood swings": "Patience thins as progesterone peaks then drops. Warn your inner circle.",
    Acne: "Hormonal breakouts are most likely now. Stick to your routine, don't panic-treat.",
    Cravings: "Cravings are peaking — lean into complex carbs and dark chocolate.",
    "Brain fog": "Focus may feel scattered. Break tasks into smaller chunks.",
    Anxiety: "Anxiety tends to spike in the late luteal phase. Breathwork and boundaries help.",
    Insomnia: "Sleep disruption is common. Avoid screens late and try magnesium before bed.",
  },
};

export function PlanTab({ userId, cycleData }: PlanTabProps) {
  const [checkins, setCheckins] = useState<CheckinEntry[]>([]);
  const [anchorSymptom, setAnchorSymptom] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const [checkinsRes, participantRes] = await Promise.all([
        supabase
          .from("chat_messages")
          .select("metadata, created_at")
          .eq("user_id", userId)
          .eq("message_type", "checkin")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("participants")
          .select("anchor_symptom")
          .eq("email", (await supabase.auth.getUser()).data.user?.email || "")
          .maybeSingle(),
      ]);

      if (!checkinsRes.error && checkinsRes.data) {
        const entries: CheckinEntry[] = checkinsRes.data
          .filter((d) => d.metadata && typeof d.metadata === "object")
          .map((d) => {
            const m = d.metadata as Record<string, any>;
            return {
              dimension: m.dimension || "",
              response: m.response || "",
              phase: m.phase || "",
              cycle_day: m.cycle_day || 0,
              created_at: d.created_at,
            };
          });
        setCheckins(entries);
      }

      if (!participantRes.error && participantRes.data) {
        setAnchorSymptom(participantRes.data.anchor_symptom);
      }

      setLoading(false);
    };
    fetchData();
  }, [userId]);

  const currentPhase = cycleData?.phase || "Follicular";
  const currentDay = cycleData?.cycleDay || 1;
  const cycleLength = cycleData?.cycleLengthDays || 28;

  // Build 7-day forecast (kept for alerts calculation)
  const forecast: DayForecast[] = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const day = ((currentDay - 1 + i) % cycleLength) + 1;
      const phase = getPhaseForDay(day, cycleLength);
      const metrics = getDayMetrics(day, cycleLength);
      return {
        date: addDays(today, i),
        cycleDay: day,
        phase,
        energy: metrics.energy,
        mood: metrics.mood,
        isToday: i === 0,
      };
    });
  }, [currentDay, cycleLength]);

  // Detect upcoming "heads-up" alerts (no phase transition alert)
  const alerts = useMemo(() => {
    const items: { day: string; message: string; type: "warning" | "boost" }[] = [];
    for (const f of forecast) {
      if (f.isToday) continue;
      if (f.mood < 0.35) {
        items.push({
          day: format(f.date, "EEE"),
          message: `Day ${f.cycleDay} — patience may be lower. Plan lighter and ask for help.`,
          type: "warning",
        });
        break;
      }
      if (f.energy > 0.8 && forecast[0].energy < 0.6) {
        items.push({
          day: format(f.date, "EEE"),
          message: `Day ${f.cycleDay} — energy surge coming. Schedule your hardest workout here.`,
          type: "boost",
        });
        break;
      }
    }
    return items;
  }, [forecast]);

  // Latest check-ins per dimension
  const latestByDimension: Record<string, CheckinEntry> = {};
  for (const c of checkins) {
    if (!latestByDimension[c.dimension]) latestByDimension[c.dimension] = c;
  }

  const workout = WORKOUT_GUIDANCE[currentPhase] || WORKOUT_GUIDANCE.Follicular;
  const nutrition = NUTRITION_GUIDANCE[currentPhase] || NUTRITION_GUIDANCE.Follicular;
  const moodGuide = MOOD_GUIDANCE[currentPhase] || MOOD_GUIDANCE.Follicular;

  // Phase countdown calculation — use same boundary math as CycleForecast
  const daysUntilNext = useMemo(() => {
    const menEnd = 5;
    const ovDay = cycleLength - 14;
    const ovStart = ovDay - 1;
    const ovEnd = ovDay + 2;
    let nextPhaseStartDay: number;
    if (currentPhase === "Menstruation") nextPhaseStartDay = menEnd + 1;
    else if (currentPhase === "Follicular") nextPhaseStartDay = ovStart;
    else if (currentPhase === "Ovulation") nextPhaseStartDay = ovEnd + 1;
    else nextPhaseStartDay = cycleLength + 1;
    return Math.max(1, nextPhaseStartDay - currentDay);
  }, [currentPhase, currentDay, cycleLength]);

  const PHASE_ORDER = ["Menstruation", "Follicular", "Ovulation", "Luteal"];
  const nextPhase = PHASE_ORDER[(PHASE_ORDER.indexOf(currentPhase) + 1) % 4];
  const anchorInsight = anchorSymptom && ANCHOR_INSIGHTS[currentPhase]?.[anchorSymptom];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const toggle = (section: string) =>
    setExpandedSection((prev) => (prev === section ? null : section));

  return (
    <div className="flex-1 overflow-y-auto pb-20">
      <div className="max-w-lg md:max-w-4xl mx-auto px-4 py-5 space-y-4">

        {/* ── Header ── */}
        <div>
          <h2 className="font-display font-semibold text-lg text-foreground">Your Week</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            <span className={cn("font-medium", PHASE_COLOR[currentPhase])}>{currentPhase}</span>
            {cycleData && <> · Day {currentDay} of {cycleLength}</>}
          </p>
        </div>

        {/* ── Heads-up alerts ── */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl px-3.5 py-3 border",
                  alert.type === "warning"
                    ? "border-phase-menstruation/20 bg-phase-menstruation/5"
                    : "border-phase-follicular/20 bg-phase-follicular/5"
                )}
              >
                {alert.type === "warning" ? (
                  <AlertTriangle className="w-4 h-4 text-phase-menstruation shrink-0 mt-0.5" />
                ) : (
                  <Zap className="w-4 h-4 text-phase-follicular shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-foreground">{alert.day}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Guidance cards grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* ── Mood card ── */}
          <button
            onClick={() => toggle("mood")}
            className="w-full rounded-xl border border-border/30 bg-card/50 overflow-hidden text-left transition-colors hover:bg-card/70"
          >
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", PHASE_BG_FAINT[currentPhase])}>
                <Heart className={cn("w-5 h-5", PHASE_COLOR[currentPhase])} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Mood & Patience</p>
                <p className="text-xs text-muted-foreground truncate">{moodGuide.outlook}</p>
              </div>
              <ChevronRight className={cn(
                "w-4 h-4 text-muted-foreground transition-transform",
                expandedSection === "mood" && "rotate-90"
              )} />
            </div>
            {expandedSection === "mood" && (
              <div className="px-4 pb-4 space-y-3 border-t border-border/15 pt-3" onClick={(e) => e.stopPropagation()}>
                <div className="rounded-lg bg-phase-menstruation/5 border border-phase-menstruation/15 px-3 py-2.5">
                  <p className="text-xs font-medium text-phase-menstruation mb-1">⚡ Heads up</p>
                  <p className="text-xs text-muted-foreground">{moodGuide.headsUp}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">What to do</p>
                  <p className="text-xs text-muted-foreground">{moodGuide.selfCare}</p>
                </div>
              </div>
            )}
          </button>

          {/* ── Exercise card ── */}
          <button
            onClick={() => toggle("exercise")}
            className="w-full rounded-xl border border-border/30 bg-card/50 overflow-hidden text-left transition-colors hover:bg-card/70"
          >
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Dumbbell className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Workout</p>
                <p className="text-xs text-muted-foreground truncate">Intensity: {workout.intensity}</p>
              </div>
              <ChevronRight className={cn(
                "w-4 h-4 text-muted-foreground transition-transform",
                expandedSection === "exercise" && "rotate-90"
              )} />
            </div>
            {expandedSection === "exercise" && (
              <div className="px-4 pb-4 space-y-3 border-t border-border/15 pt-3" onClick={(e) => e.stopPropagation()}>
                <p className="text-xs text-muted-foreground">{workout.suggestion}</p>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Try this week</p>
                  <div className="flex flex-wrap gap-1.5">
                    {workout.examples.map((ex) => (
                      <span key={ex} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/15">
                        {ex}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </button>

          {/* ── Nutrition card ── */}
          <button
            onClick={() => toggle("nutrition")}
            className="w-full rounded-xl border border-border/30 bg-card/50 overflow-hidden text-left transition-colors hover:bg-card/70"
          >
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-9 h-9 rounded-lg bg-phase-luteal/10 flex items-center justify-center">
                <Utensils className="w-5 h-5 text-phase-luteal" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Nutrition</p>
                <p className="text-xs text-muted-foreground truncate">{nutrition.focus}</p>
              </div>
              <ChevronRight className={cn(
                "w-4 h-4 text-muted-foreground transition-transform",
                expandedSection === "nutrition" && "rotate-90"
              )} />
            </div>
            {expandedSection === "nutrition" && (
              <div className="px-4 pb-4 space-y-3 border-t border-border/15 pt-3" onClick={(e) => e.stopPropagation()}>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Prioritize</p>
                  <ul className="space-y-1">
                    {nutrition.foods.map((food) => (
                      <li key={food} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-phase-luteal shrink-0" />
                        {food}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg bg-phase-luteal/5 border border-phase-luteal/15 px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-phase-luteal">Note:</span> {nutrition.avoid}
                  </p>
                </div>
              </div>
            )}
          </button>
        </div>

        {/* ── Phase countdown + anchor insight ── */}
        <div className={cn(
          "rounded-xl border overflow-hidden max-w-lg",
          PHASE_BG_FAINT[currentPhase]
        )} style={{ borderColor: `hsl(var(--phase-${currentPhase.toLowerCase()}) / 0.2)` }}>
          <div className="flex items-center gap-3 px-4 py-3">
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", PHASE_BG_FAINT[nextPhase])}>
              <Clock className={cn("w-5 h-5", PHASE_COLOR[nextPhase])} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                {daysUntilNext} day{daysUntilNext !== 1 ? "s" : ""} until {nextPhase}
              </p>
              <p className="text-xs text-muted-foreground">
                Currently in {currentPhase} · Day {currentDay}
              </p>
            </div>
          </div>
          {anchorInsight && (
            <div className="px-4 pb-3 border-t border-border/15 pt-2.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                {anchorSymptom} outlook
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">{anchorInsight}</p>
            </div>
          )}
        </div>

        {/* ── Cycle Forecast ── */}
        {cycleData?.lastPeriodStart && (
          <CycleForecast
            cycleDay={currentDay}
            phase={currentPhase}
            cycleLengthDays={cycleLength}
            lastPeriodStart={cycleData.lastPeriodStart}
            anchorSymptom={anchorSymptom}
            onClose={() => {}}
            embedded
          />
        )}

        {/* ── Recent check-ins ── */}
        {Object.keys(latestByDimension).length > 0 && (
          <div className="rounded-xl border border-border/30 bg-card/50 overflow-hidden max-w-lg">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/20">
              <Brain className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground">Your Check-ins</span>
            </div>
            <div className="divide-y divide-border/10">
              {Object.entries(latestByDimension).map(([dim, entry]) => {
                const config = DIMENSION_CONFIG[dim];
                if (!config) return null;
                const Icon = config.icon;
                return (
                  <div key={dim} className="flex items-center gap-3 px-4 py-2.5">
                    <Icon className={cn("w-3.5 h-3.5", config.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">{config.label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{entry.response}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground/50 shrink-0">Day {entry.cycle_day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
