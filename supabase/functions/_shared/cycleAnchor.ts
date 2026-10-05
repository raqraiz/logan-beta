// Cycle anchor type: what participants.last_period_start represents.
// 'bleed'  = first day of a period. 'marker' = she marked a new cycle without a bleed.
// Copy and prompts only. Never feeds cycle math.
export type CycleAnchorType = "bleed" | "marker";

export function currentCycleAnchorType(p: unknown): CycleAnchorType {
  return (p as { cycle_anchor_type?: string } | null)?.cycle_anchor_type === "marker" ? "marker" : "bleed";
}

// Wording that means an actual bleed/period (not just "Day 1").
export const BLEED_WORDING_RE = /\b(period|periods|bleed|bleeding|bled|menstruat\w*|flow|tampon|pad)\b/i;

// Explicit "a new cycle started" phrasing with no bleed words.
export const CYCLE_MARKER_PHRASE_RE =
  /\b(new cycle (?:started|starting|has started|began|today)|(?:my )?cycle (?:is )?(?:re)?start(?:ed|ing)(?: again| over)?|(?:my )?pattern (?:is )?(?:re)?start(?:ed|ing)|start(?:ing)? (?:a )?new cycle|reset my cycle(?: without| with no)?)\b/i;

// Only for cycling users on hormonal birth control.
export function markerEligible(p: unknown): boolean {
  const r = p as { life_stage?: string; on_hormonal_bc?: boolean | null } | null;
  return !!r && r.life_stage === "cycling" && r.on_hormonal_bc === true;
}

export function anchorPromptRule(type: CycleAnchorType): string {
  if (type !== "marker") return "";
  return `\n\nCYCLE ANCHOR: Her current cycle start was a marker she set herself, not a bleed. Never call it her period, bleed, flow, or "Day 1 of your period". Say "since your cycle started" or "day X of your cycle". Don't assume she is bleeding in the early days. Don't call her late or overdue for a period.`;
}
