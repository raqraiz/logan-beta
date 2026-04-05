import { useState } from "react";
import { ChatCycleCircle } from "@/components/chat/ChatCycleCircle";
import { LoganLogo } from "@/components/LoganLogo";
import { format } from "date-fns";
import { useTrackFeature } from "@/hooks/useTrackFeature";
import { CalendarIcon, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
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
}

export function HomeTab({ cycleData, onPeriodUpdate }: HomeTabProps) {
  useTrackFeature("home_tab");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const handleConfirmUpdate = async () => {
    if (!selectedDate || !onPeriodUpdate) return;
    setIsSubmitting(true);
    try {
      await onPeriodUpdate(selectedDate);
      setShowDatePicker(false);
      setDismissed(true);
      setSelectedDate(undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

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
      <ChatCycleCircle
        cycleDay={cycleData.cycleDay}
        phase={cycleData.phase}
        cycleLengthDays={cycleData.cycleLengthDays}
        size="md"
      />
      <p className="text-sm text-muted-foreground mt-3">
        {format(new Date(), "EEEE, MMMM d")}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Day {cycleData.cycleDay} of {cycleData.cycleLengthDays}
      </p>

      {/* Accuracy check prompt */}
      {!dismissed && (
        <div className="mt-6 mx-6 max-w-sm w-full rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-4 text-center">
          <p className="text-sm font-medium text-foreground">
            Does this look right?
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Day {cycleData.cycleDay}, {cycleData.phase} phase
          </p>
          <div className="flex items-center justify-center gap-3 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDismissed(true)}
              className="gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Yes, it's right
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowDatePicker(true)}
              className="gap-1.5"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              Update it
            </Button>
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
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowDatePicker(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmUpdate}
              disabled={!selectedDate || isSubmitting}
            >
              {isSubmitting ? "Updating…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
