import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerHeadsupFlag } from "@/hooks/usePartnerHeadsupFlag";
import {
  HEADSUP_UPDATED_EVENT, OPEN_CHAT_EVENT, loadPeople, pickHomePerson, startOnDemandDraft, type HeadsupPerson,
} from "@/lib/partnerHeadsupClient";

interface Props {
  userId: string;
  help: string[];
  skip: string[];
}

/** Home: today's top partner tip, addressed to her Partner (else most recent person). */
export function PartnerTodayCard({ userId, help, skip }: Props) {
  const visible = usePartnerHeadsupFlag(userId);
  const [person, setPerson] = useState<HeadsupPerson | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const load = async () => {
      const [ppl, { data: st }] = await Promise.all([
        loadPeople(userId),
        supabase.from("partner_headsup_settings").select("enabled").eq("user_id", userId).maybeSingle(),
      ]);
      setPerson(pickHomePerson(ppl));
      setEnabled(st ? st.enabled : true);
    };
    void load();
    globalThis.addEventListener(HEADSUP_UPDATED_EVENT, load);
    return () => globalThis.removeEventListener(HEADSUP_UPDATED_EVENT, load);
  }, [visible, userId]);

  if (!visible || !help[0]) return null;

  const send = async () => {
    setBusy(true);
    const id = await startOnDemandDraft(userId, { partnerTips: { help: help.slice(0, 2), skip: skip.slice(0, 1) }, personId: person?.id });
    setBusy(false);
    if (id) globalThis.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { focusMessageId: id } }));
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {person ? `For ${person.name} today` : "For someone close to you"}
        </p>
        <p className="text-sm text-foreground mt-1">{help[0]}</p>
      </div>
      {enabled && (
        <button
          onClick={() => void send()}
          disabled={busy}
          aria-label="Send"
          className="headsup-primary min-h-[40px] rounded-full px-4 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" /> Send
        </button>
      )}
    </div>
  );
}
