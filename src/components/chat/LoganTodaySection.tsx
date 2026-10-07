import { forwardRef, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useDailyHomeInsights } from "@/hooks/useDailyHomeInsights";
import { usePartnerHeadsupFlag } from "@/hooks/usePartnerHeadsupFlag";
import { HormoneBasicsCard } from "@/components/chat/OnboardingEducation";
import { daysUntilNextPeriod } from "@/lib/nextPeriod";
import { getPostpartumPhase } from "@/lib/postpartumPhases";
import { getPostpartumTimeline } from "@/lib/postpartumTimeline";
import {
  HEADSUP_UPDATED_EVENT, OPEN_CHAT_EVENT, loadPeople, pickHomePerson, startOnDemandDraft, type HeadsupPerson,
} from "@/lib/partnerHeadsupClient";

type LifeStage = "cycling" | "irregular" | "postpartum" | "menopause" | "perimenopause" | "pregnancy_loss" | "pregnant";

export interface LoganTodayCycle {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
  lastPeriodStart?: string;
  lifeStage?: LifeStage;
  postpartumStartDate?: string;
  postpartumActive?: boolean;
  needsPeriodStart?: boolean;
  cycleAnchorType?: "bleed" | "marker";
}

interface Props {
  userId: string;
  cycle: LoganTodayCycle | null;
  onOpenYou: () => void;
}

const PHASE_LABEL: Record<string, string> = {
  Menstruation: "Period", Menstrual: "Period", Follicular: "Follicular", Ovulation: "Ovulation", Ovulatory: "Ovulation", Luteal: "Luteal",
};

function statusLine(c: LoganTodayCycle): string | null {
  if (c.lifeStage !== "cycling" || !c.lastPeriodStart || c.needsPeriodStart) return null;
  const n = daysUntilNextPeriod(c.lastPeriodStart, c.cycleLengthDays || 28);
  const noun = c.cycleAnchorType === "marker" ? "New cycle" : "Period";
  if (n <= 0) return `${noun} expected today`;
  if (n === 1) return `${noun} in about 1 day`;
  return `${noun} in about ${n} days`;
}

function TodayRing({ cycle, onOpen }: { cycle: LoganTodayCycle; onOpen: () => void }) {
  const tracking = (cycle.lifeStage === "cycling") && cycle.cycleDay > 0 && cycle.phase !== "Unknown";
  const len = cycle.cycleLengthDays || 28;
  const pct = tracking ? Math.min(1, cycle.cycleDay / len) : 1;
  const r = 46;
  const circ = 2 * Math.PI * r;
  const status = statusLine(cycle);
  return (
    <button type="button" onClick={onOpen} aria-label="Open your cycle details" className="mx-auto flex flex-col items-center gap-3">
      <div className="relative h-[190px] w-[190px]">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
          <defs>
            <linearGradient id="logan-today-ring-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FF2E92" /><stop offset="50%" stopColor="#A22BE8" /><stop offset="100%" stopColor="#2BD4D9" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="2" />
          <circle cx="50" cy="50" r={r} fill="none" stroke="url(#logan-today-ring-grad)" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {tracking ? (
            <>
              <span className="text-xs font-medium text-muted-foreground">Day</span>
              <span className="font-heading text-[60px] font-semibold leading-none text-foreground [font-variant-numeric:lining-nums]">{cycle.cycleDay}</span>
              <span className="mt-1 text-sm font-medium text-muted-foreground">{PHASE_LABEL[cycle.phase] ?? cycle.phase}</span>
            </>
          ) : (
            <span className="font-heading text-3xl font-semibold text-foreground">Today</span>
          )}
        </div>
      </div>
      {status && <p className="text-sm font-medium text-muted-foreground">{status}</p>}
    </button>
  );
}

