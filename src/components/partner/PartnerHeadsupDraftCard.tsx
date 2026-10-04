import { trackedSupabase } from "@/lib/messageFailures";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { HEADSUP_FOOTER } from "@/lib/partnerHeadsup";
import {
  FOCUS_OPTIONS, HEADSUP_FOCUS_KEY, HEADSUP_UPDATED_EVENT, PREFILL_CHAT_EVENT, generateDraft, saveStyleExample, shareSheet, whatsappUrl,
  type HeadsupDraftResponse, openTopLevel } from "@/lib/partnerHeadsupClient";
import { HeadsupEditSheet } from "./HeadsupEditSheet";

interface Props {
  userId: string;
  cacheKey: string;
  eventId?: string;
  mode: "predicted" | "today" | "undated";
  kind: "scheduled" | "on_demand";
  sourceMessageId?: string;
  justThisWeek?: boolean;
  /** Opened from the hard-day chips: "JUST FOR TODAY" label, "Not this time" button. */
  hardDay?: boolean;
  preselect?: string[];
}

type Cached = HeadsupDraftResponse & { includeFooter: boolean; edited?: boolean };
const primary = "headsup-primary min-h-[44px] w-full rounded-full px-5 text-sm font-medium transition-opacity disabled:opacity-40";
const chipCls = (on: boolean) =>
  `min-h-[44px] px-4 rounded-full border text-sm font-medium transition-colors disabled:opacity-40 ${on ? "headsup-chip-active" : "border-border/60 bg-card/60 text-foreground hover:bg-card"}`;
const ghost = "min-h-[44px] flex-1 rounded-full border border-border/60 bg-card/60 px-4 text-sm font-medium hover:bg-card transition-colors";
const fmt = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const wd = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });

