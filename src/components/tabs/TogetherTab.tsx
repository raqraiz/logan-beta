import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { InvitePage } from "@/components/together/InvitePage";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { TogetherBoard, BubbleSkeleton } from "@/components/together/TogetherBoard";
import { PatternPage } from "@/components/you/PatternPage";
import type { SymptomPageLog } from "@/lib/symptomPage";
import { loadCycleStarts, withRealCycleDays, OWN_LOG_WINDOW_DAYS } from "@/lib/realCycleDays";
import { computePatterns } from "@/components/you/YourPatterns";
import { togetherDisplay, loadAliases, groupOf, normSymptom } from "@/lib/symptomCatalog";
import { TogetherLogMode, herCounts, type LoggedEntry } from "@/components/together/TogetherLogMode";
import { BubbleField, categoryFill } from "@/components/together/TogetherBoard";
import { WatchChooser } from "@/components/together/WatchChooser";
import { useWordPrefs } from "@/hooks/useWordPrefs";
import { mapCategory } from "@/lib/togetherData";
import type { TogetherLens } from "@/lib/togetherOpen";
import { AggRow, TogetherCategory, key, loadAggregates, loadCategories, sampleAggregates } from "@/lib/togetherData";
import { loadTogether, markTogetherShown, setTogetherConsent, trackTogether, TOGETHER_BODY, TOGETHER_CHANGED } from "@/lib/together";

export function TogetherCirclesIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} style={style}>
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" />
    </svg>
  );
}


interface TabProps {
  userId: string;
  cycleDay?: number;
  lastPeriodStart?: string;
  isNonCycling: boolean;
  cycleLengthDays?: number;
  /** Lens or log mode requested from elsewhere (n changes on every request). */
  request?: { lens: TogetherLens; symptom?: string; n: number };
  onLogged: (entry: LoggedEntry) => void;
}

function symptomNames(logs: SymptomPageLog[]): Set<string> {
  const out = new Set<string>();
  for (const l of logs) for (const s of (Array.isArray(l.symptoms) ? l.symptoms : []) as any[]) {
    const n = typeof s === "string" ? s : s?.name;
    if (n && (typeof s === "string" || typeof s.severity !== "number" || s.severity >= 0)) out.add(key(String(n)));
  }
  return out;
}

