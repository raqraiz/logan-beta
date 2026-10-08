import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SymptomHistory } from "@/components/home/SymptomHistory";
import { PatternPage } from "@/components/you/PatternPage";
import type { SymptomPageLog } from "@/lib/symptomPage";
import { symptomPoints, groupCycles, usualWindow, PATTERNS_CHANGED, PATTERN_WINDOW_DAYS, type LogRow } from "@/lib/patternCycles";
import { loadCycleStarts, withRealCycleDays } from "@/lib/realCycleDays";
import { findCloseWords, type WordSuggestion } from "@/lib/wordSuggest";
import { WordSuggestRows } from "@/components/together/WordSuggestRows";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

type Status = "Confirmed" | "Emerging" | "Watching";
interface Pattern { name: string; from: number | null; to: number | null; cycles: number; count: number; status: Status }

const DAY = 86400000;

/** Pattern rows from logged symptoms: how many separate cycles a symptom showed up in, and on which cycle days. */
const GOOD_DAYS = ["Lots of energy", "Feeling confident", "Clear head", "Sleeping well"];
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

export function computePatterns(rows: LogRow[], now = Date.now(), cycleLength = 28): Pattern[] {
  const by = symptomPoints(rows);
  const out: Pattern[] = [];
  for (const [key, pts] of Object.entries(by)) {
    const v = { last: Math.max(...pts.map((p) => p.t)) };
    const groups = groupCycles(pts).map((g) => g.days);
    const cycles = groups.length;
    // Timing only when 2+ cycles have most of their logs inside the same window of 7 days or less.
    const best = usualWindow(groups, cycleLength);
    let status: Status | null = null;
    if (best && best.n >= 3) status = "Confirmed";
    else if (best) status = "Emerging";
    else if (cycles >= 2 || now - v.last < 45 * DAY) status = "Watching";
    if (!status) continue;
    out.push({ name: key.charAt(0).toUpperCase() + key.slice(1), from: best?.from ?? null, to: best?.to ?? null, cycles, count: pts.length, status });
  }
  const rank: Record<Status, number> = { Confirmed: 0, Emerging: 1, Watching: 2 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || b.cycles - a.cycles);
}

const STYLE: Record<Status, { text: string; dot: string }> = {
  Confirmed: { text: "text-[#C4247A] dark:text-[#FF5FAA]", dot: "bg-[#FF2E92] border-[#FF2E92]" },
  Emerging: { text: "text-[#0B7479] dark:text-[#2BD4D9]", dot: "border-[#0E8A8F]" },
  Watching: { text: "text-muted-foreground", dot: "border-muted-foreground" },
};

interface Props {
  userId: string;
  lastPeriodStart?: string;
  cycleLengthDays: number;
  isNonCycling: boolean;
  lifeStage?: string;
  onLogFeeling: (symptom?: string) => void;
  headsupVisible?: boolean;
  fullList?: boolean;
}

