import { supabase } from "@/integrations/supabase/client";

export type HeadsupRelationship = "partner" | "family" | "friend";
export type HeadsupTiming = "evening_before" | "morning_of";

export const HEADSUP_HELP_OPTIONS: { value: string; label: string; phrase: string }[] = [
  { value: "dinner", label: "Taking dinner off my plate", phrase: "taking dinner off my plate" },
  { value: "patience", label: "Extra patience", phrase: "a bit of extra patience" },
  { value: "space", label: "Space without asking why", phrase: "space without asking why" },
  { value: "hug", label: "A hug", phrase: "a hug" },
  { value: "kids", label: "Help with the kids", phrase: "help with the kids" },
];

export const HEADSUP_OPEN_EVENT = "logan:open-headsup-setup";

export interface HeadsupSettingsRow {
  user_id: string;
  partner_name: string | null;
  relationship: HeadsupRelationship | null;
  whatsapp_number: string | null;
  helps: string[];
  timing: HeadsupTiming;
  include_dates: boolean;
  include_mood: boolean;
  include_helps: boolean;
  include_footer: boolean;
  enabled: boolean;
  paused_until: string | null;
  consent_at: string | null;
}

/** Normalise a typed phone number to E.164. Requires a country code. */
export function toE164(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let digits = trimmed.replace(/[\s\-().]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (!/^\+[1-9]\d{6,14}$/.test(digits)) return null;
  return digits;
}

function helpPhrase(value: string): string {
  const known = HEADSUP_HELP_OPTIONS.find((o) => o.value === value);
  if (known) return known.phrase;
  const t = value.trim();
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Next harder stretch: the 4 days before her next predicted period. */
export function nextHarderWindow(
  lastPeriodStart: string | null | undefined,
  cycleLengthDays: number | null | undefined,
): { start: Date; end: Date } | null {
  if (!lastPeriodStart || !cycleLengthDays || !/^\d{4}-\d{2}-\d{2}$/.test(lastPeriodStart)) return null;
  const [y, m, d] = lastPeriodStart.split("-").map(Number);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const next = new Date(y, m - 1, d, 12);
  let guard = 0;
  while (next.getTime() - 4 * 86400000 < today.getTime() && guard < 60) {
    next.setDate(next.getDate() + cycleLengthDays);
    guard++;
  }
  const start = new Date(next);
  start.setDate(start.getDate() - 4);
  const end = new Date(next);
  end.setDate(end.getDate() - 1);
  return { start, end };
}

const WEEKDAY = (d: Date) => d.toLocaleDateString("en-US", { weekday: "long" });

export interface ExampleInput {
  name: string;
  relationship: HeadsupRelationship | null;
  helps: string[];
  includeDates: boolean;
  includeMood: boolean;
  includeHelps: boolean;
  window?: { start: Date; end: Date } | null;
}

export function buildExampleMessage(i: ExampleInput): string {
  const greeting = i.relationship === "partner" ? "Hey love" : `Hey ${i.name.trim() || "there"}`;
  const parts: string[] = [`${greeting}, a heads-up from me.`];
  if (i.includeDates) {
    const range = i.window
      ? `from about ${WEEKDAY(i.window.start)} to ${WEEKDAY(i.window.end)}`
      : "from about Thursday to Sunday";
    parts.push(`The next few days, ${range}, are usually my harder stretch.`);
  } else {
    parts.push("The next few days are usually my harder stretch.");
  }
  if (i.includeMood) parts.push("Lower energy, shorter fuse. It's not about you.");
  if (i.includeHelps && i.helps.length > 0) {
    parts.push(`What helps: ${joinList(i.helps.map(helpPhrase))}.`);
  }
  return parts.join(" ");
}

export const HEADSUP_FOOTER = "Sent with Logan. asklogan.ai";

/** Eligible once she has at least one completed cycle. */
export async function hasCompletedCycle(userId: string): Promise<boolean> {
  const { data: p } = await supabase.from("participants").select("id").eq("user_id", userId).maybeSingle();
  if (!p?.id) return false;
  const { count } = await supabase
    .from("cycle_history")
    .select("id", { count: "exact", head: true })
    .eq("participant_id", p.id);
  return (count ?? 0) >= 1;
}

export function headsupStatus(row: Pick<HeadsupSettingsRow, "enabled" | "paused_until"> | null): "Off" | "On" | "Paused" {
  if (!row || !row.enabled) return "Off";
  if (row.paused_until) {
    const today = new Date().toLocaleDateString("en-CA");
    if (row.paused_until >= today) return "Paused";
  }
  return "On";
}
