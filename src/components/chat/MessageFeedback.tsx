import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageFeedbackProps {
  messageId: string;
  onFeedback: (messageId: string, isPositive: boolean) => void;
  existingReaction?: "positive" | "negative" | null;
}

export const MessageFeedback = ({ 
  messageId, 
  onFeedback, 
  existingReaction,
}: MessageFeedbackProps) => {
  const [selected, setSelected] = useState<"up" | "down" | null>(() => {
    if (existingReaction === "positive") return "up";
    if (existingReaction === "negative") return "down";
    return null;
  });

  const handleFeedback = (type: "up" | "down") => {
    // Allow changing selection
    if (selected === type) return;
    setSelected(type);
    onFeedback(messageId, type === "up");
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => handleFeedback("up")}
        className={cn(
          "p-1 rounded transition-all",
          selected === "up" 
            ? "text-primary" 
            : "text-muted-foreground/40 hover:text-primary/70"
        )}
        aria-label="Helpful"
      >
        <ThumbsUp className={cn("w-3.5 h-3.5", selected === "up" && "fill-current")} />
      </button>
      <button
        onClick={() => handleFeedback("down")}
        className={cn(
          "p-1 rounded transition-all",
          selected === "down" 
            ? "text-destructive" 
            : "text-muted-foreground/40 hover:text-destructive/70"
        )}
        aria-label="Not helpful"
      >
        <ThumbsDown className={cn("w-3.5 h-3.5", selected === "down" && "fill-current")} />
      </button>
    </div>
  );
};
