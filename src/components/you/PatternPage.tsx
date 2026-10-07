import { useEffect, useState } from "react";
import { SafetyCallout } from "@/components/SafetyCallout";
import { toast } from "sonner";
import { PATTERNS_CHANGED } from "@/lib/patternCycles";
import { symptomCardInsights, symptomDefinition, symptomPageData, type SymptomPageLog } from "@/lib/symptomPage";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useSymptomCommunity, communityLine, stageInsight, WhenWomenFeelCard } from "@/components/together/SymptomCommunity";
import { PREFILL_CHAT_EVENT } from "@/lib/partnerHeadsupClient";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

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
}

export function PatternPage({ userId, pattern, logs, watched, lastPeriodStart, isNonCycling, onClose, onLog, onUnstar, onChanged }: Props) {
  const [explain, setExplain] = useState<string | null>(null);
  const [fix, setFix] = useState(false);
  const [mode, setMode] = useState<"menu" | "timing" | "helped">("menu");
  const [fromIn, setFromIn] = useState(String(pattern.from ?? ""));
  const [toIn, setToIn] = useState(String(pattern.to ?? ""));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { name, from, to } = pattern;
  const lower = name.toLowerCase();
  const definition = symptomDefinition(name);
  const data = symptomPageData(logs, name, isNonCycling ? undefined : lastPeriodStart);
  const timing = !isNonCycling && from !== null && to !== null;
  const community = useSymptomCommunity(userId, name);
  const myWindow = timing ? { from: from as number, to: to as number } : null;
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
    const handle = (event: KeyboardEvent) => { if (event.key === "Escape" && !fix) onClose(); };
    globalThis.addEventListener("keydown", handle);
    return () => globalThis.removeEventListener("keydown", handle);
  }, [onClose, fix]);

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
    if (!(a >= 1 && b >= a && b - a <= 7 && b <= 60)) { setMsg("Pick days up to a week apart."); return; }
    if (await saveNote(`Your ${lower} usually comes around days ${a} to ${b}.`, "insight_correction")) { setFix(false); onChanged(); }
  };
  const remove = async () => {
    const id = await saveNote(`${name} isn't a pattern for you. Don't show it.`, "pattern_hidden");
    if (!id) return;
    setFix(false); onChanged(); onClose();
    globalThis.dispatchEvent(new Event(PATTERNS_CHANGED));
    toast("Hidden.", { duration: 6000, action: { label: "Undo", onClick: async () => {
      const { error } = await supabase.from("user_memory_notes").delete().eq("id", id).eq("user_id", userId);
      if (error) { toast.error("That didn't undo. Try Bring back in Your data."); return; }
      globalThis.dispatchEvent(new Event(PATTERNS_CHANGED));
    } } });
  };
  const sub = communityLine(community, data.count > 0) ?? (data.count === 0 ? "Not logged yet" : `You logged it ${data.count} time${data.count === 1 ? "" : "s"}${!isNonCycling && data.cycles ? ` in ${data.cycles} cycle${data.cycles === 1 ? "" : "s"}` : ""}`);
  const { insights, doctorAdvice } = symptomCardInsights([
    timing && explain ? explain : null,
    !timing && data.count > 0 ? "There isn't a clear timing pattern in your logs yet." : null,
    data.trend ? `At this cycle day, you've logged it ${data.trend === "Same" ? "as often as" : `${data.trend.toLowerCase()} often than`} last cycle.` : null,
    isNonCycling ? null : stageInsight(community, myWindow),
  ]);
  const tileColumns = 1 + Number(timing) + Number(Boolean(data.trend));

  return (
    <div className="symptom-page fixed inset-0 z-50 overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-label={name} data-private>
      <div className="mx-auto max-w-lg px-5 pt-5 pb-[calc(120px+env(safe-area-inset-bottom))]">
        <Button variant="outline" size="icon" onClick={onClose} aria-label="Go back" className="h-11 w-11 rounded-full text-foreground shadow-none"><ArrowLeft /></Button>
        <h1 className="mt-6 break-words font-display text-[40px] font-semibold leading-[1.1] tracking-normal text-foreground">{name}</h1>
        <p className="mt-2 text-base font-light text-muted-foreground">{sub}</p>
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
                <p className="whitespace-nowrap font-sans text-[20px] font-bold leading-snug text-foreground">{from === to ? from : `${from} to ${to}`}</p>
                <p className="mt-1 text-xs leading-snug text-muted-foreground">your usual days</p>
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
          {doctorAdvice && <p className="mt-4 text-sm font-light leading-relaxed text-muted-foreground">{doctorAdvice}</p>}
        </section>

        <WhenWomenFeelCard c={community} mine={myWindow} hasCycle={!isNonCycling && !!lastPeriodStart} />

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
              {!isNonCycling && <Button variant="outline" onClick={() => setMode("timing")} className="w-full rounded-full">The timing is off</Button>}
              {watched && <Button variant="outline" disabled={busy} onClick={async () => {
                setBusy(true);
                try { await onUnstar(); setFix(false); }
                catch { setMsg("That didn't save. Try again."); }
                finally { setBusy(false); }
              }} className="w-full rounded-full">Stop watching this</Button>}
              <Button variant="outline" disabled={busy} onClick={() => void remove()} className="w-full rounded-full">This isn't a pattern for me</Button>
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
    </div>
  );
}
