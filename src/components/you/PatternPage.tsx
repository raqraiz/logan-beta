import { useEffect, useState } from "react";
import { SafetyCallout } from "@/components/SafetyCallout";
import { toast } from "sonner";
import { PATTERNS_CHANGED, windowDays } from "@/lib/patternCycles";
import { isCheckFirstSymptom, isUrgentSymptom, ownSymptomPairs, symptomCardInsights, symptomDefinition, symptomPageData, type SymptomPageLog } from "@/lib/symptomPage";
import { loadCycleStarts } from "@/lib/realCycleDays";
import { togetherDisplay, isKnownSymptom } from "@/lib/symptomCatalog";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { sampleSymptomDetail } from "@/lib/togetherData";
import { useSymptomCommunity, CommonRing, communityLine, stageInsight, WhenWomenFeelCard } from "@/components/together/SymptomCommunity";
import { WhatHelpedPage, ShareTipPage } from "@/components/together/WhatHelped";
import { loadTipSummary, myTipLabel, TIPS_CHANGED } from "@/lib/tips";
import { PREFILL_CHAT_EVENT } from "@/lib/partnerHeadsupClient";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";

export interface PatternInfo { name: string; from: number | null; to: number | null; cycles: number; count: number }
interface Props {
  userId: string;
  pattern: PatternInfo;
  logs: SymptomPageLog[];
  watched: boolean;
  lastPeriodStart?: string;
  isNonCycling: boolean;
  onClose: () => void;
  onLog: (symptom: string) => void;
  onUnstar: () => Promise<void>;
  onChanged: () => void;
  sample?: boolean;
  onOpenSymptom?: (symptom: string) => void;
}