/** Draft card in chat. The draft text lives only on this device until sent, then is cleared. */
export function PartnerHeadsupDraftCard({ userId, cacheKey, eventId: initialEventId, mode, kind, sourceMessageId, justThisWeek, hardDay, preselect }: Props) {
  const storageKey = `headsup-draft:${cacheKey}`;
  const [eventId, setEventId] = useState(initialEventId);
  const [status, setStatus] = useState<string | null>(initialEventId ? null : "drafted");
  const [settings, setSettings] = useState<{ partner_name: string | null; whatsapp_number: string | null; include_footer: boolean; relationship: string | null; enabled: boolean; include_mood: boolean; helps: string[]; timing: string } | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // Chips she picked for this draft (null = not asked yet). Kept on this device only until the draft is done.
  const focusKey = HEADSUP_FOCUS_KEY(cacheKey);
  const [focus, setFocus] = useState<string[] | null>(() => {
    try { const raw = localStorage.getItem(focusKey); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [picked, setPicked] = useState<string[]>(() => (preselect ?? []).slice(0, 2));
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [draft, setDraft] = useState<Cached | null>(() => {
    try { const raw = localStorage.getItem(storageKey); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [why, setWhy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    supabase.from("partner_headsup_settings").select("partner_name, whatsapp_number, include_footer, relationship, enabled, include_mood, helps, timing").eq("user_id", userId).maybeSingle()
      .then(({ data }) => {
        setSettings(data);
        setSettingsLoaded(true);
        if (data?.partner_name) setName(data.partner_name);
      });
    if (initialEventId) {
      supabase.from("partner_headsup_events").select("status, recipient_name").eq("id", initialEventId).maybeSingle()
        .then(({ data }) => { setStatus(data?.status ?? "gone"); if (data?.recipient_name) setName((n) => n ?? data.recipient_name); });
    }
  }, [userId, initialEventId]);

  const persist = (d: Cached | null) => {
    setDraft(d);
    if (!d) { try { localStorage.removeItem(focusKey); } catch { /* ignore */ } }
    try { d ? localStorage.setItem(storageKey, JSON.stringify(d)) : localStorage.removeItem(storageKey); } catch { /* ignore */ }
  };

  const genBase = {
    mode, source_message_id: sourceMessageId, name: name ?? undefined,
    use_defaults: !!justThisWeek, relationship: justThisWeek && !settings ? undefined : settings?.relationship ?? undefined,
    ...(focus ? { focus } : {}),
    // Her own words are never sent once chips are in play; only the chips.
    ...(focus ? { source_message_id: undefined } : {}),
  };
  const askFocus = settingsLoaded && (settings ? settings.include_mood : true);
  const focusReady = !askFocus || focus !== null;

  const generate = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await generateDraft(genBase);
      persist({ ...r, includeFooter: justThisWeek ? true : settings?.include_footer ?? true });
    } catch (e) { setErr((e as Error).message); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, settings, mode, sourceMessageId, justThisWeek, focus]);

  useEffect(() => {
    if (status === "drafted" && name && settingsLoaded && focusReady && !draft && !loading && !err) generate();
  }, [status, name, settingsLoaded, focusReady, draft, loading, err, generate]);

  const chooseFocus = async (f: string[]) => {
    setFocus(f);
    try { localStorage.setItem(focusKey, JSON.stringify(f)); } catch { /* ignore */ }
    if (eventId && f.length) await supabase.from("partner_headsup_events").update({ focus: f }).eq("id", eventId);
  };
  const togglePick = (v: string) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : p.length >= 2 ? p : [...p, v]));

  const ensureEvent = async (newStatus: "opened" | "skipped") => {
    const now = new Date().toISOString();
    // sent_at records her tap on WhatsApp/Share; delivery itself can't be confirmed.
    const patch = { status: newStatus, ...(newStatus === "opened" ? { opened_at: now, sent_at: now } : {}), ...(focus?.length ? { focus } : {}) };
    if (eventId) { await supabase.from("partner_headsup_events").update(patch).eq("id", eventId); return; }
    const today = new Date().toLocaleDateString("en-CA");
    const { data } = await supabase.from("partner_headsup_events").insert({
      user_id: userId, kind: "on_demand", window_start: today, window_end: today, recipient_name: name, ...patch,
    }).select("id").maybeSingle();
    if (data?.id) setEventId(data.id);
  };

  const fullText = draft ? (draft.includeFooter ? `${draft.text}\n\n${HEADSUP_FOOTER}` : draft.text) : "";

  const afterSend = async () => {
    setActing(true);
    await ensureEvent("opened");
    persist(null);
    setStatus("opened");
    await trackedSupabase.from("chat_messages").insert({ user_id: userId, role: "assistant", message_type: "partner_headsup_shared", content: `Heads-up shared with ${name}`, metadata: {} });
    await trackedSupabase.from("chat_messages").insert({ user_id: userId, role: "assistant", message_type: "text", content: "Done. Go easy on yourself this week. I'm here if you want to talk any of it through.", metadata: { partner_headsup: "sent" } });
    if (justThisWeek && !settings?.enabled) {
      const { data: prior } = await supabase.from("chat_messages").select("id").eq("user_id", userId).contains("metadata", { partner_headsup: "one_off_followup" }).limit(1);
      if (!prior?.length) {
        await trackedSupabase.from("chat_messages").insert({ user_id: userId, role: "assistant", message_type: "partner_headsup_offer", content: "Want one ready before your next harder stretch too?", metadata: { partner_headsup: "one_off_followup" } });
      }
    }
    globalThis.dispatchEvent(new CustomEvent(HEADSUP_UPDATED_EVENT));
    setActing(false);
  };

  const send = () => {
    openTopLevel(whatsappUrl(fullText, settings?.whatsapp_number));
    void afterSend();
  };
  const shareOther = async () => {
    const ok = await shareSheet(fullText);
    if (ok) void afterSend();
  };

  const skip = async () => {
    setActing(true);
    await ensureEvent("skipped");
    persist(null);
    setStatus("skipped");
    await trackedSupabase.from("chat_messages").insert({ user_id: userId, role: "assistant", message_type: "text", content: "No problem. I'll have the next one ready.", metadata: { partner_headsup: "skipped" } });
    const { data: last } = await supabase.from("partner_headsup_events").select("status, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(3);
    if (settings?.enabled && last?.length === 3 && last.every((e) => e.status === "skipped")) {
      const { data: asked } = await supabase.from("chat_messages").select("id").eq("user_id", userId).eq("message_type", "partner_headsup_keep").gte("created_at", last[2].created_at).limit(1);
      if (!asked?.length) {
        await trackedSupabase.from("chat_messages").insert({ user_id: userId, role: "assistant", message_type: "partner_headsup_keep", content: "Want me to keep making these?", metadata: {} });
      }
    }
    setActing(false);
  };

  const onEditDone = async (text: string, includeFooter: boolean) => {
    setEditOpen(false);
    if (!draft) return;
    const changed = text !== draft.text;
    persist({ ...draft, text, includeFooter, edited: draft.edited || changed });
    if (changed) void saveStyleExample(text);
  };

  if (status === null) return <div className="py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (status === "opened") return <p className="text-sm text-muted-foreground">Heads-up shared with {name}.</p>;
  if (status === "skipped") return <p className="text-sm text-muted-foreground">Skipped this time.</p>;
  if (status === "expired" || status === "superseded" || status === "gone") return <p className="text-sm text-muted-foreground">This draft is no longer current.</p>;

  if (!name) {
    return (
      <div className="headsup-surface space-y-3 w-full">
        <div className="text-sm">Who's it for?</div>
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Their name"
          maxLength={60}
          className="w-full min-h-[44px] rounded-full border border-border/60 bg-background/60 px-4 text-sm outline-none focus:border-[hsl(var(--headsup-accent))]"
        />
        <button className={primary} disabled={!nameInput.trim()} onClick={() => setName(nameInput.trim())}>Write it</button>
      </div>
    );
  }

  if (askFocus && focus === null && !draft) {
    const line = hardDay
      ? "On it. From what you said, these sound hardest today. Change anything you like."
      : kind === "scheduled" && mode === "predicted"
      ? `Your harder stretch usually starts ${settings?.timing === "morning_of" ? "today" : "tomorrow"}. Before I write to ${name}, what feels hardest this time?`
      : `Before I write to ${name}, what feels hardest right now?`;
    const customs = picked.filter((p) => !FOCUS_OPTIONS.includes(p));
    const hasHelps = (settings?.helps?.length ?? 0) > 0;
    return (
      <div id={`headsup-${cacheKey}`} className="headsup-surface headsup-enter w-full space-y-3">
        {hardDay && <div className="text-[11px] font-medium tracking-[0.12em] headsup-gradient-text">JUST FOR TODAY</div>}
        <p className="text-sm">{line}</p>
        <p className="text-xs text-muted-foreground">Pick up to 2</p>
        <div className="flex flex-wrap gap-2">
          {[...FOCUS_OPTIONS, ...customs].map((o) => (
            <button key={o} className={chipCls(picked.includes(o))} onClick={() => togglePick(o)} disabled={!picked.includes(o) && picked.length >= 2}>{o}</button>
          ))}
          <button className={chipCls(customOpen)} onClick={() => setCustomOpen((c) => !c)} disabled={picked.length >= 2 && !customOpen}>Add your own</button>
        </div>
        {customOpen && (
          <div className="flex gap-2">
            <input value={customText} onChange={(e) => setCustomText(e.target.value)} maxLength={40} autoFocus
              className="flex-1 min-h-[44px] rounded-full border border-border/60 bg-background/60 px-4 text-sm outline-none focus:border-[hsl(var(--headsup-accent))]" />
            <button className={chipCls(false)} disabled={!customText.trim() || picked.length >= 2}
              onClick={() => { const t = customText.trim(); if (t && !picked.includes(t)) setPicked((p) => [...p, t].slice(0, 2)); setCustomText(""); setCustomOpen(false); }}>Add</button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{name} sees how you'd like support, never medical details.</p>
        <button className={primary} disabled={picked.length === 0} onClick={() => void chooseFocus(picked)}>Write it</button>
        {hasHelps && (
          <button className="w-full text-center text-sm text-muted-foreground underline underline-offset-2" onClick={() => void chooseFocus([])}>Same as usual</button>
        )}
      </div>
    );
  }

  const showDates = mode === "predicted" && draft && !draft.undated && draft.window && draft.cycles_used > 0;

  return (
    <div id={`headsup-${cacheKey}`} className="headsup-surface headsup-enter w-full space-y-3">
      <div className="text-[11px] font-medium tracking-[0.12em] headsup-gradient-text">{hardDay ? "JUST FOR TODAY" : `DRAFT FOR ${name.toUpperCase()}`}</div>
      {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Writing it as you…</div>}
      {err && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{err}</p>
          <button className="text-sm font-medium headsup-accent-text" onClick={() => { setErr(null); }}>Try again</button>
        </div>
      )}
      {draft && (
        <>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed" dir="auto">{draft.text}</p>
          {draft.includeFooter && <p className="text-xs text-muted-foreground">{HEADSUP_FOOTER}</p>}
          {showDates && (
            <>
              <div className="h-px bg-border/60" />
              <p className="text-xs text-muted-foreground">
                Dates based on your last {draft.cycles_used} cycles.{" "}
                <button className="underline underline-offset-2" onClick={() => setWhy((w) => !w)}>Why these dates?</button>
              </p>
              {why && draft.window && (
                <div className="rounded-[16px] border border-border/50 p-3 space-y-2 text-xs text-muted-foreground">
                  <p>
                    Your cycles have been about {draft.cycle_length_days ?? 28} days, so I expect your next period around {fmt(draft.window.period_start)}.
                    Your harder stretch usually runs from 3 days before it until day 2, so about {wd(draft.window.start)} to {wd(draft.window.end)}.
                  </p>
                  <button
                    className="font-medium headsup-accent-text"
                    onClick={() => globalThis.dispatchEvent(new CustomEvent(PREFILL_CHAT_EVENT, { detail: "These dates are wrong. " }))}
                  >
                    These dates are wrong
                  </button>
                </div>
              )}
            </>
          )}
          <div className="space-y-2 pt-1">
            <button className={primary} onClick={send} disabled={acting}>Send to {name} on WhatsApp</button>
            <div className="flex gap-2">
              <button className={ghost} onClick={() => setEditOpen(true)} disabled={acting}>Edit</button>
              <button className={ghost} onClick={skip} disabled={acting}>{hardDay ? "Not this time" : "Skip this time"}</button>
            </div>
            <button className="w-full text-center text-xs text-muted-foreground underline underline-offset-2" onClick={shareOther} disabled={acting}>
              No WhatsApp? Share another way
            </button>
          </div>
          <HeadsupEditSheet
            open={editOpen}
            onOpenChange={setEditOpen}
            name={name}
            text={draft.text}
            includeFooter={draft.includeFooter}
            userLanguage={draft.user_language}
            genBase={genBase}
            onDone={onEditDone}
          />
        </>
      )}
    </div>
  );
}
