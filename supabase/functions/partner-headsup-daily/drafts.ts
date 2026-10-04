// deno-lint-ignore-file no-explicit-any
// Scheduled drafts, period-shift updates, expiry and check-ins for one user. Called hourly per user.
import { addDays, cycleConfidence, harderWindow, isHardToPredict, localParts, sendPush, weekdayOf } from "../_shared/partnerHeadsup.ts";

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

/** Once per cycle when date-based heads-ups pause; once when the cycle steadies again. */
async function postPredictStateChange(admin: any, uid: string, name: string, hard: boolean, cycleStart: string | null) {
  const { data: last } = await admin.from("chat_messages").select("metadata").eq("user_id", uid)
    .in("metadata->>partner_headsup", ["predict_paused", "predict_resume_ask"]).order("created_at", { ascending: false }).limit(1);
  const lastKind = last?.[0]?.metadata?.partner_headsup ?? null;
  if (hard) {
    if (lastKind === "predict_paused" && last[0].metadata?.cycle_start === cycleStart) return;
    // Not before she ever had date-based heads-ups working: only announce when it changes or a new cycle begins while paused.
    if (lastKind === null) {
      const { data: s } = await admin.from("partner_headsup_settings").select("created_at").eq("user_id", uid).maybeSingle();
      if (s && Date.now() - new Date(s.created_at).getTime() < 86400000) return; // "All set" already explained it.
    }
    await admin.from("chat_messages").insert({
      user_id: uid, role: "assistant", message_type: "text",
      content: `Your cycle is running longer than usual, so I've paused date-based heads-ups for ${name}. When you tell me things are tough, I'll offer to write something instead.`,
      metadata: { partner_headsup: "predict_paused", cycle_start: cycleStart },
    });
  } else if (lastKind === "predict_paused") {
    await admin.from("chat_messages").insert({
      user_id: uid, role: "assistant", message_type: "partner_headsup_resume",
      content: "Your cycle looks steadier. Want me to start getting heads-ups ready ahead of time again?",
      metadata: { partner_headsup: "predict_resume_ask" },
    });
  }
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
    const hard = await isHardToPredict(admin, uid, local.date);
    await postPredictStateChange(admin, uid, name, hard, p.last_period_start);
    const win = harderWindow(p.last_period_start, p.cycle_length_days, local.date);
    if (!paused && win && !hard && s.offer_before_harder_days !== false) {
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
            } else if (s.include_mood) {
              // The draft card itself asks "what feels hardest this time?" first.
              await admin.from("chat_messages").insert({
                user_id: uid, role: "assistant", message_type: "partner_headsup_draft", content: `Draft for ${name}`,
                metadata: { event_id: ev.id, mode: "predicted", kind: "scheduled" },
              });
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
