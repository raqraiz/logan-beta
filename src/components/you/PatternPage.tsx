import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { loadPeople, pickHomePerson, startOnDemandDraft, OPEN_CHAT_EVENT, type HeadsupPerson } from "@/lib/partnerHeadsupClient";

export interface PatternInfo { name: string; from: number | null; to: number | null; cycles: number; count: number }

interface Props {
  userId: string;
  pattern: PatternInfo;
  watched: boolean;
  lastPeriodStart?: string;
  cycleLengthDays: number;
  headsupVisible?: boolean;
  onClose: () => void;
  onUnstar: () => Promise<void>;
  onChanged: () => void;
}

const DAY = 86400000;
const ymd = (d: Date) => d.toLocaleDateString("en-CA");
const parse = (s: string) => new Date(`${s}T12:00:00`);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type GridRow = { label: string; cells: ("none" | "logged" | "today" | "future" | "expected")[] };

export function PatternPage({ userId, pattern, watched, lastPeriodStart, cycleLengthDays, headsupVisible, onClose, onUnstar, onChanged }: Props) {
  const [rows, setRows] = useState<GridRow[] | null>(null);
  const [explain, setExplain] = useState<{ safety: string | null; text: string | null } | null>(null);
  const [person, setPerson] = useState<HeadsupPerson | null>(null);
  const [fix, setFix] = useState(false);
  const [mode, setMode] = useState<"menu" | "timing">("menu");
  const [fromIn, setFromIn] = useState(String(pattern.from ?? ""));
  const [toIn, setToIn] = useState(String(pattern.to ?? ""));
  const [msg, setMsg] = useState<string | null>(null);
  const { name, from, to } = pattern;
  const lower = name.toLowerCase();

  // Grid: last 3 archived cycles + current, one cell per cycle day.
  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from("participants").select("id").eq("user_id", userId).maybeSingle();
      const { data: hist } = p ? await supabase.from("cycle_history").select("cycle_start_date, cycle_length_days")
        .eq("participant_id", p.id).order("cycle_start_date", { ascending: false }).limit(3) : { data: [] };
      const cycles = [...(hist ?? [])].reverse().map((h) => ({ start: parse(h.cycle_start_date), len: h.cycle_length_days, now: false }));
      if (lastPeriodStart) cycles.push({ start: parse(lastPeriodStart), len: cycleLengthDays || 28, now: true });
      if (!cycles.length) { setRows([]); return; }
      const since = new Date(cycles[0].start.getTime() - DAY).toISOString();
      const { data: logs } = await supabase.from("symptom_logs").select("logged_at, symptoms").eq("user_id", userId).gte("logged_at", since);
      const days = new Set<string>();
      for (const l of logs ?? []) for (const s of (Array.isArray(l.symptoms) ? l.symptoms : []) as any[]) {
        const n = typeof s === "string" ? s : s?.name;
        if (n && String(n).trim().toLowerCase() === lower) days.add(ymd(new Date(l.logged_at)));
      }
      const today = ymd(new Date());
      setRows(cycles.map((c) => {
        const todayIdx = c.now ? Math.floor((parse(today).getTime() - c.start.getTime()) / DAY) + 1 : 0;
        const len = c.now ? Math.max(c.len, todayIdx) : c.len;
        return {
          label: c.now ? "Now" : MON[c.start.getMonth()],
          cells: Array.from({ length: Math.min(len, 45) }, (_, i) => {
            const d = i + 1; const key = ymd(new Date(c.start.getTime() + i * DAY));
            if (c.now && d === todayIdx) return days.has(key) ? "logged" : "today";
            if (days.has(key)) return "logged";
            if (c.now && d > todayIdx) return from !== null && to !== null && d >= from && d <= to ? "expected" : "future";
            return "none";
          }),
        };
      }));
    })();
  }, [userId, lower, lastPeriodStart, cycleLengthDays, from, to]);

  useEffect(() => {
    const k = `logan:pattern-explain:${lower}:${from}:${to}`;
    try { const c = localStorage.getItem(k); if (c) { setExplain(JSON.parse(c)); return; } } catch { /* ignore */ }
    supabase.functions.invoke("pattern-explain", { body: { symptom: name, from, to } }).then(({ data }) => {
      const v = { safety: data?.safety ?? null, text: data?.text ?? null };
      setExplain(v); if (v.text) try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
    });
  }, [name, lower, from, to]);

  useEffect(() => {
    if (!headsupVisible) return;
    Promise.all([loadPeople(userId), supabase.from("partner_headsup_settings").select("enabled").eq("user_id", userId).maybeSingle()])
      .then(([ppl, { data: st }]) => setPerson(st?.enabled ? pickHomePerson(ppl) : null));
  }, [userId, headsupVisible]);

  const title = from !== null ? `${name} comes around day ${from}` : name;
  const sub = from !== null && pattern.cycles > 1 ? `Seen in ${pattern.cycles} cycles` : `Logged ${pattern.count} time${pattern.count === 1 ? "" : "s"} so far`;
  const ariaGrid = useMemo(() => !rows ? "" :
    `${name} by cycle day. ` + rows.map((r) => {
      const ds = r.cells.map((c, i) => (c === "logged" ? i + 1 : 0)).filter(Boolean);
      return `${r.label}: ${ds.length ? `logged on day${ds.length > 1 ? "s" : ""} ${ds.join(", ")}` : "not logged"}`;
    }).join(". ") + (from !== null ? `. Usual window: days ${from} to ${to}.` : ""), [rows, name, from, to]);

  const tell = async () => {
    if (!person) return;
    const id = await startOnDemandDraft(userId, { personId: person.id });
    if (id) { onClose(); globalThis.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { focusMessageId: id } })); }
  };

  const saveNote = async (note: string, source: string) => {
    const { error } = await supabase.from("user_memory_notes").insert({ user_id: userId, note, source, active: true });
    if (error) { setMsg("That didn't save. Try again."); return false; }
    return true;
  };
  const saveTiming = async () => {
    const a = parseInt(fromIn, 10), b = parseInt(toIn || fromIn, 10);
    if (!(a >= 1 && b >= a && b - a <= 7 && b <= 60)) { setMsg("Pick days up to a week apart."); return; }
    if (await saveNote(`Your ${lower} usually comes around days ${a} to ${b}.`, "insight_correction")) { setFix(false); onChanged(); }
  };
  const remove = async () => {
    if (await saveNote(`${name} isn't a pattern for you. Don't show it.`, "pattern_hidden")) { setFix(false); onChanged(); onClose(); }
  };

  const shade = (i: number) => from !== null && to !== null && i + 1 >= from && i + 1 <= to;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background" role="dialog" aria-label={title}>
      <div className="mx-auto max-w-lg px-5 pb-16 pt-5">
        <button type="button" onClick={onClose} aria-label="Back to You"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="mt-6 font-display text-[40px] font-semibold leading-[1.05] text-foreground">{title}</h1>
        <p className="mt-2 text-base font-light text-muted-foreground">{sub}</p>
        {watched && <p className="mt-1 text-sm font-semibold text-[#0B7479] dark:text-[#2BD4D9]">★ You're watching this</p>}

        <div className="mt-8 rounded-[22px] border border-border bg-card p-4" role="img" aria-label={ariaGrid}>
          {rows === null ? <div className="h-24" /> : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add your period dates and this will fill in.</p>
          ) : rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2 py-1.5">
              <span className="w-8 shrink-0 text-[12px] text-muted-foreground">{r.label}</span>
              <div className="flex flex-1">
                {r.cells.map((c, i) => (
                  <span key={i} className={`flex h-4 flex-1 items-center justify-center ${shade(i) ? "bg-[rgba(255,46,146,0.08)]" : ""}`}>
                    <span className={
                      c === "logged" ? "h-2.5 w-2.5 rounded-full bg-[#FF2E92]"
                      : c === "today" ? "h-2.5 w-2.5 rounded-full bg-foreground"
                      : c === "expected" ? "h-2.5 w-2.5 rounded-full border border-dashed border-[#C4247A]"
                      : "h-1 w-1 rounded-full bg-border"} />
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-2 text-base font-light text-muted-foreground">
          {explain?.safety && <p className="font-normal text-foreground">{explain.safety}</p>}
          {explain === null ? <div className="h-6 w-3/4 animate-pulse rounded bg-muted" /> : explain.text && <p>{explain.text}</p>}
        </div>

        {person && (
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => void tell()}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-card py-3 text-sm font-semibold text-foreground">
              <span className="h-2 w-2 rounded-full bg-[#22C3CE]" aria-hidden /> Tell {person.name}
            </button>
          </div>
        )}

        <button type="button" onClick={() => { setMode("menu"); setMsg(null); setFix(true); }}
          className="mt-10 text-sm text-muted-foreground underline underline-offset-2">Not right?</button>
      </div>

      <Drawer open={fix} onOpenChange={setFix}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle className="font-display text-2xl">What's not right?</DrawerTitle></DrawerHeader>
          <div className="space-y-2 px-5 pb-6">
            {mode === "menu" ? (
              <>
                <button type="button" onClick={() => setMode("timing")} className="w-full rounded-full border border-border bg-card py-3 text-sm font-semibold text-foreground">The timing is off</button>
                {watched && <button type="button" onClick={async () => { await onUnstar(); setFix(false); }} className="w-full rounded-full border border-border bg-card py-3 text-sm font-semibold text-foreground">Stop watching this</button>}
                <button type="button" onClick={() => void remove()} className="w-full rounded-full border border-border bg-card py-3 text-sm font-semibold text-foreground">This isn't a pattern for me</button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">When does {lower} usually come?</p>
                <div className="flex items-center gap-2 text-sm text-foreground">
                  Day <input inputMode="numeric" value={fromIn} onChange={(e) => setFromIn(e.target.value.replace(/\D/g, "").slice(0, 2))} className="w-14 rounded-full border border-border bg-card px-3 py-2 text-center" aria-label="From day" />
                  to <input inputMode="numeric" value={toIn} onChange={(e) => setToIn(e.target.value.replace(/\D/g, "").slice(0, 2))} className="w-14 rounded-full border border-border bg-card px-3 py-2 text-center" aria-label="To day" />
                </div>
                <button type="button" onClick={() => void saveTiming()} className="w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background">Save</button>
              </div>
            )}
            {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
