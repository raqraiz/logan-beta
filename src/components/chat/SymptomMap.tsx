interface SymptomMapProps {
  symptoms?: string[];
  anchorSymptom?: string;
  cycleDay?: number;
  cycleLengthDays?: number;
  phase?: string;
}

const PHASES = [
  { name: "Menstruation", color: "#EF4444" },
  { name: "Follicular", color: "#10B981" },
  { name: "Ovulation", color: "#F59E0B" },
  { name: "Luteal", color: "#8B5CF6" },
];

const SYMPTOM_TIMING: Record<string, Record<string, number>> = {
  "Rage spikes":        { Menstruation: 0.4, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.9 },
  "Anxiety spikes":     { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.9 },
  "Short fuse":         { Menstruation: 0.4, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.8 },
  "Sudden dread":       { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.8 },
  "Feeling overwhelmed":{ Menstruation: 0.6, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.9 },
  "Low stress tolerance":{ Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.8 },
  "Irritability":       { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.9 },
  "Brain fog":          { Menstruation: 0.6, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.7 },
  "Energy crashes":     { Menstruation: 0.8, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.7 },
  "Wired but tired":    { Menstruation: 0.3, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.8 },
  "Full body inflammation":{ Menstruation: 0.7, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.6 },
  "Nausea":             { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.3, Luteal: 0.4 },
  "Dizziness":          { Menstruation: 0.6, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.4 },
  "Migraines":          { Menstruation: 0.8, Follicular: 0.1, Ovulation: 0.3, Luteal: 0.7 },
  "Deep fatigue":       { Menstruation: 0.9, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.7 },
  "Knee pain":          { Menstruation: 0.6, Follicular: 0.2, Ovulation: 0.3, Luteal: 0.5 },
  "Chin or jaw acne breakouts":{ Menstruation: 0.4, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.8 },
  "Random shame spiral":{ Menstruation: 0.4, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.8 },
  "One stinky armpit":  { Menstruation: 0.2, Follicular: 0.3, Ovulation: 0.7, Luteal: 0.5 },
  "Mood swings":        { Menstruation: 0.6, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.9 },
  "Cravings":           { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.1, Luteal: 0.9 },
  "Bloating":           { Menstruation: 0.5, Follicular: 0.1, Ovulation: 0.2, Luteal: 0.8 },
};

const DEFAULT_TIMING: Record<string, number> = {
  Menstruation: 0.5, Follicular: 0.2, Ovulation: 0.2, Luteal: 0.7,
};

export const SymptomMap = ({ symptoms = [], anchorSymptom, cycleDay, phase }: SymptomMapProps) => {
  const targetSymptom = anchorSymptom || (symptoms.length > 0 ? symptoms[0] : null);
  const timing = targetSymptom ? (SYMPTOM_TIMING[targetSymptom] || DEFAULT_TIMING) : DEFAULT_TIMING;
  const peakEntry = Object.entries(timing).reduce((a, b) => b[1] > a[1] ? b : a, ["", 0]);
  const peakPhaseName = peakEntry[0];

  return (
    <div className="rounded-xl bg-card border border-border/50 p-4 space-y-3">
      {/* Header */}
      <p className="text-[10px] text-primary uppercase tracking-widest font-semibold text-center">
        {targetSymptom ? `When to expect: ${targetSymptom}` : "Symptom forecast"}
      </p>

      {/* Radial gauge rows */}
      <div className="space-y-2.5">
        {PHASES.map(p => {
          const intensity = timing[p.name] || 0;
          const isPeak = p.name === peakPhaseName;
          const isCurrent = p.name === phase;

          return (
            <div key={p.name} className="space-y-1">
              <div className="flex items-center justify-between">
                <span
                  className="text-[11px] font-medium"
                  style={{ color: isCurrent ? p.color : "hsl(210, 15%, 55%)" }}
                >
                  {p.name}
                  {isCurrent && cycleDay ? (
                    <span className="ml-1 text-[9px] opacity-70">day {cycleDay}</span>
                  ) : null}
                </span>
                {isPeak && (
                  <span
                    className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: `${p.color}20`, color: p.color }}
                  >
                    Peak
                  </span>
                )}
              </div>
              {/* Track */}
              <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: "hsl(220, 10%, 14%)" }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.max(intensity * 100, 4)}%`,
                    background: isPeak
                      ? `linear-gradient(90deg, ${p.color}90, ${p.color})`
                      : p.color,
                    opacity: 0.25 + intensity * 0.65,
                    boxShadow: isPeak ? `0 0 12px ${p.color}40` : "none",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Takeaway */}
      {targetSymptom && (
        <p className="text-[10px] text-muted-foreground text-center leading-snug">
          {peakPhaseName === "Luteal"
            ? `Typically strongest in the ~12 days before your period.`
            : peakPhaseName === "Menstruation"
              ? `Usually peaks during your period, then eases.`
              : `Tends to peak during ${peakPhaseName}.`}
        </p>
      )}
    </div>
  );
};
