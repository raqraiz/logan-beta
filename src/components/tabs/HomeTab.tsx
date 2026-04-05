import { useState } from "react";
import { ChatCycleCircle } from "@/components/chat/ChatCycleCircle";
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
}

export function HomeTab({ cycleData, onPeriodUpdate, onCycleLengthUpdate }: HomeTabProps) {
  useTrackFeature("home_tab");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showLengthEditor, setShowLengthEditor] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [editedLength, setEditedLength] = useState<number>(28);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittingLength, setIsSubmittingLength] = useState(false);
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

      {/* Subtle accuracy check */}
      {!dismissed && (
        <div className="mt-4 flex flex-col items-center gap-1 text-xs text-muted-foreground/70">
          <div className="flex items-center gap-2">
            <span>Not accurate?</span>
            <button
              onClick={() => setShowDatePicker(true)}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Update period date
            </button>
            <span>·</span>
            <button
              onClick={() => {
                setEditedLength(cycleData.cycleLengthDays);
                setShowLengthEditor(true);
              }}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Cycle length
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="ml-1 hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
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
      {/* Cycle length editor dialog */}
      <Dialog open={showLengthEditor} onOpenChange={setShowLengthEditor}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Cycle length</DialogTitle>
            <DialogDescription>
              Adjust your typical cycle length in days.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <span className="text-3xl font-semibold text-foreground">{editedLength} days</span>
            <Slider
              min={18}
              max={45}
              step={1}
              value={[editedLength]}
              onValueChange={([v]) => setEditedLength(v)}
              className="w-full"
            />
            <div className="flex justify-between w-full text-xs text-muted-foreground">
              <span>18</span>
              <span>45</span>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowLengthEditor(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!onCycleLengthUpdate) return;
                setIsSubmittingLength(true);
                try {
                  await onCycleLengthUpdate(editedLength);
                  setShowLengthEditor(false);
                } finally {
                  setIsSubmittingLength(false);
                }
              }}
              disabled={isSubmittingLength || editedLength === cycleData.cycleLengthDays}
            >
              {isSubmittingLength ? "Updating…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
