interface SymptomMapProps {
  symptoms?: string[];
  anchorSymptom?: string;
  cycleDay?: number;
  cycleLengthDays?: number;
  phase?: string;
}

const PHASES = [
  { name: "Menstruation", color: "#EF4444", startDay: 1, endDay: 5 },
  { name: "Follicular", color: "#10B981", startDay: 6, endDay: 13 },
  { name: "Ovulation", color: "#F59E0B", startDay: 14, endDay: 16 },
  { name: "Luteal", color: "#8B5CF6", startDay: 17, endDay: 28 },
];

// When each symptom typically peaks (phase name → intensity 0-1)
const SYMPTOM_TIMING: Record<string, Record<string, number>> = {
  // Emotional
  "Rage spikes":        { Menstruation: 0.4, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.9 },
  "Anxiety spikes":     { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.9 },
  "Short fuse":         { Menstruation: 0.4, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.8 },
  "Sudden dread":       { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.8 },
  "Feeling overwhelmed":{ Menstruation: 0.6, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.9 },
  "Low stress tolerance":{ Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.8 },
  "Irritability":       { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.9 },
  "Brain fog":          { Menstruation: 0.6, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.7 },
  // Physical
  "Energy crashes":     { Menstruation: 0.8, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.7 },
  "Wired but tired":    { Menstruation: 0.3, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.8 },
  "Full body inflammation":{ Menstruation: 0.7, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.6 },
  "Nausea":             { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.3, Luteal: 0.4 },
  "Dizziness":          { Menstruation: 0.6, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.4 },
  "Migraines":          { Menstruation: 0.8, Follicular: 0.1, Ovulation: 0.3, Luteal: 0.7 },
  "Deep fatigue":       { Menstruation: 0.9, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.7 },
  "Knee pain":          { Menstruation: 0.6, Follicular: 0.2, Ovulation: 0.3, Luteal: 0.5 },
  "Chin or jaw acne breakouts":{ Menstruation: 0.4, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.8 },
  // Quirky
  "Random shame spiral":{ Menstruation: 0.4, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.8 },
  "One stinky armpit":  { Menstruation: 0.2, Follicular: 0.3, Ovulation: 0.7, Luteal: 0.5 },
  "Mood swings":        { Menstruation: 0.6, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.9 },
  "Cravings":           { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.9 },
  "Bloating":           { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.8 },
};

// Fallback for unknown symptoms
const DEFAULT_TIMING: Record<string, number> = {
  Menstruation: 0.5, Follicular: 0.2, Ovulation: 0.2, Luteal: 0.7,
};

export const SymptomMap = ({ symptoms = [], anchorSymptom, cycleDay, phase }: SymptomMapProps) => {
  // Determine the symptom to highlight
  const targetSymptom = anchorSymptom || (symptoms.length > 0 ? symptoms[0] : null);
  const timing = targetSymptom ? (SYMPTOM_TIMING[targetSymptom] || DEFAULT_TIMING) : DEFAULT_TIMING;
  
  // Find the peak phase
  const peakPhase = Object.entries(timing).reduce((a, b) => b[1] > a[1] ? b : a, ["", 0]);

  return (
    <div className="rounded-xl bg-card border border-border p-3 space-y-2.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium text-center">
        {targetSymptom ? `When to expect: ${targetSymptom}` : "Symptom timing across your cycle"}
      </p>

      {/* Phase bars */}
      <div className="space-y-1.5">
        {PHASES.map(p => {
          const intensity = timing[p.name] || 0;
          const isCurrentPhase = phase === p.name;
          const isPeak = p.name === peakPhase[0];
          return (
            <div key={p.name} className="flex items-center gap-2">
              <span
                className="text-[9px] w-[72px] text-right font-medium flex-shrink-0"
                style={{ color: isCurrentPhase ? p.color : "hsl(var(--muted-foreground))" }}
              >
                {p.name}
                {isCurrentPhase && cycleDay ? ` (day ${cycleDay})` : ""}
              </span>
              <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ backgroundColor: `${p.color}10` }}>
                <div
                  className="h-full rounded-full flex items-center justify-end pr-1.5"
                  style={{
                    width: `${Math.max(intensity * 100, 6)}%`,
                    backgroundColor: p.color,
                    opacity: 0.2 + intensity * 0.6,
                  }}
                >
                  {intensity >= 0.5 && (
                    <span className="text-[7px] font-bold text-white drop-shadow-sm">
                      {isPeak ? "peak" : intensity >= 0.7 ? "high" : "mid"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Takeaway */}
      {targetSymptom && (
        <p className="text-[10px] text-muted-foreground text-center leading-snug">
          {peakPhase[0] === "Luteal"
            ? `${targetSymptom} typically hits hardest in the Luteal phase — the ~12 days before your period.`
            : peakPhase[0] === "Menstruation"
              ? `${targetSymptom} usually peaks during your period and eases as you move into the Follicular phase.`
              : `${targetSymptom} tends to show up most during ${peakPhase[0]}.`
          }
        </p>
      )}
    </div>
  );
};
