import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Send } from "lucide-react";

interface AnchorPickerProps {
  symptoms: string[];
  onSubmit: (anchor: string) => void;
  isSubmitting: boolean;
}

export const AnchorPicker = ({ symptoms, onSubmit, isSubmitting }: AnchorPickerProps) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [showOther, setShowOther] = useState(false);
  const [otherValue, setOtherValue] = useState("");

  const handleSelect = (symptom: string) => {
    if (symptom === "Other") {
      setShowOther(true);
      setSelected(null);
    } else {
      setShowOther(false);
      setSelected(symptom);
    }
  };

  const handleSubmit = () => {
    const value = showOther ? otherValue.trim() : selected;
    if (value) {
      onSubmit(value);
    }
  };

  const isValid = showOther ? otherValue.trim().length > 0 : selected !== null;

  return (
    <div className="space-y-4 p-4 bg-card/50 rounded-2xl border border-border">
      <p className="text-xs text-muted-foreground">Choose the one that affects your life the most</p>
      
      <div className="flex flex-wrap gap-2">
        {symptoms.map(symptom => (
          <button
            key={symptom}
            onClick={() => handleSelect(symptom)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-full border transition-all",
              selected === symptom && !showOther
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border hover:border-primary/50 hover:bg-accent"
            )}
          >
            {symptom}
          </button>
        ))}
        <button
          onClick={() => handleSelect("Other")}
          className={cn(
            "px-3 py-1.5 text-sm rounded-full border transition-all",
            showOther
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border hover:border-primary/50 hover:bg-accent"
          )}
        >
          Other
        </button>
      </div>

      {showOther && (
        <Input
          value={otherValue}
          onChange={(e) => setOtherValue(e.target.value)}
          placeholder="Describe your main symptom..."
          className="mt-2"
          autoFocus
        />
      )}
      
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          className="gap-2"
        >
          Continue
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
