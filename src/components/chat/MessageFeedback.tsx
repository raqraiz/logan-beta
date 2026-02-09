import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageFeedbackProps {
  messageId: string;
  onFeedback: (messageId: string, isPositive: boolean) => void;
  existingReaction?: string | null;
  disabled?: boolean;
}

export const MessageFeedback = ({ 
  messageId, 
  onFeedback, 
  existingReaction,
  disabled = false 
}: MessageFeedbackProps) => {
  const [selected, setSelected] = useState<"up" | "down" | null>(() => {
    if (existingReaction === "👍") return "up";
    if (existingReaction === "👎") return "down";
    return null;
  });

  const handleFeedback = (type: "up" | "down") => {
    if (disabled || selected === type) return;
    setSelected(type);
    onFeedback(messageId, type === "up");
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleFeedback("up")}
        disabled={disabled || selected !== null}
        className={cn(
          "p-1 rounded transition-all",
          selected === "up" 
            ? "text-green-500" 
            : selected === null
              ? "text-muted-foreground/50 hover:text-green-500 hover:bg-green-500/10"
              : "text-muted-foreground/30 cursor-default"
        )}
        aria-label="Helpful"
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => handleFeedback("down")}
        disabled={disabled || selected !== null}
        className={cn(
          "p-1 rounded transition-all",
          selected === "down" 
            ? "text-red-500" 
            : selected === null
              ? "text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10"
              : "text-muted-foreground/30 cursor-default"
        )}
        aria-label="Not helpful"
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
