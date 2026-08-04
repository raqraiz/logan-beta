import { Button } from "@/components/ui/button";
import { X, Megaphone } from "lucide-react";

interface FeedbackPromptCardProps {
  onGiveFeedback: () => void;
  onDismiss: () => void;
}

export const FeedbackPromptCard = ({ onGiveFeedback, onDismiss }: FeedbackPromptCardProps) => (
  <div className="max-w-3xl mx-auto px-4 pb-3">
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card/80 backdrop-blur px-3 py-2.5">
      <Megaphone className="w-4 h-4 text-primary shrink-0" />
      <p className="text-sm text-foreground/80 flex-1 leading-snug">
        Quick thought — how's Logan working for you so far?
      </p>
      <Button size="sm" variant="secondary" onClick={onGiveFeedback}>
        Give feedback
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        onClick={onDismiss}
        aria-label="Dismiss feedback prompt"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  </div>
);
