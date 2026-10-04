import { trackedSupabase } from "@/lib/messageFailures";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toE164 } from "@/lib/partnerHeadsup";
import {
  FOCUS_OPTIONS, HEADSUP_UPDATED_EVENT, buildTipBlocks, LAST_OPENING_KEY, generateDraft, loadPeople, openTopLevel, saveStyleExample, shareSheet, whatsappUrl,
  type HeadsupPerson, type PartnerTips,
} from "@/lib/partnerHeadsupClient";

interface Props {
  userId: string;
  cacheKey: string;
  eventId?: string;
  preselect?: string[];
  partnerTips?: PartnerTips;
  initialPersonId?: string;
}

type TipBlocks = { help: string | null; skip: string | null; helpOn: boolean; skipOn: boolean };
type Cached = { text: string; generated: string; focus: string[]; personId: string | null; typedName: string; blocks?: TipBlocks; base?: string };

const withBlocks = (text: string, b: TipBlocks | undefined) => {
  if (!b) return text;
  const parts = [text.trimEnd()];
  if (b.helpOn && b.help) parts.push(b.help);
  if (b.skipOn && b.skip) parts.push(b.skip);
  return parts.join("\n\n");
};
const primary = "headsup-primary min-h-[44px] w-full rounded-full px-5 text-sm font-medium transition-opacity disabled:opacity-40";
const chipCls = (on: boolean) =>
  `min-h-[36px] px-3 rounded-full border text-xs font-medium transition-colors disabled:opacity-40 ${on ? "headsup-chip-active" : "border-border/60 bg-card/60 text-foreground hover:bg-card"}`;
const input = "w-full min-h-[40px] rounded-full border border-border/60 bg-background/60 px-4 text-sm outline-none focus:border-[hsl(var(--headsup-accent))]";
const esc = (s: string) => s.replace(/[.*+?^$|()[\]{}\\]/g, "\\$&");

/** Rewrites only the greeting: swaps the old name for the new one in the first line. */
function swapGreeting(text: string, from: string | null, to: string | null): string {
  const nl = text.indexOf("\n");
  const first = nl >= 0 ? text.slice(0, nl) : text;
  const rest = nl >= 0 ? text.slice(nl) : "";
  let line = first;
  if (from && new RegExp(`\\b${esc(from)}\\b`).test(first)) line = to ? first.replace(new RegExp(`\\b${esc(from)}\\b`), to) : first.replace(new RegExp(`\\s*\\b${esc(from)}\\b`), "");
  else if (!from && to) line = first.replace(/^(\s*(hey|hi|hello|hola|היי)\b)/i, `$1 ${to}`);
  return line + rest;
}

