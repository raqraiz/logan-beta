import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { key } from "@/lib/togetherData";
import { loadTogether, setTogetherConsent, trackTogether, TOGETHER_BODY, TOGETHER_CHANGED } from "@/lib/together";

interface Row { filter: string; symptom: string; women_band: string; women_count: number | null; day_shares: Record<string, number> | null }
export interface Window { from: number; to: number }

export interface Community {
  loaded: boolean;
  joined: boolean;
  everyone: Row | null;
  stage: Row | null;
  cycleLength: number;
  openConsent: () => void;
  consentSheet: JSX.Element;
}

/** Totals for one symptom from the shared daily aggregates only. Never reads other women's logs. */
export function useSymptomCommunity(userId: string, name: string): Community {
  const [loaded, setLoaded] = useState(false);
  const [joined, setJoined] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [cycleLength, setCycleLength] = useState(28);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const s = await loadTogether(userId);
      if (!alive) return;
      setJoined(s.consent);
      if (s.consent) {
        const { data } = await supabase.rpc("get_together_aggregates" as any);
        if (alive) setRows(((data ?? []) as Row[]).filter((r) => key(r.symptom) === key(name)));
      }
      if (alive) setLoaded(true);
    };
    void load();
    supabase.from("participants").select("cycle_length_days").eq("user_id", userId).maybeSingle()
      .then(({ data }) => { const n = data?.cycle_length_days; if (alive && n && n >= 21 && n <= 45) setCycleLength(n); });
    globalThis.addEventListener(TOGETHER_CHANGED, load);
    return () => { alive = false; globalThis.removeEventListener(TOGETHER_CHANGED, load); };
  }, [userId, name]);

  const openConsent = () => { setOpen(true); trackTogether("together_consent_shown"); };
  const notNow = () => { trackTogether("together_consent_not_now"); setOpen(false); };
  const join = async () => {
    setSaving(true);
    const ok = await setTogetherConsent(userId, true);
    setSaving(false);
    if (!ok) { toast.error("That didn't save. Try again?"); return; }
    trackTogether("together_consent_yes");
    setOpen(false);
  };

  const consentSheet = (
    <Sheet open={open} onOpenChange={(o) => { if (!o) notNow(); }}>
      <SheetContent side="bottom" className="z-[60] rounded-t-[28px] px-6 pb-10 pt-8">
        <div className="mx-auto flex max-w-md flex-col gap-4">
          <SheetTitle className="font-heading text-[34px] font-semibold text-foreground">Count me in</SheetTitle>
          <SheetDescription className="text-[15px] font-normal leading-relaxed text-foreground">{TOGETHER_BODY}</SheetDescription>
          <button type="button" disabled={saving} onClick={join} className="mt-2 w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background disabled:opacity-60">Count me in</button>
          <button type="button" onClick={notNow} className="text-sm text-muted-foreground underline">Not now</button>
        </div>
      </SheetContent>
    </Sheet>
  );

  return {
    loaded, joined, cycleLength, openConsent, consentSheet,
    everyone: rows.find((r) => r.filter === "everyone") ?? null,
    stage: rows.find((r) => r.filter === "stage") ?? null,
  };
}

const hasShares = (r: Row | null) => !!r?.day_shares && Object.keys(r.day_shares).length > 0;

/** Community line under the name, or null to keep the current line. Never a number under 10. */
export function communityLine(c: Community, sheLogged: boolean): string | null {
  const r = c.everyone;
  if (!c.joined || !r) return null;
  if (r.women_band === "exact" && (r.women_count ?? 0) >= 10) {
    const n = r.women_count!;
    if (!sheLogged) return `${n} women feel this`;
    return n - 1 >= 10 ? `You and ${n - 1} other women` : "You and a few other women";
  }
  if (r.women_band === "few") return sheLogged ? "You and a few other women" : "A few women feel this";
  return null;
}

function dayValues(r: Row, len: number): number[] {
  return Array.from({ length: len }, (_, i) => Number(r.day_shares?.[String(i + 1)] ?? 0));
}