export function PatternPage({ userId, pattern, logs, watched, lastPeriodStart, isNonCycling, onClose, onLog, onUnstar, onChanged, sample = false, onOpenSymptom }: Props) {
  const [cycleStarts, setCycleStarts] = useState<string[]>([]);
  useEffect(() => { let alive = true; void loadCycleStarts(userId).then((s) => { if (alive) setCycleStarts(s); }); return () => { alive = false; }; }, [userId]);
  const [explain, setExplain] = useState<string | null>(null);
  const [fix, setFix] = useState(false);
  const [mode, setMode] = useState<"menu" | "timing" | "helped">("menu");
  const [fromIn, setFromIn] = useState(String(pattern.from ?? ""));
  const [toIn, setToIn] = useState(String(pattern.to ?? ""));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const { name, from, to } = pattern;
  const lower = name.toLowerCase();
  const definition = symptomDefinition(name);
  const demoRaw = sample ? sampleSymptomDetail(name) : null;
  const realData = symptomPageData(logs, name, isNonCycling ? undefined : lastPeriodStart);
  // Sample preview never replaces her real logs: sample logs only for symptoms she has none of.
  const demo = demoRaw && realData.count === 0 ? demoRaw : null;
  const data = demo ? symptomPageData(demo.logs, name, isNonCycling ? undefined : lastPeriodStart) : realData;
  const timing = !isNonCycling && from !== null && to !== null;
  const community = useSymptomCommunity(userId, name, sample);
  const myWindow = data.count < 2 || isNonCycling ? null : demo ? demo.window : timing ? { from: from as number, to: to as number } : null;
  const safetySymptom = isUrgentSymptom(name);
  const checkFirst = isCheckFirstSymptom(name);
  // Check-first symptoms: only women with logs in 2+ real cycles may share or vote.
  const canContribute = !checkFirst || realData.cycles >= 2;
  const [tipView, setTipView] = useState<"none" | "list" | "share">("none");
  const [tipSummary, setTipSummary] = useState<{ count: number; top: number } | null>(null);
  const [tipLabel, setTipLabel] = useState("Someone in Together");
  useEffect(() => {
    if (safetySymptom || sample) return;
    let alive = true;
    const load = () => loadTipSummary(name).then((s) => { if (alive) setTipSummary(s); }).catch(() => {});
    load(); void myTipLabel(userId).then((l) => { if (alive) setTipLabel(l); });
    globalThis.addEventListener(TIPS_CHANGED, load);
    return () => { alive = false; globalThis.removeEventListener(TIPS_CHANGED, load); };
  }, [name, userId, safetySymptom, sample]);
  const openTips = () => {
    if (tipSummary?.count) { setTipView("list"); return; }
    if (!community.joined) { community.openConsent(); return; }
    setTipView("share");
  };
  const askLogan = () => { onClose(); setTimeout(() => globalThis.dispatchEvent(new CustomEvent(PREFILL_CHAT_EVENT, { detail: `Why does my ${lower} happen?` })), 0); };

  useEffect(() => {
    if (!timing || !data.count) return;
    let cancelled = false;
    const key = `logan:pattern-explain:${lower}:${from}:${to}`;
    try {
      const cached = localStorage.getItem(key);
      if (cached) { setExplain(JSON.parse(cached).text ?? null); return; }
    } catch { /* ignore unavailable cache */ }
    supabase.functions.invoke("pattern-explain", { body: { symptom: name, from, to } }).then(({ data: response }) => {
      if (cancelled) return;
      const text = response?.text ?? null;
      setExplain(text);
      if (text) try { localStorage.setItem(key, JSON.stringify(response)); } catch { /* ignore */ }
    });
    return () => { cancelled = true; };
  }, [name, lower, from, to, timing, data.count]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => { if (event.key === "Escape" && !fix && tipView === "none") onClose(); };
    globalThis.addEventListener("keydown", handle);
    return () => globalThis.removeEventListener("keydown", handle);
  }, [onClose, fix, tipView]);

  const saveNote = async (note: string, source: string) => {
    setBusy(true);
    const { data: saved, error } = await supabase.from("user_memory_notes").insert({ user_id: userId, note, source, active: true }).select("id").single();
    if (error || !saved) { setMsg("That didn't save. Try again."); setBusy(false); return null; }
    const { data: verified, error: readError } = await supabase.from("user_memory_notes").select("id").eq("id", saved.id).eq("user_id", userId).maybeSingle();
    setBusy(false);
    if (readError || !verified) { setMsg("I couldn't confirm that saved. Please check Your data."); return null; }
    return verified.id;
  };
  const saveTiming = async () => {
    const a = parseInt(fromIn, 10), b = parseInt(toIn || fromIn, 10);
    if (!windowDays({ from: a, to: b }, community.cycleLength).length || windowDays({ from: a, to: b }, community.cycleLength).length > 7) { setMsg("Pick days up to a week apart."); return; }
    if (await saveNote(`Your ${lower} usually comes around days ${a} to ${b}.`, "insight_correction")) { setFix(false); onChanged(); }
  };
  const remove = async () => {
    const id = await saveNote(`${name}: don't have this anymore. Hide it from Mine.`, "pattern_hidden");
    if (!id) return;
    setFix(false); onChanged(); onClose();
    globalThis.dispatchEvent(new Event(PATTERNS_CHANGED));
    toast("Hidden from Mine.", { duration: 6000, action: { label: "Undo", onClick: async () => {
      const { error } = await supabase.from("user_memory_notes").delete().eq("id", id).eq("user_id", userId);
      if (error) { toast.error("That didn't undo. Try again."); return; }
      globalThis.dispatchEvent(new Event(PATTERNS_CHANGED));
      onChanged();
    } } });
  };
  const forgetAll = async () => {
    const id = await saveNote(`${name}: forgotten. Don't use her logs for patterns.`, "symptom_forgotten");
    if (!id) return;
    await supabase.from("user_memory_notes").delete().eq("user_id", userId).eq("source", "insight_correction").ilike("note", `Your ${lower} usually comes%`);
    if (watched) { try { await onUnstar(); } catch { /* watch list stays; forget still saved */ } }
    setConfirmForget(false); setFix(false); onChanged(); onClose();
    globalThis.dispatchEvent(new Event(PATTERNS_CHANGED));
    toast(`Forgot ${lower}.`);
  };
  const sharedLine = communityLine(community, data.count > 0);
  const sub = sharedLine ?? (isKnownSymptom(name) ? "Women's numbers show once more of us share." : "Only your words so far.");
  const ownPairs = isNonCycling ? [] : ownSymptomPairs(logs, name, cycleStarts);
  const pairs = community.pairs.length ? community.pairs : ownPairs;
  const compare = isNonCycling ? null : stageInsight(community, myWindow);
  const oneCycleOnly = !isNonCycling && data.count >= 2 && data.cycles === 1;
  const timingNote = !myWindow && !compare && data.count > 0
    ? oneCycleOnly
      ? "All in one cycle so far. After your next cycle I can tell you when it usually shows up."
      : "There isn't a clear timing pattern in your logs yet."
    : null;
  const { insights } = symptomCardInsights([
    timing && explain ? explain : null,
    timingNote ? { text: timingNote, keepTogether: true } : null,
    data.trend ? `At this cycle day, you've logged it ${data.trend === "Same" ? "as often as" : `${data.trend.toLowerCase()} often than`} last cycle.` : null,
    compare,
  ]);
  const tileColumns = 1 + Number(timing) + Number(Boolean(data.trend));

  return (
    <div className="symptom-page fixed inset-0 z-50 overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-label={name} data-private>
      <div className="mx-auto max-w-lg px-5 pt-5 pb-[calc(120px+env(safe-area-inset-bottom))]">
        <Button variant="outline" size="icon" onClick={onClose} aria-label="Go back" className="h-11 w-11 rounded-full text-foreground shadow-none"><ArrowLeft /></Button>
        <div className="mt-6 flex items-center gap-4">
          <CommonRing c={community} sheLogged={data.count > 0} />
          <div className="min-w-0 flex-1">
            <h1 className={`break-words font-display ${name.length > 12 ? "text-[36px] leading-[38px]" : "text-[44px] leading-[44px]"} font-semibold tracking-normal text-foreground`}>{name}</h1>
            <p className="mt-2 font-sans text-sm text-muted-foreground">{sub}</p>
            {!sharedLine && !community.joined && <Button variant="link" onClick={community.openConsent} className="h-auto px-0 py-1 text-xs text-muted-foreground underline">Count me in</Button>}
          </div>
        </div>
        {watched && <p className="symptom-watch mt-2 text-sm font-semibold">★ You're watching this</p>}

        <section className="mt-7 rounded-[22px] bg-card p-5" aria-labelledby="symptom-definition-label">
          <h2 id="symptom-definition-label" className="font-sans text-[13px] font-semibold tracking-normal text-muted-foreground">What it is</h2>
          <p className="mt-3 text-[15px] font-light leading-relaxed text-foreground">{definition.text}</p>
          {definition.safety && <SafetyCallout className="mt-4" />}
        </section>

        <section className="mt-4 rounded-[22px] bg-card p-5" aria-labelledby="symptom-personal-label">
          <h2 id="symptom-personal-label" className="break-words font-sans text-[13px] font-semibold tracking-normal text-muted-foreground">Your {lower}</h2>
          {data.count === 0 ? <>
            <p className="mt-4 text-[15px] font-light leading-relaxed text-foreground">Log it when it happens and I'll start spotting your pattern.</p>
            <Button variant="ghost" onClick={() => onLog(name)} className="mt-5 rounded-full bg-foreground px-6 font-semibold text-background hover:bg-foreground hover:text-background">Log it now</Button>
          </> : data.count === 1 ? (
            <p className="mt-4 text-[15px] font-light leading-relaxed text-foreground">One log so far. Log it again when it happens and I'll look for a pattern.</p>
          ) : <>
            <div className={`mt-4 grid gap-2 ${tileColumns === 3 ? "grid-cols-3" : tileColumns === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
              <div className="symptom-stat min-w-0 rounded-[14px] px-2 py-3 text-center">
                <p className="whitespace-nowrap font-sans text-[20px] font-bold leading-snug text-foreground">{data.count} {data.count === 1 ? "time" : "times"}</p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{!isNonCycling && data.cycles ? `in ${data.cycles} cycle${data.cycles === 1 ? "" : "s"}` : "logged"}</p>
              </div>
              {timing && <div className="symptom-stat min-w-0 rounded-[14px] px-2 py-3 text-center">
                <p className={`whitespace-nowrap font-sans ${tileColumns === 3 && from !== to ? "text-[14px]" : "text-[20px]"} font-bold leading-snug text-foreground`}>Days {from === to ? from : `${from} to ${to}`}</p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{myWindow && windowDays(myWindow, community.cycleLength).includes(1) ? "around your period" : "your usual days"}</p>
              </div>}
              {data.trend && <div className="symptom-stat min-w-0 rounded-[14px] px-2 py-3 text-center">
                <p className="whitespace-nowrap font-sans text-[20px] font-bold leading-snug text-foreground">{data.trend}</p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">{data.trend === "Same" ? "as last cycle" : "than last cycle"}</p>
              </div>}
            </div>
            {insights.length > 0 && <ul className="mt-5 space-y-3">
              {insights.map((text) => <li key={text} className="flex items-start gap-2.5 text-[15px] font-light leading-relaxed text-foreground"><span className="symptom-insight-dot mt-2 h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden="true" /><span>{text}</span></li>)}
            </ul>}
            {data.helped && <Button variant="ghost" onClick={() => { setMode("helped"); setFix(true); }} className="mt-4 h-auto w-full justify-between whitespace-normal px-0 text-left text-sm text-foreground">What helped you: {data.helped}<ChevronRight /></Button>}
          </>}
        </section>

        <WhenWomenFeelCard c={community} mine={myWindow} loggedDays={realData.loggedDays} hasCycle={!isNonCycling && (!!lastPeriodStart || sample)} />

        <section className="mt-4 rounded-[22px] bg-card p-5" aria-labelledby="symptom-pairs-label">
          <h2 id="symptom-pairs-label" className="font-sans text-[15px] font-semibold text-foreground">{!community.pairs.length && ownPairs.length ? "For you, often with" : "Often felt together"}</h2>
          {pairs.length ? <div className="mt-3 flex flex-wrap gap-2">
            {pairs.map((n) => <Button key={n} variant="outline" onClick={() => onOpenSymptom?.(togetherDisplay(n))} className="h-11 max-w-full whitespace-normal rounded-full border-border text-foreground shadow-none">{togetherDisplay(n)}</Button>)}
          </div> : <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{community.error ? "Shared pairings couldn't load. Try again later." : "Once more women share, you'll see what often comes with it."}</p>}
        </section>

        {safetySymptom ? <section className="mt-4 rounded-[22px] bg-foreground p-5 text-background" aria-labelledby="symptom-shared-help-label">
          <h2 id="symptom-shared-help-label" className="font-sans text-[15px] font-semibold">What helped other women</h2>
          <p className="mt-3 text-sm leading-relaxed">For this one, a doctor is the best first step.</p>
          <Button variant="link" onClick={askLogan} className="mt-1 h-11 px-0 text-sm font-semibold text-background underline underline-offset-2">Ask Logan</Button>
        </section> : <button type="button" onClick={openTips} disabled={sample} className="mt-4 flex w-full items-center justify-between gap-3 rounded-[22px] bg-foreground p-5 text-left text-background" aria-labelledby="symptom-shared-help-label">
          <span>
            <span id="symptom-shared-help-label" className="block font-sans text-[15px] font-semibold">What helped other women</span>
            <span className="mt-3 block text-sm leading-relaxed">{tipSummary?.count ? `${tipSummary.count} ${tipSummary.count === 1 ? "tip" : "tips"} · top one helped ${tipSummary.top} ${tipSummary.top === 1 ? "woman" : "women"}` : "No tips yet. Be the first to share what helped you."}</span>
          </span>
          <ChevronRight className="shrink-0" aria-hidden="true" />
        </button>}

        <section className="mt-4 flex items-center justify-between gap-3 rounded-[22px] bg-card p-5">
          <h2 className="font-sans text-[13px] font-semibold tracking-normal text-muted-foreground">Why it happens</h2>
          <Button variant="outline" onClick={askLogan} className="h-11 rounded-full px-5 text-sm font-semibold text-foreground shadow-none">Ask Logan</Button>
        </section>

        <Button variant="link" onClick={() => { setMode("menu"); setMsg(null); setFix(true); }} className="mt-8 px-0 text-sm font-normal text-muted-foreground underline underline-offset-2">Not right?</Button>
      </div>
      <Drawer open={fix} onOpenChange={setFix}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle className="font-display text-2xl">{mode === "helped" ? "What helped you" : "What's not right?"}</DrawerTitle></DrawerHeader>
          <div className="space-y-2 px-5 pb-6">
            {mode === "helped" ? <p className="text-sm text-foreground">{data.helped}</p> : mode === "menu" ? <>
              {!isNonCycling && <Button variant="outline" onClick={() => setMode("timing")} className="w-full rounded-full">This timing is wrong</Button>}
              <Button variant="outline" disabled={busy} onClick={() => void remove()} className="w-full rounded-full">I don't have this anymore</Button>
              <Button variant="outline" disabled={busy} onClick={() => setConfirmForget(true)} className="w-full whitespace-normal rounded-full">Forget everything about {lower}</Button>
            </> : <div className="space-y-3">
              <p className="text-sm text-muted-foreground">When does {lower} usually come?</p>
              <div className="flex items-center gap-2 text-sm text-foreground">
                Day <input inputMode="numeric" value={fromIn} onChange={(e) => setFromIn(e.target.value.replace(/\D/g, "").slice(0, 2))} className="w-14 rounded-full border border-border bg-card px-3 py-2 text-center" aria-label="From day" />
                to <input inputMode="numeric" value={toIn} onChange={(e) => setToIn(e.target.value.replace(/\D/g, "").slice(0, 2))} className="w-14 rounded-full border border-border bg-card px-3 py-2 text-center" aria-label="To day" />
              </div>
              <Button variant="ghost" disabled={busy} onClick={() => void saveTiming()} className="w-full rounded-full bg-foreground font-semibold text-background hover:bg-foreground hover:text-background">Save</Button>
            </div>}
            {msg && <p role="alert" className="text-sm text-muted-foreground">{msg}</p>}
          </div>
        </DrawerContent>
      </Drawer>
      {community.consentSheet}
      {tipView === "list" && <WhatHelpedPage symptom={name} joined={community.joined} onJoin={community.openConsent} onBack={() => setTipView("none")} onShare={() => setTipView("share")} />}
      {tipView === "share" && !safetySymptom && <ShareTipPage symptom={name} label={tipLabel} onBack={() => setTipView(tipSummary?.count ? "list" : "none")} onDone={() => setTipView(tipSummary?.count ? "list" : "none")} />}
      <AlertDialog open={confirmForget} onOpenChange={(v) => !busy && setConfirmForget(v)}>
        <AlertDialogContent className="w-[calc(100%-40px)] rounded-[22px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-3xl">Forget {lower}?</AlertDialogTitle>
            <AlertDialogDescription>Your logs stay, but I'll stop using them for patterns.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmForget(false)}>Keep</Button>
            <Button variant="destructive" disabled={busy} onClick={() => void forgetAll()}>Forget</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
