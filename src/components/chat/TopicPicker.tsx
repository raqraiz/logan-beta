import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Send } from "lucide-react";

const TOPICS = [
  { id: "diet", label: "Diet & nutrition", description: "What to eat and when" },
  { id: "exercise", label: "Exercise & movement", description: "Workouts that match your energy" },
  { id: "sleep", label: "Sleep & recovery", description: "Rest strategies by phase" },
  { id: "mood", label: "Mood & emotions", description: "Navigating emotional shifts" },
  { id: "energy", label: "Energy & productivity", description: "When to push vs. protect" },
  { id: "skin", label: "Skin & body", description: "Breakouts, bloating, inflammation" },
];

interface TopicPickerProps {
  onSubmit: (topics: string[]) => void;
  isSubmitting: boolean;
}

export const TopicPicker = ({ onSubmit, isSubmitting }: TopicPickerProps) => {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-3 p-4 bg-card/50 rounded-2xl border border-border">
      <p className="text-xs text-muted-foreground">Pick as many as you like</p>
      <div className="grid grid-cols-2 gap-2">
        {TOPICS.map(topic => (
          <button
            key={topic.id}
            onClick={() => toggle(topic.id)}
            className={cn(
              "text-left px-3 py-2.5 rounded-xl border transition-all",
              selected.includes(topic.id)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border hover:border-primary/50 hover:bg-accent"
            )}
          >
            <span className="text-sm font-medium block">{topic.label}</span>
            <span className={cn(
              "text-[11px] block mt-0.5",
              selected.includes(topic.id) ? "text-primary-foreground/70" : "text-muted-foreground"
            )}>
              {topic.description}
            </span>
          </button>
        ))}
      </div>
      <div className="flex justify-end pt-1">
        <Button
          onClick={() => onSubmit(selected.length > 0 ? selected : TOPICS.map(t => t.id))}
          disabled={isSubmitting}
          className="gap-2"
        >
          {selected.length > 0 ? "Continue" : "All of the above"}
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