/** Busiest 4-day stretch (shorter if the cycle is tiny). */
export function busiestWindow(r: Row | null, len: number): Window | null {
  if (!r || !hasShares(r)) return null;
  const v = dayValues(r, len);
  if (!v.some((x) => x > 0)) return null;
  const w = Math.min(4, len);
  let best = 0, at = 0;
  for (let i = 0; i + w <= len; i++) {
    const s = v.slice(i, i + w).reduce((a, b) => a + b, 0);
    if (s > best) { best = s; at = i; }
  }
  return { from: at + 1, to: at + w };
}

/** One insight comparing her start with the busiest stretch for women in her stage. */
export function stageInsight(c: Community, mine: Window | null): string | null {
  if (!mine) return null;
  const busy = busiestWindow(c.stage, c.cycleLength);
  if (!busy) return null;
  const d = mine.from - busy.from;
  if (d === 0) return "About the same time as most women in your stage.";
  if (Math.abs(d) <= 1) return null;
  const n = Math.abs(d);
  return `Starts ${n} days ${d > 0 ? "later" : "earlier"} than most women in your stage.`;
}

export function WhenWomenFeelCard({ c, mine, hasCycle }: { c: Community; mine: Window | null; hasCycle: boolean }) {
  const [tab, setTab] = useState<"stage" | "everyone">("stage");
  if (!hasCycle || !c.loaded) return null;
  if (!c.joined) {
    return (
      <div className="mt-4 flex items-center justify-between gap-3 px-1">
        <p className="text-sm font-light text-muted-foreground">See when other women feel this</p>
        <button type="button" onClick={c.openConsent} className="shrink-0 text-sm font-semibold text-foreground underline underline-offset-2">Count me in</button>
      </div>
    );
  }
  const avail = { stage: hasShares(c.stage), everyone: hasShares(c.everyone) };
  if (!avail.stage && !avail.everyone) return null;
  const active = avail[tab] ? tab : tab === "stage" ? "everyone" : "stage";
  const row = (active === "stage" ? c.stage : c.everyone)!;
  const len = c.cycleLength;
  const v = dayValues(row, len);
  const max = Math.max(...v, 0.0001);
  const busy = busiestWindow(row, len);
  let caption: string | null = null;
  if (mine && busy) {
    const mid = (mine.from + mine.to) / 2;
    const tail = mid >= busy.from && mid <= busy.to ? "Right in the middle of everyone." : mid > busy.to ? "A little later than most women." : "Earlier than most women.";
    caption = `The pink dot is when you usually feel it. ${tail}`;
  }
  const pct = (d: number) => ((d - 0.5) / len) * 100;
  return (
    <section className="mt-4 rounded-[22px] bg-card p-5" aria-labelledby="when-women-label">
      <h2 id="when-women-label" className="font-sans text-[13px] font-semibold tracking-normal text-muted-foreground">When women feel it</h2>
      <div className="mt-4 flex gap-2" role="tablist">
        {([["everyone", "Everyone"], ["stage", "Like you"]] as const).map(([id, label]) => {
          const on = active === id;
          return (
            <button key={id} type="button" role="tab" aria-selected={on} disabled={!avail[id]} onClick={() => setTab(id)}
              className={`relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] disabled:opacity-40 ${on ? "bg-foreground font-semibold text-background" : "border border-border bg-card font-medium text-foreground"}`}>
              {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}{label}
            </button>
          );
        })}
      </div>
      <div className="relative mt-5">
        <div className="flex h-5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          {v.map((x, i) => (
            <span key={i} className="h-full flex-1" style={{ background: `color-mix(in srgb, var(--symptom-watch-ink) ${Math.round(8 + (x / max) * 62)}%, transparent)` }} />
          ))}
        </div>
        {mine && <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-[#C4247A]"
          style={{ left: `${pct(Math.min(len, (mine.from + mine.to) / 2))}%` }} aria-label={`Your usual days, ${mine.from} to ${mine.to}`} />}
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] text-muted-foreground">
        <span className="absolute left-0">Day 1</span>
        {busy && <span className="absolute -translate-x-1/2 font-semibold text-foreground" style={{ left: `${Math.min(82, Math.max(18, pct((busy.from + busy.to) / 2)))}%` }}>{busy.from} to {busy.to}</span>}
        <span className="absolute right-0">Day {len}</span>
      </div>
      {caption && <p className="mt-4 text-[15px] font-light leading-relaxed text-foreground">{caption}</p>}
    </section>
  );
}
