import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { HEADSUP_HELP_OPTIONS, toE164, type HeadsupSettingsRow } from "@/lib/partnerHeadsup";
import {
  HEADSUP_UPDATED_EVENT, OPEN_CHAT_EVENT, PUSH_STATUS_COPY, enableHeadsupPush, endOfCurrentCycle,
} from "@/lib/partnerHeadsupClient";

interface Props {
  userId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCloseSettings: () => void;
}

type EventRow = { id: string; window_start: string; status: string; outcome: string | null; kind: string };
const STATUS_LABEL: Record<string, string> = { opened: "Sent", skipped: "Skipped", expired: "Not sent", drafted: "Ready" };
const OUTCOME_LABEL: Record<string, string> = { helped: "It helped", no_difference: "No real difference", didnt_land: "Didn't land well" };
const chipCls = (on: boolean) =>
  `min-h-[40px] px-4 rounded-full border text-sm transition-colors ${on ? "headsup-chip-active" : "border-border/60 bg-card/60 hover:bg-card"}`;
const primary = "headsup-primary min-h-[44px] w-full rounded-full px-5 text-sm font-medium transition-opacity disabled:opacity-40";
const ghost = "min-h-[44px] w-full rounded-full border border-border/60 px-5 text-sm font-medium hover:bg-card transition-colors";

