// deno-lint-ignore-file no-explicit-any
// Shared partner heads-up helpers (server). Window logic mirrors src/lib/partnerHeadsup.ts.

export const HEADSUP_FOOTER = "Sent with Logan. asklogan.ai";

export const HELP_PHRASES: Record<string, string> = {
  dinner: "taking dinner off my plate",
  patience: "a bit of extra patience",
  space: "space without asking why",
  hug: "a hug",
  kids: "help with the kids",
};

export function helpPhrase(v: string): string {
  return HELP_PHRASES[v] ?? v.trim();
}

/** Local date (YYYY-MM-DD) and hour for an IANA zone; falls back to UTC if invalid. */
export function localParts(tz: string | null | undefined, now = new Date()): { date: string; hour: number } {
  try {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
    const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
  } catch {
    return { date: now.toISOString().slice(0, 10), hour: now.getUTCHours() };
  }
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/**
 * Harder stretch: 3 days before predicted next period start through day 2 of the period.
 * Returns the current window if today is inside it, otherwise the next upcoming one.
 */
export function harderWindow(lastPeriodStart: string | null, cycleLen: number | null, localToday: string):
  { start: string; end: string; periodStart: string } | null {
  if (!lastPeriodStart || !cycleLen || !/^\d{4}-\d{2}-\d{2}$/.test(lastPeriodStart)) return null;
  let next = lastPeriodStart;
  let guard = 0;
  // Advance until the window end (period day 2) is today or later.
  while (addDays(next, 1) < localToday && guard < 60) { next = addDays(next, cycleLen); guard++; }
  if (next === lastPeriodStart) next = addDays(next, cycleLen); // the logged period itself is not "next"
  return { start: addDays(next, -3), end: addDays(next, 1), periodStart: next };
}

/** Low confidence: fewer than 2 completed cycles, or cycle-length SD over 5 days. */
export async function cycleConfidence(admin: any, userId: string): Promise<{ low: boolean; n: number }> {
  const { data: p } = await admin.from("participants").select("id").eq("user_id", userId).maybeSingle();
  if (!p?.id) return { low: true, n: 0 };
  const { data: rows } = await admin.from("cycle_history").select("cycle_length_days")
    .eq("participant_id", p.id).order("cycle_start_date", { ascending: false }).limit(6);
  const lens = (rows ?? []).map((r: any) => Number(r.cycle_length_days)).filter((x: number) => x > 0);
  if (lens.length < 2) return { low: true, n: lens.length };
  const mean = lens.reduce((a: number, b: number) => a + b, 0) / lens.length;
  const sd = Math.sqrt(lens.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / lens.length);
  return { low: sd > 5, n: lens.length };
}

const GATEWAY = "https://connector-gateway.lovable.dev/firebase_messaging";

/** Sends a browser push to every saved device. Stale tokens are removed. Never include health words. */
export async function sendPush(admin: any, userId: string, title: string, body: string): Promise<boolean> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const fcmKey = Deno.env.get("FIREBASE_MESSAGING_API_KEY");
  if (!lovableKey || !fcmKey) { console.error("[push] not configured"); return false; }
  const { data: tokens } = await admin.from("push_tokens").select("id, token").eq("user_id", userId);
  let any = false;
  for (const t of tokens ?? []) {
    const res = await fetch(`${GATEWAY}/v1/projects/_/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": fcmKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: t.token,
          notification: { title, body },
          webpush: { fcm_options: { link: "https://asklogan.ai/" } },
          data: { path: "/" },
        },
      }),
    });
    if (res.ok) { any = true; continue; }
    const txt = await res.text();
    console.error(`[push] send failed [${res.status}]: ${txt}`);
    if (res.status === 404 || (res.status === 400 && /INVALID_ARGUMENT|UNREGISTERED/.test(txt))) {
      await admin.from("push_tokens").delete().eq("id", t.id);
    }
  }
  return any;
}
