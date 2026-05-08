import { useState, useEffect, useMemo } from "react";
import { useTrackFeature } from "@/hooks/useTrackFeature";
import { supabase } from "@/integrations/supabase/client";
import {
  Dumbbell, Brain, Heart, Utensils, TrendingUp, Loader2,
  AlertTriangle, Zap, ChevronRight, Clock, ShieldAlert, Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addDays } from "date-fns";
import { CycleForecast } from "@/components/chat/CycleForecast";
import { calculateCycleInfo } from "@/components/chat/ChatCycleCircle";
import { NutritionMenuActions } from "@/components/chat/NutritionMenuActions";

interface CycleData {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
  lastPeriodStart?: string;
  lifeStage?: "cycling" | "irregular" | "postpartum" | "menopause";
  postpartumStartDate?: string;
}

interface PlanTabProps {
  userId: string;
  cycleData: CycleData | null;
  onPeriodUpdate?: (date: Date) => Promise<void> | void;
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
const WORKOUT_GUIDANCE: Record<string, {
  intensity: string;
  loadCapacity: number; // 0-100 scale
  readiness: string;
  suggestion: string;
  examples: string[];
  riskFlag?: string;
  trainingNote: string;
  athleticDecision: string;
}> = {
  Menstruation: {
    intensity: "Low — Recovery",
    loadCapacity: 25,
    readiness: "Low — protect & recover",
    suggestion: "Your body is recovering. Light movement helps cramps and mood, but this is not the time to load heavy or chase PRs.",
    examples: ["Gentle yoga", "20-min walk", "Stretching / foam roll"],
    riskFlag: "Injury risk is higher — joints are looser due to hormonal shifts. Avoid max lifts and explosive movements.",
    trainingNote: "Deload or active recovery. Keep volume low. This rest sets up your next training block.",
    athleticDecision: "Skip intensity. Any strength work should be at 50-60% of max. Focus on mobility and tissue quality.",
  },
  Follicular: {
    intensity: "Moderate → High — Build Phase",
    loadCapacity: 70,
    readiness: "Rising — build & progress",
    suggestion: "Energy and strength are climbing. Your body responds well to progressive overload right now — ramp up gradually.",
    examples: ["Strength training", "Tempo runs", "Skill work / new movements"],
    trainingNote: "Best window to increase volume and intensity. Your muscles recover faster and adapt better during this phase.",
    athleticDecision: "Add volume. Your body clears fatigue faster now. Good time to introduce new loads or movement patterns.",
  },
  Ovulation: {
    intensity: "Peak — Performance Window",
    loadCapacity: 95,
    readiness: "Peak — test & compete",
    suggestion: "You're at your strongest and most explosive. Go for PRs, test maxes, compete. This is your green light.",
    examples: ["HIIT / CrossFit", "Heavy lifts / PRs", "Race day / competition"],
    riskFlag: "ACL & ligament injury risk peaks around ovulation due to estrogen surge. Warm up thoroughly and focus on knee/ankle stability.",
    trainingNote: "Peak power output. Schedule your hardest sessions and competitions here. You can handle more than usual.",
    athleticDecision: "Schedule maximal efforts, speed work, and competitions here. Power output and reaction time are at their best.",
  },
  Luteal: {
    intensity: "High → Low — Taper & Protect",
    loadCapacity: 50,
    readiness: "Declining — maintain & deload",
    suggestion: "Front-load harder sessions in early luteal. As energy drops, shift to maintenance and recovery — don't fight it.",
    examples: ["Moderate strength (early)", "Swimming / steady-state (mid)", "Walks / mobility (late)"],
    riskFlag: "Perceived effort increases — you're not weaker, it just feels harder. Core temp is elevated. Hydrate extra.",
    trainingNote: "Reduce volume in the back half. Your body is retaining more water and core temp is higher — don't panic about feeling 'off.'",
    athleticDecision: "Maintain intensity early, then taper. Shift to steady-state cardio and lower rep ranges. Don't chase numbers — protect gains.",
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

// ── "How not to mess up today" tips by phase ──
const DONT_MESS_UP: Record<string, string[]> = {
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

// ── Partner/parent "How not to mess up today" tips ──
const DONT_MESS_UP_PARTNER: Record<string, string[]> = {
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

// ── Mood guidance by phase ──
const MOOD_GUIDANCE: Record<string, { outlook: string; headsUp: string; selfCare: string; relationships: { people: string; withPartner: string; withKids: string; strategy: string } }> = {
  Menstruation: {
    outlook: "Recharging — be gentle with yourself",
    headsUp: "Energy is low and everything takes more effort right now. That's not a failure — it's biology. The hump passes in a few days.",
    selfCare: "You're doing your best even when it doesn't feel like it. Do less on purpose. Rest isn't lazy — it's how you come back stronger.",
    relationships: {
      people: "You may feel off — shorter fuse, less patience, then guilt about it. Name it early: 'I'm running on empty right now.' One sentence changes everything.",
      withPartner: "Let them know you're in your lowest window. It's not about them — one heads-up prevents a spiral.",
      withKids: "Your fuse is shortest right now. Keep things simple. You don't have to be perfect today — just present.",
      strategy: "Remind yourself: this is temporary. In a few days you should feel like a completely different person — because you might be.",
    },
  },
  Follicular: {
    outlook: "Powerful, sharp & rising",
    headsUp: "The fog is lifting. You're starting to feel like yourself again — productive, energetic, clear-headed. This is real. Lean into it.",
    selfCare: "You feel strong and capable right now — because you are. Use this window for the things that matter most to you.",
    relationships: {
      people: "You have bandwidth again. If there's anything to repair from your harder days, now is the time — you can handle it without it escalating.",
      withPartner: "This is your reconnection window. You have the energy for real conversations and quality time.",
      withKids: "Your energy is back and your communication is crisp. Great time for the harder conversations or just being fully present.",
      strategy: "The hard days weren't who you are — they were a phase. Literally. This version of you was always coming back.",
    },
  },
  Ovulation: {
    outlook: "Strongest, sharpest, most confident",
    headsUp: "This is you at full power — communication on point, energy high, facing challenges with a calm, collected mindset. Enjoy it.",
    selfCare: "You feel powerful and strong right now. Have the hard conversation. Take on the big task. Just don't overcommit for future-you.",
    relationships: {
      people: "Your best window for real connection. You can show up without the irritability filter — be honest, be present, be generous.",
      withPartner: "If something needs to be said, say it now. Date night, real talk — you should handle it with grace.",
      withKids: "You can handle the chaos and the attitudes with energy to spare. Lean in — these are the moments that build the relationship bank.",
      strategy: "Bookmark this feeling. When the hard days hit, remembering 'I was this person three days ago' helps you give yourself grace.",
    },
  },
  Luteal: {
    outlook: "Energy fading — guard your peace",
    headsUp: "These are the days when everything sets you over the edge and you can't seem to regain control. It's not you — it's progesterone dropping. The hump passes.",
    selfCare: "When the guilt creeps in after every pitfall, remember: you're in your hardest phase and you knew it was coming. Be a little gentler with yourself.",
    relationships: {
      people: "Everything feels bigger right now — a comment, a look, a tone. Your communication may feel off. That's this phase, not a personality flaw.",
      withPartner: "Tell them before you're in it: 'My hard days start around day X.' It removes the guesswork and the guilt spiral.",
      withKids: "Low energy + their attitudes = the moment you say something you regret. Lower the bar. Walk away when you need to. That's not weakness — it's wisdom.",
      strategy: "You're doing your best even when it doesn't feel like it. This window is temporary — better days are just ahead and you should begin to feel like yourself again.",
    },
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
    "Mood swings": "Energy dips as progesterone peaks then drops. Warn your inner circle.",
    Acne: "Hormonal breakouts are most likely now. Stick to your routine, don't panic-treat.",
    Cravings: "Cravings are peaking — lean into complex carbs and dark chocolate.",
    "Brain fog": "Focus may feel scattered. Break tasks into smaller chunks.",
    Anxiety: "Anxiety tends to spike in the late luteal phase. Breathwork and boundaries help.",
    Insomnia: "Sleep disruption is common. Avoid screens late and try magnesium before bed.",
  },
};

export function PlanTab({ userId, cycleData, onPeriodUpdate }: PlanTabProps) {
  useTrackFeature("plan_tab");
  const [checkins, setCheckins] = useState<CheckinEntry[]>([]);
  const [anchorSymptom, setAnchorSymptom] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [liveCycle, setLiveCycle] = useState<{
    cycleDay: number;
    phase: string;
    cycleLengthDays: number;
    lastPeriodStart: string | null;
  } | null>(null);

  // Allow other parts of the app (e.g. broadcast CTAs in chat) to deep-link into a section.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { section?: string } | undefined;
      if (detail?.section && ["mood", "exercise", "nutrition"].includes(detail.section)) {
        setExpandedSection(detail.section);
        setTimeout(() => {
          const el = document.getElementById(`plan-section-${detail.section}`);
          el?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    };
    window.addEventListener("logan:open-plan-section", handler);
    return () => window.removeEventListener("logan:open-plan-section", handler);
  }, []);

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
          .select("anchor_symptom, last_period_start, cycle_length_days, timezone")
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
        const lps = participantRes.data.last_period_start;
        const cld = participantRes.data.cycle_length_days;
        if (lps && cld) {
          const tz = participantRes.data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
          const info = calculateCycleInfo(lps, cld, tz);
          if (info) {
            setLiveCycle({
              cycleDay: info.cycleDay,
              phase: info.phase,
              cycleLengthDays: cld,
              lastPeriodStart: lps,
            });
          }
        }
      }

      setLoading(false);
    };
    fetchData();

    // Subscribe to participant updates so Plan tab stays in sync after period edits
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const email = (await supabase.auth.getUser()).data.user?.email;
      if (!email) return;
      channel = supabase
        .channel(`plan_participants_sync_${userId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "participants", filter: `email=eq.${email}` },
          (payload) => {
            const row = payload.new as any;
            if (!row) return;
            const lps = row.last_period_start;
            const cld = row.cycle_length_days;
            if (row.anchor_symptom !== undefined) setAnchorSymptom(row.anchor_symptom);
            if (lps && cld) {
              const tz = row.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
              const info = calculateCycleInfo(lps, cld, tz);
              if (info) {
                setLiveCycle({
                  cycleDay: info.cycleDay,
                  phase: info.phase,
                  cycleLengthDays: cld,
                  lastPeriodStart: lps,
                });
              }
            }
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, cycleData?.lastPeriodStart, cycleData?.cycleLengthDays]);

  // Prefer live participant data (always current); fall back to chat-derived prop.
  const currentPhase = liveCycle?.phase || cycleData?.phase || "Follicular";
  const currentDay = liveCycle?.cycleDay || cycleData?.cycleDay || 1;
  const cycleLength = liveCycle?.cycleLengthDays || cycleData?.cycleLengthDays || 28;
  const lastPeriodStart = liveCycle?.lastPeriodStart || cycleData?.lastPeriodStart;

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
          message: `Day ${f.cycleDay} — energy may be lower. Plan lighter and ask for help.`,
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

  // Non-cycling life stages get tailored content
  const isNonCycling = cycleData?.lifeStage === "postpartum" || cycleData?.lifeStage === "menopause";

  if (isNonCycling) {
    const stage = cycleData!.lifeStage!;
    const stageLabel = stage === "postpartum" ? "Postpartum" : "Menopause";
    const stageColor = stage === "postpartum" ? "text-pink-400" : "text-amber-400";
    const stageBgFaint = stage === "postpartum" ? "bg-pink-400/15" : "bg-amber-400/15";
    const stageBorder = stage === "postpartum" ? "border-pink-400/20" : "border-amber-400/20";

    const PP_WORKOUT = {
      suggestion: "Your body is healing. Focus on pelvic floor recovery, gentle walks, and rebuilding core strength gradually. No rushing.",
      examples: ["Pelvic floor exercises", "Short walks", "Gentle stretching", "Postnatal yoga"],
      trainingNote: "Avoid high-impact and heavy lifts until cleared by your provider. Core stability before intensity.",
    };
    const MENO_WORKOUT = {
      suggestion: "Strength training protects bone density and manages symptoms. Consistency matters more than intensity.",
      examples: ["Weight training", "Resistance bands", "Walking", "Swimming"],
      trainingNote: "Prioritize compound movements. Bone density and muscle mass preservation are your main goals.",
    };
    const PP_NUTRITION = {
      focus: "Support healing & energy",
      foods: ["Iron-rich foods (red meat, lentils)", "Omega-3s (salmon, walnuts)", "Bone broth & warm meals", "Hydrate — especially if nursing"],
      avoid: "Extreme calorie restriction — your body needs fuel to heal",
    };
    const MENO_NUTRITION = {
      focus: "Bone health & hormone balance",
      foods: ["Calcium-rich foods (dairy, leafy greens)", "Vitamin D sources", "Phytoestrogens (soy, flaxseed)", "Magnesium (nuts, seeds)"],
      avoid: "Excess alcohol and caffeine — they can worsen hot flashes and sleep disruption",
    };
    const PP_MOOD = {
      outlook: "Recovery — be patient with yourself",
      headsUp: "Hormones are recalibrating after pregnancy. Mood swings, tearfulness, and anxiety are common — not a sign of weakness.",
      selfCare: "Ask for help. Sleep when you can. One good meal and one short walk can shift your entire day.",
      relationships: {
        people: "You may feel isolated or overwhelmed. One honest conversation with someone you trust goes further than pretending you're fine.",
        withPartner: "Tell them specifically what helps — they can't read your mind and they want to support you.",
        withKids: "Older kids may need reassurance. Simple routines and predictable rhythms help everyone adjust.",
        strategy: "This phase is temporary. Your hormones will stabilize. Give yourself the grace you'd give a friend.",
      },
    };
    const MENO_MOOD = {
      outlook: "Transition — embrace the change",
      headsUp: "Declining estrogen affects mood, sleep, and cognitive function. Brain fog, irritability, and anxiety are hormonal — not personal failings.",
      selfCare: "Protect your sleep aggressively. Stress management isn't optional now — it's medicine.",
      relationships: {
        people: "You may feel more reactive or withdrawn. Naming it ('my hormones are making this harder') removes shame and invites support.",
        withPartner: "Intimacy may shift. Open conversation about what feels different builds closeness instead of distance.",
        withKids: "You're still the same mom. When patience is thin, take a pause. Modeling self-care teaches them resilience.",
        strategy: "Many women report feeling their most authentic and free after this transition. The hard part doesn't last forever.",
      },
    };

    const workout = stage === "postpartum" ? PP_WORKOUT : MENO_WORKOUT;
    const nutrition = stage === "postpartum" ? PP_NUTRITION : MENO_NUTRITION;
    const moodGuide = stage === "postpartum" ? PP_MOOD : MENO_MOOD;

    return (
      <div className="flex-1 overflow-y-auto pb-20">
        <div className="max-w-lg md:max-w-4xl mx-auto px-4 py-5 space-y-4">
          <div>
            <h2 className="font-display font-semibold text-lg text-foreground">Your Week</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className={cn("font-medium", stageColor)}>{stageLabel}</span>
              {" · "}Tailored guidance for your stage
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Mood */}
            <button onClick={() => toggle("mood")} className="w-full rounded-xl border border-border/30 bg-card/50 overflow-hidden text-left transition-colors hover:bg-card/70">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", stageBgFaint)}>
                  <Heart className={cn("w-5 h-5", stageColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Mood & Energy</p>
                  <p className="text-xs text-muted-foreground truncate">{moodGuide.outlook}</p>
                </div>
                <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", expandedSection === "mood" && "rotate-90")} />
              </div>
              {expandedSection === "mood" && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/15 pt-3" onClick={(e) => e.stopPropagation()}>
                  <div className={cn("rounded-lg px-3 py-2.5 border", stageBgFaint, stageBorder)}>
                    <p className={cn("text-xs font-medium mb-1", stageColor)}>⚡ Heads up</p>
                    <p className="text-xs text-muted-foreground">{moodGuide.headsUp}</p>
                  </div>
                  <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">What to do</p><p className="text-xs text-muted-foreground">{moodGuide.selfCare}</p></div>
                  <div className="space-y-2 pt-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Your relationships</p>
                    <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5"><p className="text-xs text-muted-foreground">{moodGuide.relationships.people}</p></div>
                    <details className="group">
                      <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1">
                        <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />If you have a partner or kids
                      </summary>
                      <div className="mt-2 space-y-2">
                        <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5"><p className="text-[10px] font-semibold text-primary/80 mb-0.5">💑 With a partner</p><p className="text-xs text-muted-foreground">{moodGuide.relationships.withPartner}</p></div>
                        <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5"><p className="text-[10px] font-semibold text-primary/80 mb-0.5">👨‍👩‍👧‍👦 With kids / teens</p><p className="text-xs text-muted-foreground">{moodGuide.relationships.withKids}</p></div>
                      </div>
                    </details>
                    <div className="rounded-lg bg-phase-follicular/5 border border-phase-follicular/15 px-3 py-2.5"><p className="text-xs font-medium text-phase-follicular mb-1">💡 Try this</p><p className="text-xs text-muted-foreground">{moodGuide.relationships.strategy}</p></div>
                  </div>
                </div>
              )}
            </button>

            {/* Workout */}
            <button onClick={() => toggle("exercise")} className="w-full rounded-xl border border-border/30 bg-card/50 overflow-hidden text-left transition-colors hover:bg-card/70">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center"><Dumbbell className="w-5 h-5 text-primary" /></div>
                <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-foreground">Workout</p><p className="text-xs text-muted-foreground truncate">{stage === "postpartum" ? "Rebuild gently" : "Protect & strengthen"}</p></div>
                <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", expandedSection === "exercise" && "rotate-90")} />
              </div>
              {expandedSection === "exercise" && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/15 pt-3" onClick={(e) => e.stopPropagation()}>
                  <p className="text-xs text-muted-foreground">{workout.suggestion}</p>
                  <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Try this week</p>
                    <div className="flex flex-wrap gap-1.5">{workout.examples.map(ex => <span key={ex} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/15">{ex}</span>)}</div>
                  </div>
                  <div className="rounded-lg bg-muted/30 border border-border/15 px-3 py-2.5"><p className="text-[10px] font-semibold text-muted-foreground mb-0.5">Training intel</p><p className="text-xs text-muted-foreground">{workout.trainingNote}</p></div>
                </div>
              )}
            </button>

            {/* Nutrition */}
            <button onClick={() => toggle("nutrition")} className="w-full rounded-xl border border-border/30 bg-card/50 overflow-hidden text-left transition-colors hover:bg-card/70">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 rounded-lg bg-phase-luteal/10 flex items-center justify-center"><Utensils className="w-5 h-5 text-phase-luteal" /></div>
                <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-foreground">Nutrition</p><p className="text-xs text-muted-foreground truncate">{nutrition.focus}</p></div>
                <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", expandedSection === "nutrition" && "rotate-90")} />
              </div>
              {expandedSection === "nutrition" && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/15 pt-3" onClick={(e) => e.stopPropagation()}>
                  <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Prioritize</p>
                    <ul className="space-y-1">{nutrition.foods.map(food => <li key={food} className="text-xs text-muted-foreground flex items-start gap-1.5"><span className="mt-1 w-1.5 h-1.5 rounded-full bg-phase-luteal shrink-0" />{food}</li>)}</ul>
                  </div>
                  <div className="rounded-lg bg-phase-luteal/5 border border-phase-luteal/15 px-3 py-2"><p className="text-xs text-muted-foreground"><span className="font-medium text-phase-luteal">Note:</span> {nutrition.avoid}</p></div>
                  <NutritionMenuActions userId={userId} />
                </div>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }


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
            id="plan-section-mood"
            onClick={() => toggle("mood")}
            className="w-full rounded-xl border border-border/30 bg-card/50 overflow-hidden text-left transition-colors hover:bg-card/70"
          >
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", PHASE_BG_FAINT[currentPhase])}>
                <Heart className={cn("w-5 h-5", PHASE_COLOR[currentPhase])} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Mood & Energy</p>
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

                {/* Relational insights */}
                <div className="space-y-2 pt-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Your relationships</p>
                  <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5">
                    <p className="text-xs text-muted-foreground">{moodGuide.relationships.people}</p>
                  </div>
                  <details className="group">
                    <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1">
                      <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                      If you have a partner or kids
                    </summary>
                    <div className="mt-2 space-y-2">
                      <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5">
                        <p className="text-[10px] font-semibold text-primary/80 mb-0.5">💑 With a partner</p>
                        <p className="text-xs text-muted-foreground">{moodGuide.relationships.withPartner}</p>
                      </div>
                      <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5">
                        <p className="text-[10px] font-semibold text-primary/80 mb-0.5">👨‍👩‍👧‍👦 With kids / teens</p>
                        <p className="text-xs text-muted-foreground">{moodGuide.relationships.withKids}</p>
                      </div>
                    </div>
                  </details>
                  <div className="rounded-lg bg-phase-follicular/5 border border-phase-follicular/15 px-3 py-2.5">
                    <p className="text-xs font-medium text-phase-follicular mb-1">💡 Try this</p>
                    <p className="text-xs text-muted-foreground">{moodGuide.relationships.strategy}</p>
                  </div>
                </div>
              </div>
            )}
          </button>

          {/* ── Exercise card ── */}
          <button
            id="plan-section-exercise"
            onClick={() => toggle("exercise")}
            className="w-full rounded-xl border border-border/30 bg-card/50 overflow-hidden text-left transition-colors hover:bg-card/70"
          >
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Dumbbell className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Workout</p>
                <p className="text-xs text-muted-foreground truncate">{workout.readiness}</p>
              </div>
              <ChevronRight className={cn(
                "w-4 h-4 text-muted-foreground transition-transform",
                expandedSection === "exercise" && "rotate-90"
              )} />
            </div>
            {expandedSection === "exercise" && (
              <div className="px-4 pb-4 space-y-3 border-t border-border/15 pt-3" onClick={(e) => e.stopPropagation()}>

                {/* Load capacity meter */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Load capacity</p>
                    <span className="text-xs font-semibold text-foreground">{workout.loadCapacity}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        workout.loadCapacity >= 80 ? "bg-phase-ovulation"
                          : workout.loadCapacity >= 50 ? "bg-phase-follicular"
                          : "bg-phase-menstruation"
                      )}
                      style={{ width: `${workout.loadCapacity}%` }}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">{workout.suggestion}</p>

                {workout.riskFlag && (
                  <div className="rounded-lg bg-phase-menstruation/5 border border-phase-menstruation/15 px-3 py-2.5">
                    <p className="text-[10px] font-semibold text-phase-menstruation mb-0.5">Risk window</p>
                    <p className="text-xs text-muted-foreground">{workout.riskFlag}</p>
                  </div>
                )}

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

                <div className="rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5">
                  <p className="text-[10px] font-semibold text-primary/80 mb-0.5">Athletic decision</p>
                  <p className="text-xs text-muted-foreground">{workout.athleticDecision}</p>
                </div>

                <div className="rounded-lg bg-muted/30 border border-border/15 px-3 py-2.5">
                  <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">Training intel</p>
                  <p className="text-xs text-muted-foreground">{workout.trainingNote}</p>
                </div>
              </div>
            )}
          </button>

          {/* ── Nutrition card ── */}
          <button
            id="plan-section-nutrition"
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
                <NutritionMenuActions userId={userId} />
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
        {lastPeriodStart && (
          <CycleForecast
            cycleDay={currentDay}
            phase={currentPhase}
            cycleLengthDays={cycleLength}
            lastPeriodStart={lastPeriodStart}
            anchorSymptom={anchorSymptom}
            onClose={() => {}}
            embedded
            onPeriodUpdate={onPeriodUpdate}
            postpartumStartDate={cycleData?.postpartumStartDate}
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