export function PartnerHeadsupManage({ userId, open, onOpenChange, onCloseSettings }: Props) {
  const [s, setS] = useState<HeadsupSettingsRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [editing, setEditing] = useState<null | "whatsapp" | "timing" | "helps" | "included">(null);
  const [phone, setPhone] = useState("");
  const [custom, setCustom] = useState("");

  const load = async () => {
    const [{ data: st }, { data: ev }] = await Promise.all([
      supabase.from("partner_headsup_settings").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("partner_headsup_events").select("id, window_start, status, outcome, kind").eq("user_id", userId)
        .neq("status", "superseded").order("window_start", { ascending: false }).limit(30),
    ]);
    setS(st as HeadsupSettingsRow | null);
    setPhone(st?.whatsapp_number ?? "");
    setEvents((ev ?? []) as EventRow[]);
  };
  useEffect(() => { if (open) void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  const patch = async (p: Partial<HeadsupSettingsRow>) => {
    if (!s) return;
    setS({ ...s, ...p });
    const { error } = await supabase.from("partner_headsup_settings").update(p).eq("user_id", userId);
    if (error) toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    globalThis.dispatchEvent(new CustomEvent(HEADSUP_UPDATED_EVENT));
  };

  const name = s?.partner_name || "them";

  const writeNow = async () => {
    const today = new Date().toLocaleDateString("en-CA");
    const { data: ev } = await supabase.from("partner_headsup_events").insert({
      user_id: userId, kind: "on_demand", window_start: today, window_end: today, status: "drafted", recipient_name: s?.partner_name,
    }).select("id").maybeSingle();
    await supabase.from("chat_messages").insert({
      user_id: userId, role: "assistant", message_type: "partner_headsup_draft", content: `Draft for ${name}`,
      metadata: { event_id: ev?.id, mode: "predicted", kind: "on_demand" },
    });
    onOpenChange(false);
    onCloseSettings();
    globalThis.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT));
  };

  const pause = async () => {
    const { data: pc } = await supabase.from("participants").select("last_period_start, cycle_length_days").eq("user_id", userId).maybeSingle();
    await patch({ paused_until: endOfCurrentCycle(pc?.last_period_start, pc?.cycle_length_days) });
  };

  const deleteAll = async () => {
    await supabase.from("partner_headsup_events").delete().eq("user_id", userId);
    await supabase.from("partner_headsup_style_examples").delete().eq("user_id", userId);
    await supabase.from("partner_headsup_settings").delete().eq("user_id", userId);
    globalThis.dispatchEvent(new CustomEvent(HEADSUP_UPDATED_EVENT));
    onOpenChange(false);
  };

  const notify = async () => {
    try { const r = await enableHeadsupPush(userId); toast({ title: "Notifications", description: PUSH_STATUS_COPY[r] }); }
    catch { toast({ title: "Notifications", description: "Couldn't turn on notifications." }); }
  };

  const paused = !!s?.paused_until && s.paused_until >= new Date().toLocaleDateString("en-CA");
  const helpLabel = (v: string) => HEADSUP_HELP_OPTIONS.find((o) => o.value === v)?.label ?? v;
  const toggleHelp = (v: string) => s && patch({ helps: s.helps.includes(v) ? s.helps.filter((h) => h !== v) : [...s.helps, v] });

  const Row = ({ label, value, k }: { label: string; value: string; k: NonNullable<typeof editing> }) => (
    <button className="flex w-full min-h-[48px] items-center justify-between gap-3 py-2 text-left" onClick={() => setEditing(editing === k ? null : k)}>
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-1 text-sm text-muted-foreground truncate">{value}<ChevronRight className="h-4 w-4 shrink-0" /></span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="headsup-surface sm:max-w-md max-h-[92vh] overflow-y-auto rounded-[20px] space-y-4">
        <DialogTitle className="headsup-headline text-[32px] leading-tight">Heads-ups for {name}</DialogTitle>
        <DialogDescription className="sr-only">Manage partner heads-ups</DialogDescription>
        {!s ? (
          <p className="text-sm text-muted-foreground">Heads-ups aren't set up.</p>
        ) : (
          <>
            <button className={primary} onClick={writeNow}>Write one now</button>

            <div className="rounded-[20px] border border-border/50 px-4 py-2 divide-y divide-border/40">
              <div className="flex min-h-[48px] items-center justify-between">
                <span className="text-sm font-medium">Heads-ups on</span>
                <Switch checked={s.enabled} onCheckedChange={(v) => patch({ enabled: v, ...(v ? { paused_until: null } : {}) })} />
              </div>
              <div>
                <Row label={`${name}'s WhatsApp`} value={s.whatsapp_number ?? "Not added"} k="whatsapp" />
                {editing === "whatsapp" && (
                  <div className="pb-3 space-y-2">
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44 7700 900123" inputMode="tel"
                      className="w-full min-h-[44px] rounded-full border border-border/60 bg-background/60 px-4 text-sm outline-none focus:border-[hsl(var(--headsup-accent))]" />
                    <button className={ghost} onClick={async () => {
                      if (!phone.trim()) { await patch({ whatsapp_number: null }); setEditing(null); return; }
                      const e164 = toE164(phone);
                      if (!e164) { toast({ title: "Add the country code", description: "For example +44 or +972." }); return; }
                      await patch({ whatsapp_number: e164 }); setEditing(null);
                    }}>Save</button>
                  </div>
                )}
              </div>
              <div>
                <Row label="Ready" value={s.timing === "morning_of" ? "That morning" : "The evening before"} k="timing" />
                {editing === "timing" && (
                  <div className="pb-3 flex flex-wrap gap-2">
                    <button className={chipCls(s.timing === "evening_before")} onClick={() => patch({ timing: "evening_before" })}>The evening before</button>
                    <button className={chipCls(s.timing === "morning_of")} onClick={() => patch({ timing: "morning_of" })}>That morning</button>
                  </div>
                )}
              </div>
              <div>
                <Row label="What helps" value={s.helps.length ? `${s.helps.length} selected` : "None"} k="helps" />
                {editing === "helps" && (
                  <div className="pb-3 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {[...HEADSUP_HELP_OPTIONS.map((o) => o.value), ...s.helps.filter((h) => !HEADSUP_HELP_OPTIONS.some((o) => o.value === h))].map((v) => (
                        <button key={v} className={chipCls(s.helps.includes(v))} onClick={() => toggleHelp(v)}>{helpLabel(v)}</button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add your own" maxLength={60}
                        className="flex-1 min-h-[44px] rounded-full border border-border/60 bg-background/60 px-4 text-sm outline-none" />
                      <button className="min-h-[44px] px-4 rounded-full border border-border/60 text-sm" disabled={!custom.trim()}
                        onClick={() => { patch({ helps: [...s.helps, custom.trim()] }); setCustom(""); }}>Add</button>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <Row label="What's included" value={[s.include_dates && "Dates", s.include_mood && "Mood", s.include_helps && "Helps"].filter(Boolean).join(", ") || "Minimal"} k="included" />
                {editing === "included" && (
                  <div className="pb-3 space-y-2">
                    {([
                      ["Rough dates", "include_dates"],
                      ["Energy and mood, in general terms", "include_mood"],
                      ["What helps", "include_helps"],
                      ['The "Sent with Logan" line', "include_footer"],
                    ] as const).map(([label, key]) => (
                      <div key={key} className="flex min-h-[44px] items-center justify-between">
                        <span className="text-sm">{label}</span>
                        <Switch checked={s[key]} onCheckedChange={(v) => patch({ [key]: v } as Partial<HeadsupSettingsRow>)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button className="text-xs text-muted-foreground underline underline-offset-2" onClick={notify}>Get a notification when a draft is ready</button>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">History</h4>
              {events.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing yet.</p>
              ) : (
                <ul className="space-y-1">
                  {events.map((e) => (
                    <li key={e.id} className="flex items-center justify-between text-sm">
                      <span>{new Date(`${e.window_start}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      <span className="text-muted-foreground">{e.outcome ? OUTCOME_LABEL[e.outcome] : STATUS_LABEL[e.status] ?? e.status}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">Logan keeps the date and what happened. Messages aren't stored after you send them, except your last few edits, which help drafts sound like you.</p>
            </div>

            <div className="space-y-2 pt-1">
              <button className={ghost} onClick={pause} disabled={paused || !s.enabled}>{paused ? "Paused for this cycle" : "Pause for this cycle"}</button>
              <button className="min-h-[44px] w-full rounded-full px-5 text-sm text-destructive hover:bg-destructive/10 transition-colors" onClick={deleteAll}>
                Turn off and delete history
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
