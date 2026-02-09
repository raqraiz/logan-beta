import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sun, Moon, Sunset, Clock } from "lucide-react";

interface NotificationPreferencePickerProps {
  onSubmit: (preferences: {
    frequency: string;
    preferredTime: string;
    preferredDays: string[];
  }) => void;
  isSubmitting: boolean;
}

const DAYS_OF_WEEK = [
  { value: "sunday", label: "Sun" },
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
];

const TIME_OPTIONS = [
  { value: "morning", label: "Morning", description: "8 AM", icon: Sun },
  { value: "afternoon", label: "Afternoon", description: "1 PM", icon: Sunset },
  { value: "evening", label: "Evening", description: "8 PM", icon: Moon },
];

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily", description: "Every day" },
  { value: "twice_weekly", label: "2x per week", description: "Recommended" },
  { value: "weekly", label: "Weekly", description: "Once a week" },
];

export const NotificationPreferencePicker = ({
  onSubmit,
  isSubmitting,
}: NotificationPreferencePickerProps) => {
  const [frequency, setFrequency] = useState("twice_weekly");
  const [preferredTime, setPreferredTime] = useState("evening");
  const [selectedDays, setSelectedDays] = useState<string[]>(["tuesday", "saturday"]);

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = () => {
    // For daily frequency, use all days; otherwise require at least one selected day
    const daysToSubmit = frequency === "daily" 
      ? DAYS_OF_WEEK.map(d => d.value) 
      : selectedDays;
    
    if (frequency !== "daily" && selectedDays.length === 0) {
      return;
    }
    onSubmit({
      frequency,
      preferredTime,
      preferredDays: daysToSubmit,
    });
  };

  const showDayPicker = frequency !== "daily";

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-5">
      {/* Frequency */}
      <div>
        <h4 className="text-sm font-medium text-foreground mb-3">How often should I check in?</h4>
        <RadioGroup value={frequency} onValueChange={setFrequency} className="grid grid-cols-3 gap-2">
          {FREQUENCY_OPTIONS.map((option) => (
            <div key={option.value}>
              <RadioGroupItem
                value={option.value}
                id={`freq-${option.value}`}
                className="peer sr-only"
              />
              <Label
                htmlFor={`freq-${option.value}`}
                className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 cursor-pointer transition-colors text-center"
              >
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Day picker (only for non-daily) */}
      {showDayPicker && (
        <div>
          <h4 className="text-sm font-medium text-foreground mb-3">Which days work best?</h4>
          <div className="flex flex-wrap gap-2">
            {DAYS_OF_WEEK.map((day) => (
              <div key={day.value} className="flex items-center">
                <Checkbox
                  id={`day-${day.value}`}
                  checked={selectedDays.includes(day.value)}
                  onCheckedChange={() => toggleDay(day.value)}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={`day-${day.value}`}
                  className={`px-3 py-2 rounded-lg border-2 cursor-pointer transition-colors text-sm font-medium ${
                    selectedDays.includes(day.value)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-muted bg-popover hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {day.label}
                </Label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time of day */}
      <div>
        <h4 className="text-sm font-medium text-foreground mb-3">What time of day?</h4>
        <RadioGroup value={preferredTime} onValueChange={setPreferredTime} className="grid grid-cols-3 gap-2">
          {TIME_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <div key={option.value}>
                <RadioGroupItem
                  value={option.value}
                  id={`time-${option.value}`}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={`time-${option.value}`}
                  className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 cursor-pointer transition-colors text-center"
                >
                  <Icon className="w-5 h-5 mb-1" />
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </Label>
              </div>
            );
          })}
        </RadioGroup>
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={isSubmitting || (showDayPicker && selectedDays.length === 0)}
        className="w-full"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Clock className="w-4 h-4 mr-2" />
            Set my schedule
          </>
        )}
      </Button>
    </div>
  );
};
