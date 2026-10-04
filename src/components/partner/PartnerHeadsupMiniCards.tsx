import { trackedSupabase } from "@/lib/messageFailures";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HEADSUP_UPDATED_EVENT, OPEN_CHAT_EVENT, startOnDemandDraft } from "@/lib/partnerHeadsupClient";
import { HeadsupPreviewDialog } from "./PartnerHeadsupSetup";
import { PartnerHeadsupDraftCard } from "./PartnerHeadsupDraftCard";

const chip = "min-h-[44px] px-4 rounded-full border border-border/60 bg-card/60 text-sm font-medium text-foreground hover:bg-card transition-colors disabled:opacity-40";

const say = (userId: string, content: string, metadata: Record<string, string> = {}) =>
  trackedSupabase.from("chat_messages").insert({ user_id: userId, role: "assistant", message_type: "text", content, metadata });

/** "How did the heads-up land with [name]?" chips. */
export function PartnerHeadsupCheckinCard({ userId, eventId }: { userId: string; eventId: string }) {
  const [outcome, setOutcome] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    supabase.from("partner_headsup_events").select("outcome").eq("id", eventId).maybeSingle().then(({ data }) => setOutcome(data ? data.outcome : "gone"));
  }, [eventId]);
  if (outcome === undefined || outcome) return null;

  const pick = async (o: "helped" | "no_difference" | "didnt_land") => {
    setOutcome(o);
    await supabase.from("partner_headsup_events").update({ outcome: o }).eq("id", eventId);
    const reply = o === "helped"
      ? "Good to hear. I'll have the next one ready before your next harder stretch."
      : o === "no_difference"
      ? "Thanks for telling me. Want me to try a different approach next time, like shorter or more specific?"
      : "I'm sorry it didn't land. What happened? If you like, I can change the tone next time.";
    await say(userId, reply, { partner_headsup: `checkin_${o}` });
  };

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button className={chip} onClick={() => pick("helped")}>It helped</button>
      <button className={chip} onClick={() => pick("no_difference")}>No real difference</button>
      <button className={chip} onClick={() => pick("didnt_land")}>It didn't land well</button>
    </div>
  );
}

/** After 3 skips in a row: "Want me to keep making these?" */
export function PartnerHeadsupKeepCard({ userId }: { userId: string }) {
  const [done, setDone] = useState(false);
  if (done) return null;
  const yes = async () => { setDone(true); await say(userId, "Great, I'll keep them coming.", { partner_headsup: "keep_yes" }); };
  const no = async () => {
    setDone(true);
    await supabase.from("partner_headsup_settings").update({ enabled: false }).eq("user_id", userId);
    await say(userId, "Okay, I've turned heads-ups off. You can switch them back on in Settings anytime.", { partner_headsup: "keep_no" });
    globalThis.dispatchEvent(new CustomEvent(HEADSUP_UPDATED_EVENT));
  };
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button className={chip} onClick={yes}>Yes, keep going</button>
      <button className={chip} onClick={no}>No</button>
    </div>
  );
}

/** Right after turning on: "Want to send [name] one now?" */
export function PartnerHeadsupSendNowCard({ userId, cacheKey }: { userId: string; cacheKey: string }) {
  const [state, setState] = useState<"idle" | "draft" | "dismissed">("idle");
  if (state === "dismissed") return null;
  if (state === "draft") {
    return (
      <div className="headsup-surface mt-2 rounded-[20px] border border-border/50 bg-card/70 p-4">
        <PartnerHeadsupDraftCard userId={userId} cacheKey={cacheKey} mode="predicted" kind="on_demand" />
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button className={chip} onClick={() => setState("draft")}>Yes, draft it</button>
      <button className={chip} onClick={() => setState("dismissed")}>Wait until then</button>
    </div>
  );
}

const seenKey = (id: string) => `headsup-chip-done:${id}`;
const isSeen = (id: string) => { try { return !!localStorage.getItem(seenKey(id)); } catch { return false; } };
const markSeen = (id: string) => { try { localStorage.setItem(seenKey(id), "1"); } catch { /* ignore */ } };

/** Under the "All set" message: preview and write-now buttons. */
export function PartnerHeadsupAllSetCard({ userId, name }: { userId: string; name: string }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const writeNow = async () => {
    const id = await startOnDemandDraft(userId, name);
    if (id) globalThis.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { focusMessageId: id } }));
  };
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button className={chip} onClick={() => setPreviewOpen(true)}>See what {name} would get</button>
      <button className={chip} onClick={writeNow}>Write one now</button>
      <HeadsupPreviewDialog userId={userId} open={previewOpen} onOpenChange={setPreviewOpen} />
    </div>
  );
}

/** After she says it's a hard day (heads-ups on): three choices. */
export function PartnerHeadsupHardDayCard({ userId, messageId, name, preselect }: { userId: string; messageId: string; name: string; preselect: string[] }) {
  const [done, setDone] = useState(() => isSeen(messageId));
  if (done) return null;
  const finish = () => { markSeen(messageId); setDone(true); };
  const write = async () => {
    finish();
    await say(userId, "On it. From what you said, these sound hardest today. Change anything you like.", { partner_headsup: "hardday_write" });
    const id = await startOnDemandDraft(userId, name, { mode: "today", hard_day: true, preselect });
    if (id) globalThis.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { focusMessageId: id } }));
  };
  const justSay = async () => { finish(); await say(userId, "I'm glad you said it. I'm here.", { partner_headsup: "hardday_just_say" }); };
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button className={chip} onClick={finish}>Talk it through</button>
      <button className={chip} onClick={write}>Write something for {name}</button>
      <button className={chip} onClick={justSay}>I just needed to say it</button>
    </div>
  );
}

/** "Your cycle looks steadier..." Yes / Not yet. */
export function PartnerHeadsupResumeCard({ userId, messageId }: { userId: string; messageId: string }) {
  const [done, setDone] = useState(() => isSeen(messageId));
  if (done) return null;
  const pick = async (yes: boolean) => {
    markSeen(messageId); setDone(true);
    await supabase.from("partner_headsup_settings").update({ offer_before_harder_days: yes }).eq("user_id", userId);
    await say(userId, yes ? "Great. I'll have them ready ahead of time again." : "Okay. I'll keep offering when you tell me things are tough.", { partner_headsup: yes ? "resume_yes" : "resume_not_yet" });
    globalThis.dispatchEvent(new CustomEvent(HEADSUP_UPDATED_EVENT));
  };
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button className={chip} onClick={() => pick(true)}>Yes</button>
      <button className={chip} onClick={() => pick(false)}>Not yet</button>
    </div>
  );
}
