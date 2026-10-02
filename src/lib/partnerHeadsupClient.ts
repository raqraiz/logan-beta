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

/** Current harder window if today is inside it, otherwise the next one. Mirrors the server helper. */
export function currentOrNextWindow(last: string | null | undefined, len: number | null | undefined) {
  if (!last || !len || !/^\d{4}-\d{2}-\d{2}$/.test(last)) return null;
  const today = iso(new Date());
  let next = last;
  let guard = 0;
  while (addDays(next, 1) < today && guard < 60) { next = addDays(next, len); guard++; }
  const start = addDays(next, -3);
  const end = addDays(next, 1);
  const inside = start <= today && today <= end;
  const daysUntil = Math.round((new Date(`${start}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000);
  return { start, end, periodStart: next, inside, daysUntil };
}

/** Last day of the current cycle (day before the next predicted period). */
export function endOfCurrentCycle(last: string | null | undefined, len: number | null | undefined): string {
  const today = iso(new Date());
  if (!last || !len) return addDays(today, 28);
  let next = last;
  let guard = 0;
  while (next <= today && guard < 60) { next = addDays(next, len); guard++; }
  return addDays(next, -1);
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

export type HeadsupDraftResponse = {
  text: string;
  language: "en" | "he" | "es";
  user_language: "en" | "he" | "es";
  undated: boolean;
  cycles_used: number;
  window: { start: string; end: string; period_start: string } | null;
  cycle_length_days: number | null;
};

export async function generateDraft(body: Record<string, unknown>): Promise<HeadsupDraftResponse> {
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
