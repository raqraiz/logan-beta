import { supabase } from "@/integrations/supabase/client";

export const HEADSUP_UPDATED_EVENT = "logan:headsup-updated";
export const OPEN_CHAT_EVENT = "logan:open-chat";
export const PREFILL_CHAT_EVENT = "logan:prefill-chat";

const iso = (d: Date) => d.toLocaleDateString("en-CA");
function addDays(s: string, n: number) {
  const d = new Date(`${s}T12:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
}

export function whatsappUrl(text: string, number: string | null | undefined): string {
  const digits = (number ?? "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function shareSheet(text: string): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  if ("share" in navigator) {
    try { await navigator.share({ text }); return true; } catch { return false; }
  }
  try { await (navigator as Navigator).clipboard.writeText(text); } catch { /* ignore */ }
  return false;
}

export type HeadsupDraftResponse = { text: string; opening: number };

export async function generateDraft(body: { name?: string; focus?: string[]; avoid_opening?: number }): Promise<HeadsupDraftResponse> {
  const { data, error } = await supabase.functions.invoke("partner-headsup-draft", { body: { action: "generate", ...body } });
  if (error) {
    let msg = "Couldn't write the draft. Try again.";
    try { const ctx = (error as { context?: Response }).context; if (ctx) msg = (await ctx.json()).error ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data as HeadsupDraftResponse;
}

export async function saveStyleExample(text: string) {
  await supabase.functions.invoke("partner-headsup-draft", { body: { action: "save_style", text } });
}

export type HeadsupPerson = { id: string; name: string; whatsapp_number: string | null; last_used_at: string | null; relationship?: string | null };
export async function loadPeople(userId: string): Promise<HeadsupPerson[]> {
  const { data } = await supabase.from("headsup_people").select("id, name, whatsapp_number, last_used_at, relationship").eq("user_id", userId)
    .order("last_used_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  return (data ?? []) as HeadsupPerson[];
}

/** Opens a link (e.g. WhatsApp) via a real <a target="_blank" rel="noopener noreferrer">; falls back to same-window navigation. */
export function openTopLevel(url: string) {
  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    window.location.href = url;
  }
}

/** Home "For X today": her saved Partner first, else the most recently used person. */
export function pickHomePerson(people: HeadsupPerson[]): HeadsupPerson | null {
  return people.find((p) => p.relationship === "partner") ?? people[0] ?? null;
}

export type PartnerTips = { help: string[]; skip: string[] };

export const FOCUS_OPTIONS = ["Low energy", "Short fuse", "Need quiet", "Feeling low"];
export const LAST_OPENING_KEY = "headsup-last-opening";
export const HEADSUP_FOCUS_KEY = (cacheKey: string) => `headsup-focus:${cacheKey}`;

/** Opens (or reopens) today's unfinished draft card in chat. Returns the chat message id. */
export async function startOnDemandDraft(userId: string, extra: { preselect?: string[]; partnerTips?: PartnerTips; personId?: string } = {}): Promise<string | null> {
  const { trackedSupabase } = await import("@/lib/messageFailures");
  const today = new Date().toLocaleDateString("en-CA");
  const { data: existing } = await supabase.from("partner_headsup_events").select("id")
    .eq("user_id", userId).eq("kind", "on_demand").eq("status", "drafted").eq("window_start", today)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing) {
    const { data: m } = await supabase.from("chat_messages").select("id").eq("user_id", userId)
      .eq("message_type", "partner_headsup_draft").eq("metadata->>event_id", existing.id).limit(1).maybeSingle();
    if (m?.id) return m.id;
  }
  let eventId = existing?.id;
  if (!eventId) {
    const { data: ev, error } = await supabase.from("partner_headsup_events").insert({
      user_id: userId, kind: "on_demand", window_start: today, window_end: today, status: "drafted",
    }).select("id").maybeSingle();
    if (error || !ev) return null;
    eventId = ev.id;
  }
  const { data: msg, error: mErr } = await trackedSupabase.from("chat_messages").insert({
    user_id: userId, role: "assistant", message_type: "partner_headsup_draft", content: "Here's a start. Change anything, it's yours.",
    metadata: { event_id: eventId, kind: "on_demand", preselect: (extra.preselect ?? []).slice(0, 2), ...(extra.partnerTips ? { partner_tips: extra.partnerTips } : {}), ...(extra.personId ? { person_id: extra.personId } : {}) },
  }).select("id").maybeSingle();
  if (mErr || !msg) return null;
  return msg.id;
}
