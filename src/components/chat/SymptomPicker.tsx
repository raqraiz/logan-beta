import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Send } from "lucide-react";

interface SymptomCategory {
  label: string;
  symptoms: string[];
}

interface SymptomCategories {
  emotional: SymptomCategory;
  physical: SymptomCategory;
  quirky: SymptomCategory;
}

interface SymptomPickerProps {
  categories: SymptomCategories;
  onSubmit: (symptoms: string[], otherText?: string) => void;
  isSubmitting: boolean;
}

export const SymptomPicker = ({ categories, onSubmit, isSubmitting }: SymptomPickerProps) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [customSymptom, setCustomSymptom] = useState("");

  const toggleSymptom = (symptom: string) => {
    setSelected(prev => 
      prev.includes(symptom) 
        ? prev.filter(s => s !== symptom)
        : [...prev, symptom]
    );
  };

  const handleSubmit = () => {
    if (selected.length > 0) {
      const notes = customSymptom.trim() || undefined;
      onSubmit([...selected], notes);
    }
  };

  const renderCategory = (category: SymptomCategory) => (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground tracking-wide">
        {category.label}
      </h4>
      <div className="flex flex-wrap gap-2">
        {category.symptoms.map(symptom => (
          <button
            key={symptom}
            onClick={() => toggleSymptom(symptom)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-full border transition-all",
              selected.includes(symptom)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border hover:border-primary/50 hover:bg-accent"
            )}
          >
            {symptom}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 p-4 bg-card/50 rounded-2xl border border-border">
      <p className="text-xs text-muted-foreground">Select all that apply</p>
      
      {renderCategory(categories.emotional)}
      {renderCategory(categories.physical)}
      {renderCategory(categories.quirky)}
      
      {/* Add custom symptom or notes */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground tracking-wide">
          Not on the list?
        </h4>
        <Textarea
          value={customSymptom}
          onChange={(e) => setCustomSymptom(e.target.value)}
          placeholder="Add anything else, like symptoms we missed or patterns you've noticed..."
          className="resize-none"
          rows={2}
        />
      </div>
      
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSubmit}
          disabled={selected.length === 0 || isSubmitting}
          className="gap-2"
        >
          Continue
          <Send className="w-4 h-4" />
        </Button>
      </div>
      
      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selected.length} symptom{selected.length > 1 ? "s" : ""} selected
        </p>
      )}
    </div>
  );
};