export function TogetherTab({ userId, cycleDay, lastPeriodStart, isNonCycling, cycleLengthDays, request, onLogged }: TabProps) {
  const [lens, setLens] = useState<"everyone" | "mine">(request?.lens === "mine" ? "mine" : "everyone");
  const [logging, setLogging] = useState<{ symptom?: string } | null>(request?.lens === "log" ? { symptom: request.symptom } : null);
  const [reloadLogs, setReloadLogs] = useState(0);
  const [chooser, setChooser] = useState(false);
  const { prefs } = useWordPrefs(userId);
  useEffect(() => {
    if (!request) return;
    if (request.lens === "log") { setPage(null); setLogging({ symptom: request.symptom }); }
    else { setLogging(null); setLens(request.lens); }
  }, [request?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const [loaded, setLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sample, setSample] = useState(false); // in memory only; resets when she leaves the tab
  const [rows, setRows] = useState<AggRow[] | null>(null);
  const [cats, setCats] = useState<Map<string, TogetherCategory>>(new Map());
  const [aggError, setAggError] = useState(false);
  const [logs, setLogs] = useState<SymptomPageLog[]>([]);
  const [watch, setWatch] = useState<string[]>([]);
  const [page, setPage] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    supabase.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "super_admin"])
      .then(({ data }) => setIsAdmin((data?.length ?? 0) > 0));
    // Her own logs only (own-row access), last 12 months, for "you too" and the symptom page. Together totals keep 90 days server-side.
    const since = new Date(Date.now() - OWN_LOG_WINDOW_DAYS * 86400000).toISOString();
    Promise.all([
      supabase.from("symptom_logs").select("logged_at, cycle_day, symptoms, notes").eq("user_id", userId)
        .gte("logged_at", since).order("logged_at", { ascending: false }),
      loadCycleStarts(userId),
    ]).then(([{ data }, starts]) => setLogs(withRealCycleDays((data ?? []) as SymptomPageLog[], starts)));
    supabase.from("participants").select("watch_symptoms").eq("user_id", userId).maybeSingle()
      .then(({ data }) => setWatch((data?.watch_symptoms ?? []) as string[]));
    supabase.from("user_memory_notes").select("note, source").eq("user_id", userId).eq("active", true)
      .in("source", ["pattern_hidden", "symptom_forgotten", "insight_correction"]).order("created_at", { ascending: true })
      .then(({ data }) => {
        const h = new Set<string>(), f = new Set<string>(), t: Record<string, [number, number]> = {};
        for (const n of data ?? []) {
          if (n.source === "insight_correction") { const m = n.note.match(/^Your (.+?) usually comes around days (\d+) to (\d+)\./); if (m) t[normSymptom(m[1])] = [Number(m[2]), Number(m[3])]; continue; }
          const m = n.note.match(/^(.+?) (isn't a pattern for you|: forgotten)/) ?? n.note.match(/^(.+?):/);
          if (!m) continue;
          h.add(normSymptom(m[1]));
          if (n.source === "symptom_forgotten") f.add(normSymptom(m[1]));
        }
        setHiddenMine(h); setForgot(f); setTimingFix(t);
      });
  }, [userId, reloadLogs]);
  const [hiddenMine, setHiddenMine] = useState<Set<string>>(new Set());
  const [forgot, setForgot] = useState<Set<string>>(new Set());
  const [timingFix, setTimingFix] = useState<Record<string, [number, number]>>({});
  const [mineList, setMineList] = useState(false);
  const [joined, setJoined] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const openSheet = () => { setOpen(true); trackTogether("together_consent_shown"); };

  useEffect(() => {
    let alive = true;
    const load = () => loadTogether(userId).then((s) => {
      if (!alive) return;
      setJoined(s.consent);
      setLoaded(true);
    });
    load();
    const sync = () => load();
    globalThis.addEventListener(TOGETHER_CHANGED, sync);
    return () => { alive = false; globalThis.removeEventListener(TOGETHER_CHANGED, sync); };
  }, [userId]);

  const join = async () => {
    setSaving(true);
    const ok = await setTogetherConsent(userId, true);
    setSaving(false);
    if (!ok) { toast.error("That didn't save. Try again?"); return; }
    trackTogether("together_consent_yes");
    void markTogetherShown(userId);
    setJoined(true);
    setOpen(false);
  };

  const notNow = () => { trackTogether("together_consent_not_now"); void markTogetherShown(userId); setOpen(false); };

  // Everyone can see Together; consent only decides whether her logs count.
  useEffect(() => {
    let alive = true;
    setRows(null); setAggError(false);
    Promise.all([loadAggregates(), loadAliases().then(loadCategories)])
      .then(([r, c]) => { if (alive) { setRows(r); setCats(c); } })
      .catch(() => { if (alive) setAggError(true); });
    return () => { alive = false; };
  }, [retry]);

  if (!loaded) return <div className="flex-1" />;

  const mine = symptomNames(logs);
  const demo = sample ? sampleAggregates() : null;

  if (invite) return <InvitePage userId={userId} onBack={() => setInvite(false)} />;

  if (page) {
    const forgotten = forgot.has(normSymptom(page));
    const pageLogs = forgotten ? [] : logs;
    const found = forgotten ? undefined : computePatterns(logs).find((p) => key(p.name) === key(page));
    const fixed = timingFix[normSymptom(page)];
    const info = found ? { ...found, name: page, ...(fixed ? { from: fixed[0], to: fixed[1] } : {}) } : { name: page, from: null, to: null, cycles: 0, count: 0 };
    return (
      <PatternPage userId={userId} pattern={info} logs={pageLogs}
        watched={watch.some((w) => key(w) === key(page))} lastPeriodStart={lastPeriodStart} isNonCycling={isNonCycling}
        onClose={() => setPage(null)} onLog={(s) => { setPage(null); setLogging({ symptom: s }); }} onChanged={() => setReloadLogs((n) => n + 1)} sample={sample}
        onUnstar={async () => {
          const next = watch.filter((w) => key(w) !== key(page));
          const { error } = await supabase.from("participants").update({ watch_symptoms: next }).eq("user_id", userId);
          if (error) throw error;
          setWatch(next);
        }} />
    );
  }

  const openSymptom = (n: string) => setPage(togetherDisplay(n));
  const notCounted = !joined && !demo ? (
    <p className="text-center text-sm text-muted-foreground">Your logs aren't counted yet. <button type="button" onClick={openSheet} className="font-semibold text-foreground underline underline-offset-2">Count me in</button></p>
  ) : null;
  const board = (r: AggRow[], m: Set<string>, c: Map<string, TogetherCategory>) => (
    <div className="w-full text-left">
      <TogetherBoard rows={r} mine={m} cats={c} cycleDay={cycleDay} hasCycle={!isNonCycling} onOpenSymptom={openSymptom} notCounted={notCounted} />
    </div>
  );

  if (logging) {
    return (
      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-28">
        <div className="mx-auto max-w-md">
          <TogetherLogMode key={logging.symptom ?? "log"} userId={userId} logs={logs} aggRows={rows} cycleDay={cycleDay} lastPeriodStart={lastPeriodStart}
            cycleLengthDays={cycleLengthDays} isNonCycling={isNonCycling} preselect={logging.symptom}
            onCancel={() => setLogging(null)}
            onLogged={(e) => { setLogging(null); setReloadLogs((n) => n + 1); onLogged(e); }} />
        </div>
      </div>
    );
  }

  const counts = herCounts(logs, prefs).filter((c) => !hiddenMine.has(normSymptom(c.name)));
  const isWatched = (n: string) => watch.some((w) => normSymptom(w) === normSymptom(n));
  const topCount = counts[0]?.n ?? 1;
  // At most 20 bubbles: watched ones always included, then her most logged.
  const watchedCounts = counts.filter((c) => isWatched(c.name));
  const shownCounts = [...watchedCounts, ...counts.filter((c) => !isWatched(c.name))].slice(0, Math.max(20, watchedCounts.length))
    .sort((a, b) => b.n - a.n);
  const mineItems = shownCounts.map((c, i) => {
    const t = Math.sqrt(c.n / topCount);
    return { id: c.name, label: c.name, t, star: isWatched(c.name), fill: categoryFill(mapCategory(groupOf(c.name)) ?? undefined, t, i) };
  });

  const Lens = (
    <div className="flex rounded-full border border-border bg-card p-[3px]" role="tablist" aria-label="Whose symptoms">
      {(["everyone", "mine"] as const).map((id) => {
        const on = lens === id;
        return (
          <button key={id} type="button" role="tab" aria-selected={on} onClick={() => setLens(id)}
            className={`relative h-[34px] rounded-full px-3 text-[13px] after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] ${on ? "bg-[#23201C] font-bold text-[#F4F1EA] dark:bg-foreground dark:text-background" : "font-medium text-foreground"}`}>
            {on ? `✓ ${id === "everyone" ? "Everyone" : "Mine"}` : id === "everyone" ? "Everyone" : "Mine"}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="relative flex-1 overflow-y-auto px-5 pt-8 pb-48">
      <div className="max-w-md mx-auto text-center flex flex-col items-center gap-4">
        {isAdmin && lens === "everyone" && (
          <label className="flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-4 py-2 text-sm text-muted-foreground">
            Preview with sample data
            <Switch checked={sample} onCheckedChange={setSample} />
          </label>
        )}
        {demo && lens === "everyone" && <div className="flex h-7 items-center self-start rounded-full bg-[#EEE9DF] px-3 text-xs font-semibold text-[#6E675F]">Sample data</div>}
        <div className="flex w-full items-center justify-between gap-2">
          <h1 className="font-heading text-[36px] font-semibold leading-tight text-foreground text-left">Together</h1>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setInvite(true)} aria-label="Invite a friend"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground">
              <UserPlus className="h-5 w-5" aria-hidden="true" />
            </button>
            {lens === "everyone" && <div id="together-head-slot" />}
          </div>
        </div>
        <div className="self-start">{Lens}</div>
        {lens === "mine" && mineList ? (
          <div className="flex w-full flex-col gap-3 text-left">
            <button type="button" onClick={() => setMineList(false)} className="self-start text-sm font-semibold text-foreground underline underline-offset-2">‹ Back to bubbles</button>
            <div className="overflow-hidden rounded-[22px] bg-card">
              {counts.map((c) => (
                <button key={c.name} type="button" onClick={() => openSymptom(c.name)}
                  className="flex w-full items-center justify-between border-b border-border px-5 py-4 text-left text-[15px] text-foreground last:border-0">
                  <span>{isWatched(c.name) ? "★ " : ""}{c.name}</span>
                  <span className="text-sm text-muted-foreground">{c.n} {c.n === 1 ? "time" : "times"} ›</span>
                </button>
              ))}
            </div>
          </div>
        ) : lens === "mine" ? (
          <div className="flex w-full flex-col gap-4">
            <p className="text-left text-base text-muted-foreground">{counts.length} thing{counts.length === 1 ? "" : "s"} you've told me about.</p>
            {counts.length ? <BubbleField items={mineItems} onTap={openSymptom} /> : (
              <div className="rounded-[22px] border border-border bg-card px-5 py-6 text-sm text-muted-foreground">Nothing logged yet. Tell me how you feel and it will show up here.</div>
            )}
            <p className="text-center text-sm text-muted-foreground">Bigger bubbles are what you feel most. ★ You're watching these. Tap one to see your pattern.</p>
            <button type="button" onClick={() => setChooser(true)} className="self-center text-sm font-semibold text-foreground underline underline-offset-2">Choose what to watch</button>
            {counts.length > 0 && <button type="button" onClick={() => setMineList(true)} className="self-center text-sm font-semibold text-foreground underline">{counts.length > shownCounts.length ? `See all ${counts.length} as a list ›` : "See all as a list ›"}</button>}
          </div>
        ) : demo ? board(demo.rows, new Set([...demo.mine, ...mine]), demo.cats) : aggError ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-base text-muted-foreground">Couldn't load Together right now. Try again?</p>
            <button type="button" onClick={() => setRetry((n) => n + 1)} className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background">Try again</button>
          </div>
        ) : rows === null ? <BubbleSkeleton /> : rows.some((r) => r.filter === "everyone") ? board(rows, mine, cats) : (
          <>
            <div className="w-full rounded-[22px] border border-border bg-card px-5 py-6 text-sm text-muted-foreground">
              We're just getting started. As more women join, you'll see what others feel here.
            </div>
            {notCounted}
          </>
        )}
      </div>

      <button type="button" onClick={() => setLogging({})}
        className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] right-5 z-30 h-12 rounded-full bg-foreground px-5 text-[15px] font-semibold text-background shadow-lg">
        + Log how I feel
      </button>

      <WatchChooser userId={userId} open={chooser} onOpenChange={setChooser} watch={watch} logged={counts.map((c) => c.name)} onSaved={setWatch} />

      <Sheet open={open} onOpenChange={(o) => { if (!o) notNow(); }}>
        <SheetContent side="bottom" className="rounded-t-[28px] px-6 pb-10 pt-8">
          <div className="max-w-md mx-auto flex flex-col gap-4">
            <SheetTitle className="font-heading text-[34px] font-semibold text-foreground">Count me in</SheetTitle>
            <SheetDescription className="text-[15px] font-normal leading-relaxed text-foreground">{TOGETHER_BODY}</SheetDescription>
            <button type="button" disabled={saving} onClick={join}
              className="mt-2 w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background disabled:opacity-60">
              Count me in
            </button>
            <button type="button" onClick={notNow} className="text-sm text-muted-foreground underline">Not now</button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
