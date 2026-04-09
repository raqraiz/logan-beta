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

const HER_TIPS: Record<string, string[]> = {
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

const HIM_TIPS: Record<string, string[]> = {
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

function TipCard({ label, tips, phase }: { label: string; tips: string[]; phase: string }) {
  const phaseTips = tips.length > 0 ? tips : ["No tips available for this phase."];
  const [index, setIndex] = useState(() => Math.floor(Math.random() * phaseTips.length));

  const rotate = useCallback(() => {
    setIndex(prev => (prev + 1) % phaseTips.length);
  }, [phaseTips.length]);

  return (
    <button
      onClick={rotate}
      className="w-full text-left rounded-xl border border-border/50 bg-card/60 p-3 transition-all duration-200 active:scale-[0.98] hover:bg-card/80 group"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">{label}</span>
        <Shuffle className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
      </div>
      <p className="text-xs text-foreground/90 leading-relaxed">{phaseTips[index]}</p>
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
