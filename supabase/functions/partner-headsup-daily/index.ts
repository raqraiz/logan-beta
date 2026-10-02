// Hourly partner heads-up job (pg_cron). Offers may post on any run; part 2 drafts must use localParts() for local 18:00 / 08:00.
// Scheduled offer moments + scheduled drafts, expiry and check-ins (drafts.ts).
// Logan never messages the other person; offers are posted into her own chat only.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { partnerHeadsupAdminIds, partnerHeadsupFlagOn } from "../_shared/partnerHeadsupFlag.ts";
import { processHeadsups } from "./drafts.ts";

const MAX_USERS_PER_RUN = 1000;
// Scheduled offers only trigger on a romantic partner mention (family/friends can still ask or use Settings).
const REL = "partner|husband|wife|boyfriend|girlfriend|fianc[eé]e?|spouse";
// High-symptom day: 4-5 on a negative symptom she logged herself (symptom_logs only; trackers ignored).
const NEGATIVE_SYMPTOM_RE = /\b(pain|cramps?|cramping|headaches?|fatigue|low mood|anxiety|anxious|irritab\w*|bloat\w*|poor sleep|migraines?|insomnia|insomniac|sleepless\w*|can't sleep|trouble sleeping)\b/i;

/** Local date (YYYY-MM-DD) and hour for an IANA zone; falls back to UTC if invalid. Part 2 drafts fire at local 18:00 / 08:00. */
export function localParts(tz: string | null | undefined, now = new Date()): { date: string; hour: number } {
  try {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
    const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
  } catch {
    return { date: now.toISOString().slice(0, 10), hour: now.getUTCHours() };
  }
}
const PARTNER_PG = `\\mmy\\s+(${REL})\\M`;
const NAME_RE = new RegExp(`\\bmy\\s+(?:${REL})\\s*,?\\s+([A-Z][a-z]{1,20})\\b`);
const REL_RE = new RegExp(`\\bmy\\s+(${REL})\\b`, "i");

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }

/** Window start = 3 days before predicted next period (matches src/lib/partnerHeadsup.ts). */
function nextWindowStart(lastPeriodStart: string | null, cycleLen: number | null, localToday: string): Date | null {
  if (!lastPeriodStart || !cycleLen || !/^\d{4}-\d{2}-\d{2}$/.test(lastPeriodStart)) return null;
  const today = new Date(`${localToday}T12:00:00Z`);
  const next = new Date(`${lastPeriodStart}T12:00:00Z`);
  let guard = 0;
  while (next.getTime() - 3 * 86400000 < today.getTime() && guard < 60) {
    next.setUTCDate(next.getUTCDate() + cycleLen); guard++;
  }
  const start = new Date(next); start.setUTCDate(start.getUTCDate() - 3);
  return start;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const result = { checked: 0, offered_symptom: 0, offered_pre_window: 0, drafts: 0, updated: 0, expired: 0, checkins: 0, pushes: 0 };
  try {
    const flagOn = await partnerHeadsupFlagOn(admin);
    let q = admin.from("participants").select("user_id, last_period_start, cycle_length_days, timezone").not("user_id", "is", null).limit(MAX_USERS_PER_RUN);
    if (!flagOn) {
      const ids = [...(await partnerHeadsupAdminIds(admin))];
      if (ids.length === 0) return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      q = q.in("user_id", ids);
    }
    const { data: people, error } = await q;
    if (error) throw error;

    const since = new Date(Date.now() - 26 * 3600000).toISOString();

    for (const p of people ?? []) {
      result.checked++;
      const uid = p.user_id as string;
      const local = localParts(p.timezone);
      try { await processHeadsups(admin, p as any, result); } catch (e) { console.error("[partner-headsup-daily] drafts failed", uid, e); }

      // Heads-ups must be off.
      const { data: hs } = await admin.from("partner_headsup_settings").select("enabled").eq("user_id", uid).maybeSingle();
      if (hs?.enabled) continue;

      // Never during onboarding.
      const { data: done } = await admin.from("chat_messages").select("id").eq("user_id", uid).eq("role", "assistant")
        .contains("metadata", { onboarding_complete: true }).limit(1);
      if (!done?.length) continue;

      // At most once every 2 cycles (shared with the in-chat offer).
      const gapDays = Math.max(2 * (p.cycle_length_days || 28), 28);
      const { data: recent } = await admin.from("chat_messages").select("id").eq("user_id", uid)
        .eq("message_type", "partner_headsup_offer")
        .gte("created_at", new Date(Date.now() - gapDays * 86400000).toISOString()).limit(1);
      if (recent?.length) continue;

      // Has she mentioned a close person in chat?
      const { data: mention } = await admin.from("chat_messages").select("content").eq("user_id", uid).eq("role", "user")
        .filter("content", "imatch", PARTNER_PG).order("created_at", { ascending: false }).limit(1);
      if (!mention?.length) continue;

      let trigger: "high_symptom_day" | "pre_window" | null = null;

      // Moment 1: logged a high-symptom day (any symptom 4+) since the last run.
      const { data: logs } = await admin.from("symptom_logs").select("symptoms").eq("user_id", uid).gte("created_at", since);
      const high = (logs ?? []).some((l: any) => Array.isArray(l.symptoms) && l.symptoms.some((s: any) => Number(s?.severity) >= 4 && NEGATIVE_SYMPTOM_RE.test(String(s?.name ?? ""))));
      if (high) trigger = "high_symptom_day";

      // Moment 2: existing users, once ever, 3 days before her next window.
      if (!trigger) {
        const ws = nextWindowStart(p.last_period_start, p.cycle_length_days, local.date);
        if (ws) {
          const offerDay = new Date(ws); offerDay.setUTCDate(offerDay.getUTCDate() - 3);
          if (isoDay(offerDay) === local.date) {
            const { data: prior } = await admin.from("chat_messages").select("id").eq("user_id", uid)
              .contains("metadata", { partner_headsup_trigger: "pre_window" }).limit(1);
            if (!prior?.length) trigger = "pre_window";
          }
        }
      }
      if (!trigger) continue;

      const text = mention[0].content as string;
      const who = text.match(NAME_RE)?.[1] || (text.match(REL_RE) ? `your ${text.match(REL_RE)![1].toLowerCase()}` : "them");
      const { error: insErr } = await admin.from("chat_messages").insert({
        user_id: uid, role: "assistant", message_type: "partner_headsup_offer",
        content: `Want me to draft a short heads-up you can send ${who} before those days? You'll see every message first. Nothing goes to ${who} unless you send it.`,
        metadata: { partner_headsup_trigger: trigger },
      });
      if (insErr) { console.error("[partner-headsup-daily] insert failed", uid, insErr); continue; }
      if (trigger === "high_symptom_day") result.offered_symptom++; else result.offered_pre_window++;
    }
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[partner-headsup-daily] failed", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
