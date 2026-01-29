import { useState } from "react";
import { Sparkles } from "lucide-react";

type SleepQuality = "poorly" | "alright" | "well";

const sleepOptions: { value: SleepQuality; emoji: string; label: string }[] = [
  { value: "poorly", emoji: "😫", label: "Poorly" },
  { value: "alright", emoji: "🙂", label: "Alright" },
  { value: "well", emoji: "😊", label: "Well" },
];

export function SleepCheckIn() {
  const [selected, setSelected] = useState<SleepQuality | null>(null);

  return (
    <div className="bg-logan-graphite rounded-2xl p-5 border border-logan-slate/20">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-logan-slate/20 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-logan-cyan" />
        </div>
        <div className="flex-1">
          <p className="text-logan-frost font-medium mb-3">How'd you sleep last night?</p>
          <div className="flex gap-2">
            {sleepOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelected(option.value)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                  selected === option.value
                    ? "bg-logan-cyan text-logan-jet"
                    : "bg-logan-slate/30 text-logan-frost/80 hover:bg-logan-slate/50"
                }`}
              >
                <span>{option.emoji}</span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
