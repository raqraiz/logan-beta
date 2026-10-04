import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { toE164 } from "@/lib/partnerHeadsup";
import { HEADSUP_UPDATED_EVENT, loadPeople, type HeadsupPerson } from "@/lib/partnerHeadsupClient";

interface Props {
  userId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

type EventRow = { id: string; window_start: string; status: string; outcome: string | null; recipient_name: string | null; focus: string[] | null };
const STATUS_LABEL: Record<string, string> = { opened: "Sent", skipped: "Skipped", expired: "Missed" };
const OUTCOME_LABEL: Record<string, string> = { helped: "Sent. It helped", no_difference: "Sent. No real difference", didnt_land: "Sent. Didn't land well" };
const historyLabel = (e: EventRow) => {
  let base = (e.status === "opened" && e.outcome && OUTCOME_LABEL[e.outcome]) || STATUS_LABEL[e.status];
  if (e.status === "opened" && e.recipient_name) base = base.replace(/^Sent/, `Sent to ${e.recipient_name}`);
  if (e.status !== "opened" || !e.focus?.length) return base;
  const f = e.focus.map((x, i) => (i === 0 ? x : x.charAt(0).toLowerCase() + x.slice(1))).join(", ");
  return `${base} · ${f}`;
};
const input = "w-full min-h-[44px] rounded-full border border-border/60 bg-background/60 px-4 text-sm outline-none focus:border-[hsl(var(--headsup-accent))]";
const ghost = "min-h-[40px] rounded-full border border-border/60 px-4 text-sm font-medium hover:bg-card transition-colors disabled:opacity-40";

export function PartnerHeadsupManage({ userId, open, onOpenChange }: Props) {
  const [enabled, setEnabled] = useState(true);
  const [people, setPeople] = useState<HeadsupPerson[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null); // person id or "new"
  const [nameIn, setNameIn] = useState("");
  const [phoneIn, setPhoneIn] = useState("");
  const [relIn, setRelIn] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = async () => {
    const [{ data: st }, ppl, { data: ev }] = await Promise.all([
      supabase.from("partner_headsup_settings").select("enabled").eq("user_id", userId).maybeSingle(),
      loadPeople(userId),
      supabase.from("partner_headsup_events").select("id, window_start, status, outcome, recipient_name, focus").eq("user_id", userId)
        .in("status", ["opened", "skipped", "expired"]).order("window_start", { ascending: false }).limit(50),
    ]);
    setEnabled(st ? st.enabled : true);
    setPeople(ppl);
    setEvents((ev ?? []) as EventRow[]);
  };
  useEffect(() => { if (open) void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  const setOn = async (v: boolean) => {
    setEnabled(v);
    const { error } = await supabase.from("partner_headsup_settings").upsert({ user_id: userId, enabled: v }, { onConflict: "user_id" });
    if (error) toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    globalThis.dispatchEvent(new CustomEvent(HEADSUP_UPDATED_EVENT));
  };

  const startEdit = (p: HeadsupPerson | null) => {
    setEditing(p?.id ?? "new");
    setNameIn(p?.name ?? "");
    setPhoneIn(p?.whatsapp_number ?? "");
    setRelIn(p?.relationship ?? null);
  };

  const savePerson = async () => {
    const n = nameIn.trim();
    if (!n) return;
    let num: string | null = null;
    if (phoneIn.trim()) {
      num = toE164(phoneIn);
      if (!num) { toast({ title: "Add the country code", description: "For example +44 or +972." }); return; }
    }
    const { error } = editing === "new"
      ? await supabase.from("headsup_people").insert({ user_id: userId, name: n, whatsapp_number: num, relationship: relIn })
      : await supabase.from("headsup_people").update({ name: n, whatsapp_number: num, relationship: relIn }).eq("id", editing!);
    if (error) { toast({ title: "Couldn't save", description: error.message, variant: "destructive" }); return; }
    setEditing(null);
    setPeople(await loadPeople(userId));
  };

  const deletePerson = async (id: string) => {
    await supabase.from("headsup_people").delete().eq("id", id);
    setEditing(null);
    setPeople(await loadPeople(userId));
  };

  const deleteAll = async () => {
    await supabase.from("partner_headsup_events").delete().eq("user_id", userId);
    await supabase.from("partner_headsup_style_examples").delete().eq("user_id", userId);
    await supabase.from("headsup_people").delete().eq("user_id", userId);
    await supabase.from("partner_headsup_settings").delete().eq("user_id", userId);
    await supabase.from("partner_headsup_settings").insert({ user_id: userId, enabled: false });
    globalThis.dispatchEvent(new CustomEvent(HEADSUP_UPDATED_EVENT));
    onOpenChange(false);
  };

  const sentCount = events.filter((e) => e.status === "opened").length;

  const editor = (
    <div className="pb-3 space-y-2">
      <input value={nameIn} onChange={(e) => setNameIn(e.target.value)} placeholder="Name" maxLength={60} className={input} autoFocus />
      <input value={phoneIn} onChange={(e) => setPhoneIn(e.target.value)} placeholder="WhatsApp number (optional), e.g. +44 7700 900123" inputMode="tel" className={input} />
      <div className="flex flex-wrap gap-2">
        <button className={ghost} disabled={!nameIn.trim()} onClick={() => void savePerson()}>Save</button>
        <button className={ghost} onClick={() => setEditing(null)}>Cancel</button>
        {editing !== "new" && (
          <button className="min-h-[40px] rounded-full px-4 text-sm text-destructive hover:bg-destructive/10" onClick={() => void deletePerson(editing!)}>Delete</button>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="headsup-surface headsup-solid sm:max-w-md max-h-[92vh] overflow-y-auto rounded-[20px] space-y-4">
        <DialogTitle className="headsup-headline text-[32px] leading-tight">Heads-ups</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          When you tell me things are tough, I'll offer to help you tell someone close.
        </DialogDescription>

        {showHistory ? (
          <div className="space-y-3">
            <button className="text-sm text-muted-foreground" onClick={() => setShowHistory(false)}>‹ Back</button>
            <h4 className="text-sm font-medium">History</h4>
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="space-y-1">
                {events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{new Date(`${e.window_start}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    <span className="text-right text-muted-foreground">{historyLabel(e)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">Logan keeps the date, who it was for, and what it was about. Messages aren't stored after you send them, except your last few edits, which help drafts sound like you.</p>
          </div>
        ) : (
          <>
            <div className="rounded-[20px] border border-border/50 px-4 py-2">
              <div className="flex min-h-[48px] items-center justify-between">
                <span className="text-sm font-medium">Offer heads-ups</span>
                <Switch checked={enabled} onCheckedChange={(v) => void setOn(v)} />
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground">PEOPLE</h4>
              <div className="rounded-[20px] border border-border/50 px-4 py-1 divide-y divide-border/40">
                {people.map((p) => (
                  <div key={p.id}>
                    <button className="flex w-full min-h-[48px] items-center justify-between gap-3 py-2 text-left" onClick={() => (editing === p.id ? setEditing(null) : startEdit(p))}>
                      <span className="text-sm">{p.name}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">{p.whatsapp_number ? "WhatsApp saved · Edit" : "No number · Edit"}<ChevronRight className="h-4 w-4" /></span>
                    </button>
                    {editing === p.id && editor}
                  </div>
                ))}
                <div>
                  <button className="flex w-full min-h-[48px] items-center text-sm headsup-accent-text" onClick={() => (editing === "new" ? setEditing(null) : startEdit(null))}>+ Add someone</button>
                  {editing === "new" && editor}
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-border/50 px-4 py-1">
              <button className="flex w-full min-h-[48px] items-center justify-between" onClick={() => setShowHistory(true)}>
                <span className="text-sm">History</span>
                <span className="flex items-center gap-1 text-sm text-muted-foreground">{sentCount} sent<ChevronRight className="h-4 w-4" /></span>
              </button>
            </div>

            <button className="min-h-[44px] w-full rounded-full px-5 text-sm text-destructive hover:bg-destructive/10 transition-colors" onClick={() => void deleteAll()}>
              Turn off and delete history
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
