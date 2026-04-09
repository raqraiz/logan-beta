import { useState, useCallback } from "react";
import { ChatCycleCircle } from "@/components/chat/ChatCycleCircle";
import { CycleAnalytics } from "@/components/chat/CycleAnalytics";
import { LoganLogo } from "@/components/LoganLogo";
import { format } from "date-fns";
import { useTrackFeature } from "@/hooks/useTrackFeature";
import { X, Shuffle } from "lucide-react";
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
    "Batch-cook something nourishing — future you will be grateful.",
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
    "Record a voice memo of your ideas — you're sharper than you'll be next week.",
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

const PHASE_BORDER: Record<string, string> = {
  Menstruation: "border-l-phase-menstruation",
  Follicular: "border-l-phase-follicular",
  Ovulation: "border-l-phase-ovulation",
  Luteal: "border-l-phase-luteal",
};

const PHASE_GLOW: Record<string, string> = {
  Menstruation: "shadow-[0_0_20px_-6px_hsl(355,78%,60%,0.15)]",
  Follicular: "shadow-[0_0_20px_-6px_hsl(152,60%,52%,0.15)]",
  Ovulation: "shadow-[0_0_20px_-6px_hsl(40,90%,56%,0.15)]",
  Luteal: "shadow-[0_0_20px_-6px_hsl(270,60%,65%,0.15)]",
};

function TipCard({ label, tips, phase }: { label: string; tips: string[]; phase: string }) {
  const phaseTips = tips.length > 0 ? tips : ["No tips available for this phase."];
  const [index, setIndex] = useState(() => Math.floor(Math.random() * phaseTips.length));
  const [animating, setAnimating] = useState(false);

  const rotate = useCallback(() => {
    setAnimating(true);
    setTimeout(() => {
      setIndex(prev => (prev + 1) % phaseTips.length);
      setAnimating(false);
    }, 150);
  }, [phaseTips.length]);

  const borderColor = PHASE_BORDER[phase] || "border-l-primary";
  const glow = PHASE_GLOW[phase] || "";

  return (
    <button
      onClick={rotate}
      className={`w-full text-left rounded-xl border border-border/30 border-l-2 ${borderColor} 
        bg-card/40 backdrop-blur-sm p-3.5 transition-all duration-200 
        active:scale-[0.97] hover:bg-card/60 group ${glow}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">{label}</span>
        <div className="flex items-center gap-1 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors">
          <span className="text-[9px]">tap to shuffle</span>
          <Shuffle className="w-3 h-3" />
        </div>
      </div>
      <p className={`text-[13px] text-foreground/85 leading-relaxed transition-opacity duration-150 ${animating ? 'opacity-0' : 'opacity-100'}`}>
        {phaseTips[index]}
      </p>
    </button>
  );
}

interface CycleData {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
  lastPeriodStart?: string;
}

interface HomeTabProps {
  cycleData: CycleData | null;
  anchorSymptom?: string | null;
  onPeriodUpdate?: (date: Date) => void;
  onCycleLengthUpdate?: (days: number) => void;
  userId?: string;
}

export function HomeTab({ cycleData, onPeriodUpdate, onCycleLengthUpdate, userId }: HomeTabProps) {
  useTrackFeature("home_tab");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [editedLength, setEditedLength] = useState<number>(28);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

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

  return (
    <div className="flex-1 flex flex-col items-center justify-center pb-16">
      <button
        onClick={() => setShowAnalytics(true)}
        className="cursor-pointer transition-transform duration-200 active:scale-95 hover:scale-[1.02]"
        aria-label="View cycle analytics"
      >
        <ChatCycleCircle
          cycleDay={cycleData.cycleDay}
          phase={cycleData.phase}
          cycleLengthDays={cycleData.cycleLengthDays}
          size="md"
        />
      </button>
      <p className="text-sm text-muted-foreground mt-3">
        {format(new Date(), "EEEE, MMMM d")}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Day {cycleData.cycleDay} of {cycleData.cycleLengthDays}
      </p>

      {/* Subtle accuracy check */}
      {!dismissed && (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground/70">
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
          <button
            onClick={() => setDismissed(true)}
            className="ml-1 hover:text-foreground transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* How not to mess up today */}
      <div className="w-full max-w-xs mt-8 flex flex-col gap-3 px-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/40 text-center">
          How not to mess up today
        </p>
        <TipCard label="For you" tips={HER_TIPS[cycleData.phase] || []} phase={cycleData.phase} />
        <TipCard label="For him" tips={HIM_TIPS[cycleData.phase] || []} phase={cycleData.phase} />
      </div>

      {/* Date picker dialog with inline cycle length */}
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

          {/* Subtle cycle length adjuster */}
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
            <Button variant="outline" onClick={() => setShowDatePicker(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setIsSubmitting(true);
                try {
                  if (selectedDate && onPeriodUpdate) {
                    await onPeriodUpdate(selectedDate);
                  }
                  if (editedLength !== cycleData.cycleLengthDays && onCycleLengthUpdate) {
                    await onCycleLengthUpdate(editedLength);
                  }
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
    </div>
  );
}
