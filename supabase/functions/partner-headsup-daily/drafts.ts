// deno-lint-ignore-file no-explicit-any
// Scheduled drafts, period-shift updates, expiry and check-ins for one user. Called hourly per user.
import { addDays, cycleConfidence, harderWindow, localParts, sendPush, weekdayOf } from "../_shared/partnerHeadsup.ts";

type Person = { user_id: string; last_period_start: string | null; cycle_length_days: number | null; timezone: string | null };
export type DraftResult = { drafts: number; updated: number; expired: number; checkins: number; pushes: number };

async function postDraftCard(admin: any, uid: string, eventId: string, intro: string, mode: "predicted" | "undated", name: string, extra?: string) {
  await admin.from("chat_messages").insert({ user_id: uid, role: "assistant", message_type: "text", content: intro, metadata: { partner_headsup: "draft_intro", event_id: eventId } });
  await admin.from("chat_messages").insert({
    user_id: uid, role: "assistant", message_type: "partner_headsup_draft",
    content: `Draft for ${name}`,
    metadata: { event_id: eventId, mode, kind: "scheduled" },
  });
  if (extra) await admin.from("chat_messages").insert({ user_id: uid, role: "assistant", message_type: "text", content: extra, metadata: { partner_headsup: "draft_followup", event_id: eventId } });
}

export async function processHeadsups(admin: any, p: Person, r: DraftResult): Promise<void> {
  const uid = p.user_id;
  const local = localParts(p.timezone);

  // Expire drafts whose window has passed without being sent.
  const { data: stale } = await admin.from("partner_headsup_events").select("id")
    .eq("user_id", uid).eq("status", "drafted").lt("window_end", local.date);
  if (stale?.length) {
    await admin.from("partner_headsup_events").update({ status: "expired" }).in("id", stale.map((e: any) => e.id));
    r.expired += stale.length;
  }

  const { data: s } = await admin.from("partner_headsup_settings").select("*").eq("user_id", uid).maybeSingle();

  if (s?.enabled) {
    const name = s.partner_name || "them";

    // Period logged before the scheduled draft was sent: offer an updated draft.
    const { data: pending } = await admin.from("partner_headsup_events").select("*")
      .eq("user_id", uid).eq("kind", "scheduled").eq("status", "drafted");
    for (const ev of pending ?? []) {
      if (!p.last_period_start || !ev.predicted_period_start) continue;
      const loggedNewPeriod = p.last_period_start !== ev.predicted_period_start && p.last_period_start >= addDays(ev.window_start, -10);
      if (!loggedNewPeriod) continue;
      const newEnd = addDays(p.last_period_start, 1);
      await admin.from("partner_headsup_events").update({ status: "superseded" }).eq("id", ev.id);
      if (newEnd < local.date) {
        await admin.from("partner_headsup_events").insert({ user_id: uid, kind: "scheduled", window_start: addDays(p.last_period_start, -3), window_end: newEnd, predicted_period_start: p.last_period_start, status: "expired", recipient_name: s.partner_name });
        r.expired++;
        continue;
      }
      const { data: ne } = await admin.from("partner_headsup_events").insert({
        user_id: uid, kind: "scheduled", window_start: addDays(p.last_period_start, -3), window_end: newEnd,
        predicted_period_start: p.last_period_start, status: "drafted", low_confidence: true, recipient_name: s.partner_name,
      }).select("id").maybeSingle();
      if (ne?.id) {
        await postDraftCard(admin, uid, ne.id, `Your timing shifted, so here's an updated heads-up for ${name}.`, "undated", name);
        r.updated++;
      }
    }

    // Scheduled draft for the next window.
    const paused = s.paused_until && s.paused_until >= local.date;
    const win = harderWindow(p.last_period_start, p.cycle_length_days, local.date);
    if (!paused && win) {
      const targetDate = s.timing === "morning_of" ? win.start : addDays(win.start, -1);
      const targetHour = s.timing === "morning_of" ? 8 : 18;
      if (local.date === targetDate && local.hour >= targetHour) {
        const { data: existing } = await admin.from("partner_headsup_events").select("id")
          .eq("user_id", uid).eq("kind", "scheduled").eq("window_start", win.start).neq("status", "superseded").limit(1);
        const { data: recentOnDemand } = await admin.from("partner_headsup_events").select("id")
          .eq("user_id", uid).eq("kind", "on_demand").eq("status", "opened")
          .gte("window_start", addDays(win.start, -5)).lte("window_start", win.start).limit(1);
        if (!existing?.length && !recentOnDemand?.length) {
          const conf = await cycleConfidence(admin, uid);
          const { data: ev, error } = await admin.from("partner_headsup_events").insert({
            user_id: uid, kind: "scheduled", window_start: win.start, window_end: win.end,
            predicted_period_start: win.periodStart, status: "drafted", low_confidence: conf.low, recipient_name: s.partner_name,
          }).select("id").maybeSingle();
          if (!error && ev?.id) {
            if (conf.low) {
              await postDraftCard(admin, uid, ev.id,
                "Your timing has moved around lately, so I can't be sure when your harder days will land. Here's a version without exact dates.",
                "undated", name, "Or tell me how today feels, and I'll make it more specific.");
            } else {
              await postDraftCard(admin, uid, ev.id,
                `Your harder stretch usually starts around ${weekdayOf(win.start)}. Here's a heads-up for ${name}, written as you.`,
                "predicted", name);
            }
            r.drafts++;
            const pushed = await sendPush(admin, uid, `A heads-up for ${name} is ready`, "Have a look before you send it.");
            if (pushed) { r.pushes++; await admin.from("partner_headsup_events").update({ notified_at: new Date().toISOString() }).eq("id", ev.id); }
          }
        }
      }
    }
  }

  // Check-ins (no push). Scheduled: day after window ends; on-demand: 2 days later. Both at local 18:00.
  if (local.hour < 18) return;
  const { data: lastCheck } = await admin.from("partner_headsup_events").select("checkin_sent_at")
    .eq("user_id", uid).not("checkin_sent_at", "is", null).order("checkin_sent_at", { ascending: false }).limit(1);
  if (lastCheck?.[0] && Date.now() - new Date(lastCheck[0].checkin_sent_at).getTime() < 5 * 86400000) return;
  const { data: due } = await admin.from("partner_headsup_events").select("*")
    .eq("user_id", uid).eq("status", "opened").is("checkin_sent_at", null).is("outcome", null)
    .order("window_start", { ascending: false }).limit(5);
  for (const ev of due ?? []) {
    const dueDate = ev.kind === "scheduled" ? addDays(ev.window_end ?? ev.window_start, 1) : addDays(ev.window_start, 2);
    if (local.date < dueDate || local.date > addDays(dueDate, 3)) continue;
    const who = ev.recipient_name || s?.partner_name || "them";
    await admin.from("chat_messages").insert({
      user_id: uid, role: "assistant", message_type: "partner_headsup_checkin",
      content: `How did the heads-up land with ${who}?`, metadata: { event_id: ev.id },
    });
    await admin.from("partner_headsup_events").update({ checkin_sent_at: new Date().toISOString() }).eq("id", ev.id);
    r.checkins++;
    break;
  }
}