/** The one heads-up draft card. Draft text lives only on this device until sent or dismissed. */
export function PartnerHeadsupDraftCard({ userId, cacheKey, eventId, preselect, partnerTips, initialPersonId }: Props) {
  const storageKey = `headsup-draft:${cacheKey}`;
  const [status, setStatus] = useState<string | null>(eventId ? null : "drafted");
  const [recipient, setRecipient] = useState<string | null>(null);
  const [people, setPeople] = useState<HeadsupPerson[] | null>(null);
  const [cached, setCached] = useState<Cached | null>(() => {
    try { const raw = localStorage.getItem(storageKey); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [focus, setFocus] = useState<string[]>(() => cached?.focus ?? (preselect ?? []).filter((p) => FOCUS_OPTIONS.includes(p)).slice(0, 2));
  const [personId, setPersonId] = useState<string | null>(cached?.personId ?? initialPersonId ?? null);
  const [typedName, setTypedName] = useState(cached?.typedName ?? "");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    void loadPeople(userId).then((p) => {
      setPeople(p);
      setPersonId((cur) => (cur && p.some((x) => x.id === cur) ? cur : p[0]?.id ?? null));
    });
    if (eventId) {
      supabase.from("partner_headsup_events").select("status, recipient_name").eq("id", eventId).maybeSingle()
        .then(({ data }) => { setStatus(data?.status ?? "gone"); setRecipient(data?.recipient_name ?? null); });
    }
  }, [userId, eventId]);

  const person = people?.find((p) => p.id === personId) ?? null;
  const name = person?.name ?? (typedName.trim() || null);

  const persist = (c: Cached | null) => {
    setCached(c);
    try { c ? localStorage.setItem(storageKey, JSON.stringify(c)) : localStorage.removeItem(storageKey); } catch { /* ignore */ }
  };

  const generate = useCallback(async (f: string[], forName: string | null, pid: string | null, typed: string) => {
    setLoading(true); setErr(null);
    try {
      let avoid: number | undefined;
      try { const v = localStorage.getItem(LAST_OPENING_KEY); avoid = v ? Number(v) : undefined; } catch { /* ignore */ }
      const r = await generateDraft({ name: forName ?? undefined, focus: f, avoid_opening: avoid });
      try { localStorage.setItem(LAST_OPENING_KEY, String(r.opening)); } catch { /* ignore */ }
      setCached((prev) => {
        const tb = buildTipBlocks(partnerTips);
        const blocks: TipBlocks | undefined = prev?.blocks
          ? { ...prev.blocks }
          : tb.help || tb.skip ? { ...tb, helpOn: !!tb.help, skipOn: !!tb.skip } : undefined;
        const text = withBlocks(r.text, blocks);
        const next = { text, generated: text, base: r.text, focus: f, personId: pid, typedName: typed, blocks };
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    } catch (e) { setErr((e as Error).message); }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === "drafted" && people !== null && !cached && !started.current) {
      started.current = true;
      void generate(focus, people.find((p) => p.id === personId)?.name ?? null, personId, typedName);
    }
  }, [status, people, cached, focus, personId, typedName, generate]);

  const selectPerson = (p: HeadsupPerson) => {
    if (!cached || p.id === personId) { setPersonId(p.id); return; }
    const text = swapGreeting(cached.text, name, p.name);
    setPersonId(p.id);
    persist({ ...cached, text, personId: p.id });
  };

  const addPerson = async () => {
    const n = newName.trim();
    if (!n) return;
    const num = newPhone.trim() ? toE164(newPhone) : null;
    const { data } = await supabase.from("headsup_people").insert({ user_id: userId, name: n, whatsapp_number: num }).select("id, name, whatsapp_number, last_used_at").maybeSingle();
    if (data) { setPeople((ps) => [data as HeadsupPerson, ...(ps ?? [])]); selectPerson(data as HeadsupPerson); }
    setAdding(false); setNewName(""); setNewPhone("");
  };

  /** Off: remove the block only if its text is untouched; otherwise leave her edit and just turn the chip off. */
  const toggleBlock = (which: "help" | "skip") => {
    if (!cached?.blocks) return;
    const b = cached.blocks;
    const block = b[which];
    const on = which === "help" ? b.helpOn : b.skipOn;
    if (!block) return;
    let text = cached.text;
    if (on) {
      if (text.includes(block)) text = text.replace(`\n\n${block}`, "").replace(block, "").replace(/\n{3,}/g, "\n\n").trimEnd();
    } else {
      text = `${text.trimEnd()}\n\n${block}`;
    }
    persist({ ...cached, text, blocks: { ...b, [which === "help" ? "helpOn" : "skipOn"]: !on } });
  };

  const toggleFocus = (v: string) => {
    const next = focus.includes(v) ? focus.filter((x) => x !== v) : focus.length >= 2 ? focus : [...focus, v];
    if (next === focus) return;
    setFocus(next);
    void generate(next, name, personId, typedName);
  };

  const finish = async (newStatus: "opened" | "skipped", sentTo: string | null) => {
    const now = new Date().toISOString();
    const patch = { status: newStatus, recipient_name: sentTo, focus: focus.length ? focus : null, ...(newStatus === "opened" ? { opened_at: now, sent_at: now } : {}) };
    if (eventId) await supabase.from("partner_headsup_events").update(patch).eq("id", eventId);
    else {
      const today = new Date().toLocaleDateString("en-CA");
      await supabase.from("partner_headsup_events").insert({ user_id: userId, kind: "on_demand", window_start: today, window_end: today, ...patch });
    }
  };

  const afterSend = async () => {
    if (!cached) return;
    setActing(true);
    let sentTo = name;
    if (person) await supabase.from("headsup_people").update({ last_used_at: new Date().toISOString() }).eq("id", person.id);
    else if (typedName.trim()) {
      await supabase.from("headsup_people").insert({ user_id: userId, name: typedName.trim(), last_used_at: new Date().toISOString() });
    } else sentTo = null;
    if (cached.text !== cached.generated) void saveStyleExample(cached.text);
    await finish("opened", sentTo);
    persist(null);
    setRecipient(sentTo);
    setStatus("opened");
    await trackedSupabase.from("chat_messages").insert({
      user_id: userId, role: "assistant", message_type: "text",
      content: "I hope tonight's a little lighter. I'm here if you want to talk any of it through.",
      metadata: { partner_headsup: "sent", system_line: sentTo ? `Opened WhatsApp for ${sentTo}.` : "Opened WhatsApp." },
    });
    globalThis.dispatchEvent(new CustomEvent(HEADSUP_UPDATED_EVENT));
    setActing(false);
  };

  const send = () => {
    if (!cached) return;
    openTopLevel(whatsappUrl(cached.text, person?.whatsapp_number));
    void afterSend();
  };
  const shareOther = async () => {
    if (cached && (await shareSheet(cached.text))) void afterSend();
  };
  const dismiss = async () => {
    setActing(true);
    await finish("skipped", name);
    persist(null);
    setStatus("skipped");
    setActing(false);
  };

  if (status === null) return <div className="py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (status === "opened") return <p className="text-sm text-muted-foreground">{recipient ? `Opened WhatsApp for ${recipient}.` : "Opened WhatsApp."}</p>;
  if (status === "skipped") return <p className="text-sm text-muted-foreground">Not this time.</p>;
  if (status !== "drafted") return <p className="text-sm text-muted-foreground">This draft is no longer current.</p>;

  const firstTime = people !== null && people.length === 0;

  return (
    <div id={`headsup-${cacheKey}`} className="w-full space-y-3">
      <p className="text-sm">Here's a start. Change anything, it's yours.</p>
      <div className="headsup-surface headsup-enter w-full space-y-3">
        {/* To */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">To</span>
          {people === null ? null : people.length > 0 ? (
            <>
              {people.map((p) => (
                <button key={p.id} className={chipCls(p.id === personId)} onClick={() => selectPerson(p)}>{p.name}</button>
              ))}
              <button className="min-h-[36px] px-3 rounded-full border border-dashed border-border/70 text-xs text-muted-foreground" onClick={() => setAdding((a) => !a)}>+ Add</button>
            </>
          ) : (
            <input value={typedName} onChange={(e) => { setTypedName(e.target.value); if (cached) persist({ ...cached, typedName: e.target.value }); }}
              onBlur={() => { if (cached && typedName.trim()) persist({ ...cached, text: swapGreeting(cached.text, null, typedName.trim()), typedName }); }}
              placeholder="Their name (optional)" maxLength={60} className={`${input} flex-1`} />
          )}
        </div>
        {adding && (
          <div className="space-y-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" maxLength={60} className={input} autoFocus />
            <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="WhatsApp number (optional)" inputMode="tel" className={input} />
            <button className={chipCls(false)} disabled={!newName.trim()} onClick={() => void addPerson()}>Save</button>
          </div>
        )}

        {/* Message */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Tap to edit</p>
          {loading && !cached ? (
            <div className="flex min-h-[130px] items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Writing it as you…</div>
          ) : (
            <div className="relative">
              <textarea
                dir="auto"
                value={cached?.text ?? ""}
                onChange={(e) => cached && persist({ ...cached, text: e.target.value })}
                className="w-full min-h-[130px] resize-y rounded-[16px] border border-border/50 bg-background/40 p-3 text-[15px] leading-relaxed outline-none focus:border-[hsl(var(--headsup-accent))]"
              />
              {loading && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          )}
          {err && (
            <p className="text-sm text-destructive">
              {err}{" "}
              <button className="underline" onClick={() => void generate(focus, name, personId, typedName)}>Try again</button>
            </p>
          )}
        </div>

        {/* Make it about */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Make it about:</span>
          {FOCUS_OPTIONS.map((o) => (
            <button key={o} className={chipCls(focus.includes(o))} disabled={loading || (!focus.includes(o) && focus.length >= 2)} onClick={() => toggleFocus(o)}>{o}</button>
          ))}
        </div>

        {cached?.blocks && (cached.blocks.help || cached.blocks.skip) && (
          <div className="flex flex-wrap items-center gap-2">
            {cached.blocks.help && <button className={chipCls(cached.blocks.helpOn)} onClick={() => toggleBlock("help")}>How to help</button>}
            {cached.blocks.skip && <button className={chipCls(cached.blocks.skipOn)} onClick={() => toggleBlock("skip")}>What to skip</button>}
          </div>
        )}

        {firstTime && (
          <div className="rounded-[12px] bg-muted/60 p-3 text-xs text-muted-foreground">
            Never included: medical details, bleeding, fertility, or anything you've told Logan in chat. Logan never contacts them.
          </div>
        )}

        <div className="space-y-2 pt-1">
          <button className={primary} onClick={send} disabled={acting || !cached?.text.trim()}>
            {name ? `Send to ${name} on WhatsApp` : "Send on WhatsApp"}
          </button>
          <button className="w-full text-center text-xs text-muted-foreground underline underline-offset-2" onClick={shareOther} disabled={acting || !cached}>
            No WhatsApp? Share another way
          </button>
          <button className="w-full min-h-[40px] text-center text-sm text-muted-foreground" onClick={dismiss} disabled={acting}>Not this time</button>
        </div>
      </div>
    </div>
  );
}
