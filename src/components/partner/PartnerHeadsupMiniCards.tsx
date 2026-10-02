import { trackedSupabase } from "@/lib/messageFailures";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HEADSUP_UPDATED_EVENT } from "@/lib/partnerHeadsupClient";
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