function PartnerToday({ userId, help, skip }: { userId: string; help: string[]; skip: string[] }) {
  const visible = usePartnerHeadsupFlag(userId);
  const [person, setPerson] = useState<HeadsupPerson | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const load = async () => {
      const [ppl, { data: st }] = await Promise.all([
        loadPeople(userId),
        supabase.from("partner_headsup_settings").select("enabled").eq("user_id", userId).maybeSingle(),
      ]);
      setPerson(pickHomePerson(ppl));
      setEnabled(st ? st.enabled : false);
    };
    void load();
    globalThis.addEventListener(HEADSUP_UPDATED_EVENT, load);
    return () => globalThis.removeEventListener(HEADSUP_UPDATED_EVENT, load);
  }, [visible, userId]);

  if (!visible || !person || !enabled || !help[0]) return null;

  const send = async () => {
    setBusy(true);
    const id = await startOnDemandDraft(userId, { partnerTips: { help: help.slice(0, 2), skip: skip.slice(0, 1) }, personId: person.id });
    setBusy(false);
    if (id) globalThis.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { focusMessageId: id } }));
  };

  return (
    <div className="flex items-center gap-3 rounded-[28px] border border-border bg-card p-5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-bold text-primary">
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden /> For {person.name} today
        </p>
        <p className="mt-1 text-sm text-foreground">{help[0]}</p>
      </div>
      <button type="button" onClick={() => void send()} disabled={busy} aria-label={`Send to ${person.name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40">
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Logan home: today's ring, Today card and partner card at the start of today's messages. */
export const LoganTodaySection = forwardRef<HTMLDivElement, Props>(function LoganTodaySection({ userId, cycle, onOpenYou }, ref) {
  const [shown, setShown] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(t); }, []);

  // Same context as the You tab so both read the same cached row.
  const isPp = cycle?.lifeStage === "postpartum" || !!cycle?.postpartumActive;
  const ppPhase = getPostpartumPhase(cycle?.postpartumStartDate);
  const ppWeeks = cycle?.postpartumStartDate ? getPostpartumTimeline(cycle.postpartumStartDate)?.weeks ?? null : null;
  const { insights } = useDailyHomeInsights({
    userId,
    lifeStage: cycle?.lifeStage,
    phase: cycle?.phase,
    cycleDay: cycle?.cycleDay,
    cycleLengthDays: cycle?.cycleLengthDays,
    postpartumPhase: isPp ? ppPhase : undefined,
    postpartumWeeks: ppWeeks,
    anchorSymptom: null,
    enabled: !!cycle && !(isPp && ppPhase === "unset"),
  });

  const succeed = insights?.succeed.slice(0, 3) ?? [];
  const avoid = insights?.dontMessUp.slice(0, 3) ?? [];
  const tracking = cycle?.lifeStage === "cycling" && !!cycle.cycleDay && cycle.phase !== "Unknown";
  const subtitle = tracking ? `Day ${cycle!.cycleDay}, ${(PHASE_LABEL[cycle!.phase] ?? cycle!.phase).toLowerCase()} phase` : "Here's what I'd keep in mind";

  return (
    <div ref={ref} data-logan-today
      className={`space-y-4 transition-all duration-[400ms] ease-out motion-reduce:transition-none ${shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
      {cycle && <TodayRing cycle={cycle} onOpen={onOpenYou} />}

      <div className="rounded-[28px] border border-border bg-card p-6">
        <h2 className="font-heading text-[32px] font-semibold leading-tight text-foreground">Today</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

        {insights ? (
          <div className="mt-5 space-y-5">
            {succeed.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-foreground">How to succeed</p>
                <ul className="space-y-2">
                  {succeed.map((t, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-foreground">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />{t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {avoid.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-foreground">How not to mess up</p>
                <ul className="space-y-2">
                  {avoid.map((t, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-foreground">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border-[1.5px] border-primary" aria-hidden />{t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 space-y-2" aria-live="polite">
            <p className="text-sm text-muted-foreground">Getting today ready</p>
            <div className="h-3 w-3/4 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("logan:open-symptom-log"))}
            className="min-h-[44px] rounded-full bg-foreground px-5 text-sm font-semibold text-background">
            How I feel
          </button>
          <button type="button" onClick={() => setExplainOpen(true)} aria-label="What's happening in my body"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-base font-semibold text-foreground">
            ?
          </button>
        </div>
      </div>

      <PartnerToday userId={userId} help={insights?.succeedPartner ?? []} skip={insights?.dontMessUpPartner ?? []} />

      <Dialog open={explainOpen} onOpenChange={setExplainOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogTitle className="sr-only">What's happening in my body</DialogTitle>
          <HormoneBasicsCard lifeStage={(cycle?.lifeStage === "cycling" || !cycle?.lifeStage ? "cycling" : cycle.lifeStage) as never} />
        </DialogContent>
      </Dialog>
    </div>
  );
});
