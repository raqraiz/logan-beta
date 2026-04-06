import { useState } from "react";
import { ChatCycleCircle } from "@/components/chat/ChatCycleCircle";
import { CycleAnalytics } from "@/components/chat/CycleAnalytics";
import { LoganLogo } from "@/components/LoganLogo";
import { format } from "date-fns";
import { useTrackFeature } from "@/hooks/useTrackFeature";
import { X } from "lucide-react";
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
    </div>
  );
}
