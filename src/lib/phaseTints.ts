// Phase tints for cycle data only (calendar, phase breakdown bar, phase chips).
// Never use these on cards, buttons or headings.
export const PHASE_TINTS: Record<string, { label: string; fill: string; ink: string }> = {
  Menstruation: { label: "Period", fill: "var(--tint-men-fill)", ink: "var(--tint-men-ink)" },
  Follicular: { label: "Follicular", fill: "var(--tint-fol-fill)", ink: "var(--tint-fol-ink)" },
  Ovulation: { label: "Ovulation", fill: "var(--tint-ovu-fill)", ink: "var(--tint-ovu-ink)" },
  Luteal: { label: "Luteal", fill: "var(--tint-lut-fill)", ink: "var(--tint-lut-ink)" },
};

export const PHASE_ORDER = ["Menstruation", "Follicular", "Ovulation", "Luteal"] as const;

export const halfFill = (fill: string) => `color-mix(in srgb, ${fill} 50%, transparent)`;
