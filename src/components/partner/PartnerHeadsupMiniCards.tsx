import { trackedSupabase } from "@/lib/messageFailures";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OPEN_CHAT_EVENT, startOnDemandDraft } from "@/lib/partnerHeadsupClient";

const chip = "min-h-[44px] px-4 rounded-full border border-border/60 bg-card/60 text-sm font-medium text-foreground hover:bg-card transition-colors disabled:opacity-40";

const say = (userId: string, content: string, metadata: Record<string, string> = {}) =>
  trackedSupabase.from("chat_messages").insert({ user_id: userId, role: "assistant", message_type: "text", content, metadata });

/** Legacy "How did the heads-up land?" chips (older messages only). */
export function PartnerHeadsupCheckinCard({ userId, eventId }: { userId: string; eventId: string }) {
  const [outcome, setOutcome] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    supabase.from("partner_headsup_events").select("outcome").eq("id", eventId).maybeSingle().then(({ data }) => setOutcome(data ? data.outcome : "gone"));
  }, [eventId]);
  if (outcome === undefined || outcome) return null;
  const pick = async (o: "helped" | "no_difference" | "didnt_land") => {
    setOutcome(o);
    await supabase.from("partner_headsup_events").update({ outcome: o }).eq("id", eventId);
    await say(userId, o === "helped" ? "Good to hear." : o === "no_difference" ? "Thanks for telling me. Next time I can try something shorter or more specific." : "I'm sorry it didn't land. What happened?", { partner_headsup: `checkin_${o}` });
  };
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button className={chip} onClick={() => pick("helped")}>It helped</button>
      <button className={chip} onClick={() => pick("no_difference")}>No real difference</button>
      <button className={chip} onClick={() => pick("didnt_land")}>It didn't land well</button>
    </div>
  );
}

const seenKey = (id: string) => `headsup-chip-done:${id}`;
const isSeen = (id: string) => { try { return !!localStorage.getItem(seenKey(id)); } catch { return false; } };
const markSeen = (id: string) => { try { localStorage.setItem(seenKey(id), "1"); } catch { /* ignore */ } };

const openDraft = async (userId: string, preselect: string[] = []) => {
  const id = await startOnDemandDraft(userId, { preselect });
  if (id) globalThis.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { focusMessageId: id } }));
};

/** After Logan's reply to something tough: three chips, the first one bold. */
export function PartnerHeadsupOfferChips({ userId, messageId, name, preselect }: { userId: string; messageId: string; name: string | null; preselect: string[] }) {
  const [done, setDone] = useState(() => isSeen(messageId));
  if (done) return null;
  const finish = () => { markSeen(messageId); setDone(true); };
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button className={`${chip} font-semibold`} onClick={() => { finish(); void openDraft(userId, preselect); }}>
        {name ? `Write something for ${name}` : "Help me tell someone"}
      </button>
      <button className={chip} onClick={finish}>Talk it through</button>
      <button className={chip} onClick={() => { finish(); void say(userId, "I'm glad you said it. I'm here.", { partner_headsup: "just_say" }); }}>I just needed to say it</button>
    </div>
  );
}

/** Under the "can't prepare them ahead of time yet" reply. */
export function PartnerHeadsupWriteNowChip({ userId, messageId }: { userId: string; messageId: string }) {
  const [done, setDone] = useState(() => isSeen(messageId));
  if (done) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button className={chip} onClick={() => { markSeen(messageId); setDone(true); void openDraft(userId); }}>Write one now</button>
    </div>
  );
}
