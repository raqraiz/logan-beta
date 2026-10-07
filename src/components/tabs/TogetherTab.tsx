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
import { togetherDisplay, loadAliases } from "@/lib/symptomCatalog";
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
  onLogFeeling: (symptom: string) => void;
}

function symptomNames(logs: SymptomPageLog[]): Set<string> {
  const out = new Set<string>();
  for (const l of logs) for (const s of (Array.isArray(l.symptoms) ? l.symptoms : []) as any[]) {
    const n = typeof s === "string" ? s : s?.name;
    if (n && (typeof s === "string" || typeof s.severity !== "number" || s.severity >= 0)) out.add(key(String(n)));
  }
  return out;
}

export function TogetherTab({ userId, cycleDay, lastPeriodStart, isNonCycling, onLogFeeling }: TabProps) {
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
  }, [userId]);
  const [joined, setJoined] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const openSheet = () => { setOpen(true); trackTogether("together_consent_shown"); };

  useEffect(() => {
    let alive = true;
    const load = (auto: boolean) => loadTogether(userId).then((s) => {
      if (!alive) return;
      setJoined(s.consent);
      setLoaded(true);
      if (auto && !s.consent && !s.shownAt) {
        openSheet();
        markTogetherShown(userId);
      }
    });
    load(true);
    const sync = () => load(false);
    globalThis.addEventListener(TOGETHER_CHANGED, sync);
    return () => { alive = false; globalThis.removeEventListener(TOGETHER_CHANGED, sync); };
  }, [userId]);

  const join = async () => {
    setSaving(true);
    const ok = await setTogetherConsent(userId, true);
    setSaving(false);
    if (!ok) { toast.error("That didn't save. Try again?"); return; }
    trackTogether("together_consent_yes");
    setJoined(true);
    setOpen(false);
  };

  const notNow = () => { trackTogether("together_consent_not_now"); setOpen(false); };

  useEffect(() => {
    if (!joined) return;
    let alive = true;
    setRows(null); setAggError(false);
    Promise.all([loadAggregates(), loadAliases().then(loadCategories)])
      .then(([r, c]) => { if (alive) { setRows(r); setCats(c); } })
      .catch(() => { if (alive) setAggError(true); });
    return () => { alive = false; };
  }, [joined, retry]);

  if (!loaded) return <div className="flex-1" />;

  const mine = symptomNames(logs);
  const demo = sample ? sampleAggregates() : null;

  if (invite) return <InvitePage userId={userId} onBack={() => setInvite(false)} />;

  if (page) {
    return (
      <PatternPage userId={userId} pattern={computePatterns(logs).find((p) => key(p.name) === key(page)) ? { ...computePatterns(logs).find((p) => key(p.name) === key(page))!, name: page } : { name: page, from: null, to: null, cycles: 0, count: 0 }} logs={logs}
        watched={watch.some((w) => key(w) === key(page))} lastPeriodStart={lastPeriodStart} isNonCycling={isNonCycling}
        onClose={() => setPage(null)} onLog={(s) => { setPage(null); onLogFeeling(s); }} onChanged={() => {}} sample={sample}
        onUnstar={async () => {
          const next = watch.filter((w) => key(w) !== key(page));
          const { error } = await supabase.from("participants").update({ watch_symptoms: next }).eq("user_id", userId);
          if (error) throw error;
          setWatch(next);
        }} />
    );
  }

  const openSymptom = (n: string) => setPage(togetherDisplay(n));
  const board = (r: AggRow[], m: Set<string>, c: Map<string, TogetherCategory>) => (
    <div className="w-full text-left">
      <TogetherBoard rows={r} mine={m} cats={c} cycleDay={cycleDay} hasCycle={!isNonCycling} onOpenSymptom={openSymptom} />
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto px-5 pt-8 pb-28">
      <div className="max-w-md mx-auto text-center flex flex-col items-center gap-4">
        {isAdmin && (
          <label className="flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-border px-4 py-2 text-sm text-muted-foreground">
            Preview with sample data
            <Switch checked={sample} onCheckedChange={setSample} />
          </label>
        )}
        {demo && <div className="flex h-7 items-center self-start rounded-full bg-[#EEE9DF] px-3 text-xs font-semibold text-[#6E675F]">Sample data</div>}
        <div className="flex w-full items-center justify-between gap-3">
          <h1 className="font-heading text-[40px] font-semibold leading-tight text-foreground text-left">Together</h1>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setInvite(true)} aria-label="Invite a friend"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground">
              <UserPlus className="h-5 w-5" aria-hidden="true" />
            </button>
            <div id="together-head-slot" />
          </div>
        </div>
        {demo ? board(demo.rows, new Set([...demo.mine, ...mine]), demo.cats) : joined && aggError ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-base text-muted-foreground">Couldn't load Together right now. Try again?</p>
            <button type="button" onClick={() => setRetry((n) => n + 1)} className="rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background">Try again</button>
          </div>
        ) : joined && rows === null ? <BubbleSkeleton /> : joined && rows!.some((r) => r.filter === "everyone") ? board(rows!, mine, cats) : joined ? (
          <>
            <p className="text-base text-foreground">Thanks for being here.</p>
            <div className="w-full rounded-[22px] border border-border bg-card px-5 py-6 text-sm text-muted-foreground">
              We're just getting started. As more women join, you'll see what others feel here.
            </div>
          </>
        ) : (
          <>
            <p className="text-base text-muted-foreground">See what women like you are feeling, without sharing who you are.</p>
            <button type="button" onClick={openSheet}
              className="mt-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background">
              Count me in
            </button>
          </>
        )}
      </div>

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
