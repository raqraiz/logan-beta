// Phase tints for cycle data only (calendar, phase breakdown bar, phase chips).
// Never use these on cards, buttons or headings.
export const PHASE_TINTS: Record<string, { label: string; fill: string; ink: string }> = {
  Menstruation: { label: "Period", fill: "rgba(255,46,146,0.16)", ink: "#C4247A" },
  Follicular: { label: "Follicular", fill: "rgba(162,43,232,0.12)", ink: "#8A34C9" },
  Ovulation: { label: "Ovulation", fill: "rgba(43,212,217,0.24)", ink: "#0B7479" },
  Luteal: { label: "Luteal", fill: "#EEE9DF", ink: "#6E675F" },
};

export const PHASE_ORDER = ["Menstruation", "Follicular", "Ovulation", "Luteal"] as const;
