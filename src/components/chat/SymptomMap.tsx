import { cn } from "@/lib/utils";

interface SymptomMapProps {
  symptoms?: string[];
}

const SYMPTOM_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  emotional: { bg: "bg-[hsl(280,60%,95%)]", border: "border-[hsl(280,50%,75%)]", text: "text-[hsl(280,40%,35%)]" },
  physical: { bg: "bg-[hsl(350,60%,95%)]", border: "border-[hsl(350,50%,75%)]", text: "text-[hsl(350,40%,35%)]" },
  quirky: { bg: "bg-[hsl(40,70%,93%)]", border: "border-[hsl(40,55%,65%)]", text: "text-[hsl(40,45%,30%)]" },
};

const EMOTIONAL_SYMPTOMS = [
  "mood swings", "irritability", "anxiety", "crying spells", "brain fog",
  "low motivation", "feeling overwhelmed", "sadness", "emotional sensitivity",
  "restlessness", "anger", "depression"
];

const PHYSICAL_SYMPTOMS = [
  "cramps", "bloating", "headaches", "fatigue", "breast tenderness",
  "back pain", "acne", "insomnia", "nausea", "joint pain",
  "muscle aches", "dizziness", "hot flashes", "weight gain"
];

function categorize(symptom: string): "emotional" | "physical" | "quirky" {
  const lower = symptom.toLowerCase();
  if (EMOTIONAL_SYMPTOMS.some(s => lower.includes(s) || s.includes(lower))) return "emotional";
  if (PHYSICAL_SYMPTOMS.some(s => lower.includes(s) || s.includes(lower))) return "physical";
  return "quirky";
}

// Deterministic pseudo-random placement based on string
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export const SymptomMap = ({ symptoms }: SymptomMapProps) => {
  if (!symptoms || symptoms.length === 0) {
    return null;
  }

  const grouped = {
    emotional: symptoms.filter(s => categorize(s) === "emotional"),
    physical: symptoms.filter(s => categorize(s) === "physical"),
    quirky: symptoms.filter(s => categorize(s) === "quirky"),
  };

  const categoryLabels: Record<string, string> = {
    emotional: "😮‍💨 Emotional",
    physical: "🩹 Physical",
    quirky: "✨ Quirky",
  };

  const activeCategories = (Object.keys(grouped) as Array<keyof typeof grouped>).filter(
    k => grouped[k].length > 0
  );

  return (
    <div className="rounded-2xl overflow-hidden bg-card border border-border p-4 max-w-[300px] mx-auto space-y-3">
      <div className="text-center space-y-1">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
          Your symptom map
        </p>
        <p className="text-[11px] text-muted-foreground">
          {symptoms.length} symptom{symptoms.length !== 1 ? "s" : ""} tracked
        </p>
      </div>

      {/* Visual cluster */}
      <div className="relative w-full aspect-square max-w-[240px] mx-auto">
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center z-0">
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <span className="text-[9px] text-primary font-medium text-center leading-tight">Your<br/>Cycle</span>
          </div>
        </div>

        {/* Symptom bubbles */}
        {symptoms.map((symptom, i) => {
          const cat = categorize(symptom);
          const colors = SYMPTOM_COLORS[cat];
          const total = symptoms.length;
          const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
          const hash = hashStr(symptom);
          const radiusBase = 32 + (hash % 12);
          const x = 50 + Math.cos(angle) * radiusBase;
          const y = 50 + Math.sin(angle) * radiusBase;

          return (
            <div
              key={symptom}
              className={cn(
                "absolute px-2 py-1 rounded-full border text-[9px] font-medium whitespace-nowrap",
                "transform -translate-x-1/2 -translate-y-1/2 transition-all",
                colors.bg, colors.border, colors.text
              )}
              style={{
                left: `${x}%`,
                top: `${y}%`,
              }}
            >
              {symptom}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 justify-center pt-1">
        {activeCategories.map(cat => (
          <div key={cat} className="flex items-center gap-1">
            <div className={cn("w-2 h-2 rounded-full", SYMPTOM_COLORS[cat].bg, SYMPTOM_COLORS[cat].border, "border")} />
            <span className="text-[9px] text-muted-foreground">
              {categoryLabels[cat]} ({grouped[cat].length})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
