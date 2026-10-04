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

export type HeadsupPerson = { id: string; name: string; whatsapp_number: string | null; last_used_at: string | null };
export async function loadPeople(userId: string): Promise<HeadsupPerson[]> {
  const { data } = await supabase.from("headsup_people").select("id, name, whatsapp_number, last_used_at").eq("user_id", userId)
    .order("last_used_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  return (data ?? []) as HeadsupPerson[];
}

/** Ask for browser notification permission and save this device. Call from a tap. */
export async function enableHeadsupPush(userId: string): Promise<"registered" | "not-configured" | "unsupported" | "open-in-new-tab" | "denied"> {
  const appId = import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID as string | undefined;
  const vapidKey = import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY as string | undefined;
  const config = {
    apiKey: import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY as string | undefined,
    projectId: import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID as string | undefined,
    appId,
    messagingSenderId: appId?.split(":")[1] ?? "",
  };
  if (!config.apiKey || !config.projectId || !appId || !vapidKey || !config.messagingSenderId) return "not-configured";
  const { isSupported, getMessaging, getToken } = await import("firebase/messaging");
  const { initializeApp, getApps } = await import("firebase/app");
  if (!("Notification" in window) || !(await isSupported())) return "unsupported";
  if (window.top !== window.self) return "open-in-new-tab";
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return "denied";
  const query = new URLSearchParams(config as Record<string, string>).toString();
  const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${query}`);
  const app = getApps()[0] ?? initializeApp(config as Record<string, string>);
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: reg });
  if (!token) return "denied";
  await supabase.from("push_tokens").upsert({ user_id: userId, token }, { onConflict: "token" });
  return "registered";
}

export const PUSH_STATUS_COPY: Record<string, string> = {
  registered: "Notifications are on for this device.",
  "not-configured": "",
  unsupported: "This browser can't show notifications. On iPhone, add Logan to your home screen first.",
  "open-in-new-tab": "Open Logan in its own tab to turn on notifications.",
  denied: "Notifications are blocked. You can allow them in your browser's site settings.",
};

/** True when browser push notifications are configured for this app. */
export function isPushConfigured() {
  const appId = import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID as string | undefined;
  return !!(appId && appId.split(":")[1] && import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY
    && import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY && import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID);
}

/** Opens a link (e.g. WhatsApp) in a top-level window, never inside the preview frame. */
export function openTopLevel(url: string) {
  const w = window.open(url, "_blank");
  if (w) { try { w.opener = null; } catch { /* ignore */ } return; }
  try { (window.top ?? window).location.href = url; } catch { window.location.href = url; }
}

export const FOCUS_OPTIONS = ["Low energy", "Short fuse", "Need quiet", "Feeling low"];
export const LAST_OPENING_KEY = "headsup-last-opening";
export const HEADSUP_FOCUS_KEY = (cacheKey: string) => `headsup-focus:${cacheKey}`;

/** Opens (or reopens) today's unfinished draft card in chat. Returns the chat message id. */
export async function startOnDemandDraft(userId: string, extra: { preselect?: string[] } = {}): Promise<string | null> {
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
    metadata: { event_id: eventId, kind: "on_demand", preselect: (extra.preselect ?? []).slice(0, 2) },
  }).select("id").maybeSingle();
  if (mErr || !msg) return null;
  return msg.id;
}