export function YourPatterns({ userId, lastPeriodStart, cycleLengthDays, isNonCycling, lifeStage, onLogFeeling, headsupVisible, fullList = false }: Props) {
  const [patterns, setPatterns] = useState<Pattern[] | null>(null);
  const [logs, setLogs] = useState<SymptomPageLog[]>([]);
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState<string[]>([]);
  const [watch, setWatch] = useState<string[]>([]);
  const [chooser, setChooser] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [adding, setAdding] = useState(false);
  const [close, setClose] = useState<WordSuggestion[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [page, setPage] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [timing, setTiming] = useState<Record<string, [number, number]>>({});

  useEffect(() => {
    const since = new Date(Date.now() - PATTERN_WINDOW_DAYS * DAY).toISOString();
    Promise.all([
      supabase.from("symptom_logs").select("logged_at, cycle_day, symptoms, notes").eq("user_id", userId).gte("logged_at", since).order("logged_at", { ascending: false }),
      loadCycleStarts(userId),
    ]).then(([{ data: raw }, starts]) => {
        const data = withRealCycleDays(raw ?? [], starts);
        setLogs(data);
        setPatterns(computePatterns(data, Date.now(), cycleLengthDays));
        const names = new Set<string>();
        for (const r of data ?? []) for (const x of (Array.isArray(r.symptoms) ? r.symptoms : []) as any[]) {
          const n = typeof x === "string" ? x : x?.name; if (n && String(n).trim()) names.add(cap(String(n).trim().toLowerCase()));
        }
        setLogged([...names]);
      });
    supabase.from("participants").select("watch_symptoms, anchor_symptom").eq("user_id", userId).maybeSingle()
      .then(({ data }) => {
        const w = (data?.watch_symptoms ?? []) as string[];
        setWatch(w.length ? w : data?.anchor_symptom ? [cap(data.anchor_symptom)] : []);
      });
    // Her own corrections: hidden patterns and corrected timings.
    supabase.from("user_memory_notes").select("note, source").eq("user_id", userId).eq("active", true)
      .in("source", ["pattern_hidden", "insight_correction"]).order("created_at", { ascending: true })
      .then(({ data }) => {
        const h = new Set<string>(); const t: Record<string, [number, number]> = {};
        for (const n of data ?? []) {
          if (n.source === "pattern_hidden") { const m = n.note.match(/^(.+?) isn't a pattern for you/); if (m) h.add(m[1].toLowerCase()); }
          else { const m = n.note.match(/^Your (.+) usually comes around days (\d+) to (\d+)\.$/); if (m) t[m[1].toLowerCase()] = [+m[2], +m[3]]; }
        }
        setHidden(h); setTiming(t);
      });
  }, [userId, reload, cycleLengthDays]);
  useEffect(() => {
    const h = () => setReload((r) => r + 1);
    globalThis.addEventListener(PATTERNS_CHANGED, h);
    return () => globalThis.removeEventListener(PATTERNS_CHANGED, h);
  }, []);

  const openChooser = () => { setDraft(watch); setCustom(""); setAdding(false); setClose(null); setSaveError(false); setChooser(true); };
  const addToDraft = (name: string) => { const v = cap(name.trim()); if (v && draft.length < 3 && !draft.includes(v)) setDraft([...draft, v]); setCustom(""); setAdding(false); setClose(null); };
  const toggle = (n: string) => setDraft((d) => d.includes(n) ? d.filter((x) => x !== n) : d.length >= 3 ? d : [...d, n]);
  const save = async () => {
    const { error } = await supabase.from("participants").update({ watch_symptoms: draft }).eq("user_id", userId);
    if (error) { setSaveError(true); return; }
    const { data } = await supabase.from("participants").select("watch_symptoms").eq("user_id", userId).maybeSingle();
    setWatch((data?.watch_symptoms ?? draft) as string[]); setChooser(false);
  };

  const options = [...new Set([...watch, ...draft, ...logged, ...GOOD_DAYS])];
  type Row = { key: string; name: string; label: string; status: Status | null };
  const adj = (patterns ?? []).filter((p) => !hidden.has(p.name.toLowerCase())).map((p) => {
    const t = timing[p.name.toLowerCase()];
    return t ? { ...p, from: t[0], to: t[1], status: p.status === "Watching" ? "Emerging" as Status : p.status } : p;
  });
  const rows: Row[] = [];
  for (const w of watch) {
    if (hidden.has(w.toLowerCase())) continue;
    const p = adj.find((x) => x.name.toLowerCase() === w.toLowerCase());
    rows.push(p && p.from !== null
      ? { key: w, name: w, label: p.from === p.to ? `day ${p.from}` : `days ${p.from} to ${p.to}`, status: p.status }
      : { key: w, name: w, label: "Watching. Keep logging and I'll spot the timing.", status: null });
  }
  for (const p of adj) if (!watch.some((w) => w.toLowerCase() === p.name.toLowerCase()))
    rows.push({ key: p.name, name: p.name, label: p.from === null ? "no clear timing yet" : p.from === p.to ? `day ${p.from}` : `days ${p.from} to ${p.to}`, status: p.status });
  const visible = fullList || showAll ? rows : rows.slice(0, 3);

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[13px] font-semibold text-muted-foreground">Your patterns</p>
        <button type="button" onClick={openChooser} className="text-[13px] font-semibold text-[#0B7479] dark:text-[#2BD4D9]">Choose what to watch</button>
      </div>
      <div className="rounded-[22px] border border-border bg-card">
        {patterns === null ? (
          <div className="h-16" />
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            Log how you feel for a couple of cycles and your patterns will show up here.{" "}
            <button type="button" onClick={() => onLogFeeling()} className="font-semibold text-[#0B7479] dark:text-[#2BD4D9] underline underline-offset-2">How I feel</button>
          </p>
        ) : (
          <>
            {visible.map((p, i) => {
              const st = p.status ? STYLE[p.status] : null;
              const watched = watch.includes(p.key);
              return (
                <button key={p.key} type="button" onClick={() => setPage(p.key)}
                  className={`flex w-full items-center gap-3 px-5 py-4 text-left ${i > 0 ? "border-t border-border" : ""}`}>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 ${st ? st.dot : STYLE.Watching.dot}`} aria-hidden />
                  <span className="min-w-0 flex-1 text-[15px] text-foreground">
                    {watched && <span aria-label="Watching" className="mr-1">★</span>}{p.name}{p.status ? `, ${p.label}` : ""}
                    {!p.status && <span className="block text-[13px] text-muted-foreground">{p.label}</span>}
                  </span>
                  {p.status && <span className={`text-[13px] font-semibold ${STYLE[p.status].text}`}>{p.status}</span>}
                </button>
              );
            })}
            {!fullList && rows.length > 3 && (
              <button type="button" onClick={() => setOpen(true)}
                className="w-full border-t border-border px-5 py-3 text-left text-[13px] font-semibold text-[#0B7479] dark:text-[#2BD4D9]">
                See all
              </button>
            )}
          </>
        )}
      </div>
      <SymptomHistory open={open} onOpenChange={setOpen} userId={userId} lastPeriodStart={lastPeriodStart}
        cycleLengthDays={cycleLengthDays} isNonCycling={isNonCycling} lifeStage={lifeStage} />
      {page && (() => {
        const p = adj.find((x) => x.name.toLowerCase() === page.toLowerCase());
        const info = p ?? { name: page, from: null, to: null, cycles: 0, count: 0 };
        return (
          <PatternPage key={page} userId={userId} pattern={info} logs={logs} watched={watch.includes(page)} onOpenSymptom={setPage}
            lastPeriodStart={lastPeriodStart} isNonCycling={isNonCycling} onClose={() => setPage(null)}
            onLog={(symptom) => { setPage(null); onLogFeeling(symptom); }}
            onChanged={() => setReload((r) => r + 1)}
            onUnstar={async () => {
              const next = watch.filter((w) => w !== page);
              const { error } = await supabase.from("participants").update({ watch_symptoms: next }).eq("user_id", userId);
              if (error) throw error;
              setWatch(next);
            }} />
        );
      })()}
      <Drawer open={chooser} onOpenChange={setChooser}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle className="font-display text-2xl">What should I watch for you?</DrawerTitle></DrawerHeader>
          <div className="px-5 pb-6">
            <p className="mb-3 text-sm text-muted-foreground">Pick up to 3.</p>
            <div className="flex flex-wrap gap-2">
              {options.map((n) => {
                const on = draft.includes(n);
                return (
                  <button key={n} type="button" onClick={() => toggle(n)} aria-checked={on} role="checkbox"
                    disabled={!on && draft.length >= 3}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40 ${on ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground"}`}>
                    {on ? "★ " : ""}{n}
                  </button>
                );
              })}
              {adding ? (
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if (checking || close) return;
                  setChecking(true);
                  const rows = await findCloseWords(custom);
                  setChecking(false);
                  if (rows.length) setClose(rows); else addToDraft(custom);
                }}>
                  <input autoFocus value={custom} onChange={(e) => { setCustom(e.target.value.slice(0, 40)); setClose(null); }} onBlur={() => !custom && setAdding(false)}
                    placeholder="Type and press enter" className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground outline-none" />
                </form>
              ) : (
                <button type="button" onClick={() => setAdding(true)} disabled={draft.length >= 3}
                  className="rounded-full border border-dashed border-border bg-card px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-40">+ Add your own</button>
              )}
            </div>
            {close && <WordSuggestRows suggestions={close} onUse={addToDraft} onKeep={() => addToDraft(custom)} />}
            {saveError && <p className="mt-3 text-sm text-muted-foreground">That didn't save. Try again in a moment.</p>}
            <button type="button" onClick={save} className="mt-5 w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background">Save</button>
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
