import { Sparkles, ThumbsUp, ThumbsDown, RefreshCw } from "lucide-react";
import { useState } from "react";

interface TodayInsightProps {
  dayNumber: number;
  userName: string;
}

export function TodayInsight({ dayNumber, userName }: TodayInsightProps) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const insight = `${userName}, you're entering the window where your self confidence usually shift. That's because energy naturally dips because your body is working hard behind the scenes. A 20-minute rest block can smooth out the rest of your day.`;

  return (
    <div className="bg-gradient-to-br from-logan-red/20 to-logan-red/10 rounded-2xl p-5 border border-logan-red/20">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-logan-slate/30 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-logan-cyan" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-logan-frost/50 font-medium">
            Today's Insight · Day {dayNumber}
          </p>
        </div>
      </div>

      <p className="text-logan-frost leading-relaxed mb-5">
        {insight}
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-logan-frost/50">Helpful?</span>
          <button
            onClick={() => setFeedback("up")}
            className={`p-2 rounded-lg transition-colors ${
              feedback === "up"
                ? "bg-logan-cyan/20 text-logan-cyan"
                : "text-logan-frost/50 hover:text-logan-frost hover:bg-logan-slate/30"
            }`}
          >
            <ThumbsUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => setFeedback("down")}
            className={`p-2 rounded-lg transition-colors ${
              feedback === "down"
                ? "bg-logan-red/20 text-logan-red"
                : "text-logan-frost/50 hover:text-logan-frost hover:bg-logan-slate/30"
            }`}
          >
            <ThumbsDown className="w-4 h-4" />
          </button>
        </div>

        <button className="flex items-center gap-2 text-sm text-logan-frost/50 hover:text-logan-frost transition-colors">
          <RefreshCw className="w-4 h-4" />
          <span>New</span>
        </button>
      </div>
    </div>
  );
}
