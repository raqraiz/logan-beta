import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { key, sampleSymptomDetail } from "@/lib/togetherData";
import { loadTogether, setTogetherConsent, trackTogether, TOGETHER_BODY, TOGETHER_CHANGED } from "@/lib/together";

interface Row { filter: string; symptom: string; women_band: string; women_count: number | null; day_shares: Record<string, number> | null; cohort_women?: number | null }
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
export function useSymptomCommunity(userId: string, name: string, sample = false): Community {
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

  const demo = sample ? sampleSymptomDetail(name, cycleLength) : null;
  const all = (demo ? demo.rows : rows) as Row[];
  return {
    loaded: loaded || !!demo, joined: joined || !!demo, cycleLength, openConsent, consentSheet,
    everyone: all.find((r) => r.filter === "everyone") ?? null,
    stage: all.find((r) => r.filter === "stage") ?? null,
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
  let caption: string | null = busy ? `Most women feel it on days ${busy.from} to ${busy.to}.` : null;
  if (mine && busy) {
    const mid = (mine.from + mine.to) / 2;
    const tail = mid >= busy.from && mid <= busy.to ? "Right in the middle of everyone." : mid > busy.to ? "A little later than most women." : "Earlier than most women.";
    caption = `The pink dot is when you usually feel it. ${tail}`;
  }
  const COL = 9, GAP = 2, H = 89, TOP = 14;
  const W = len * COL + (len - 1) * GAP;
  const x = (d: number) => (d - 1) * (COL + GAP);
  const usual = mine ? Math.min(len, Math.round((mine.from + mine.to) / 2)) : null;
  const pctX = (d: number) => ((x(d) + COL / 2) / W) * 100;
  return (
    <section className="mt-4 flex flex-col gap-2.5 rounded-[24px] bg-card px-4 pt-[18px] pb-3" aria-labelledby="when-women-label">
      <div className="flex items-center justify-between gap-2">
        <h2 id="when-women-label" className="font-sans text-[15px] font-semibold tracking-normal text-foreground">When women feel it</h2>
        <div className="flex gap-1 rounded-full bg-[#F4F1EA] p-[3px] dark:bg-muted" role="tablist">
          {([["everyone", "Everyone"], ["stage", "Like you"]] as const).map(([id, label]) => {
            const on = active === id;
            return (
              <button key={id} type="button" role="tab" aria-selected={on} disabled={!avail[id]} onClick={() => setTab(id)}
                className={`h-[30px] rounded-full px-2.5 text-xs disabled:opacity-40 ${on ? "bg-[#23201C] font-bold text-[#F4F1EA] dark:bg-foreground dark:text-background" : "bg-transparent font-medium text-foreground"}`}>
                {on ? `✓ ${label}` : label}
              </button>
            );
          })}
        </div>
      </div>
      {!avail.stage && <p className="text-xs text-muted-foreground">Not enough women in your stage yet.</p>}
      <div>
        <svg viewBox={`0 0 ${W} ${H + TOP}`} className="block w-full" role="img"
          aria-label={busy ? `Logged most on days ${busy.from} to ${busy.to} of the cycle.` : "When women log it across the cycle."}>
          {v.map((val, i) => {
            const d = i + 1;
            const h = val > 0 ? Math.max(4, (val / max) * H) : 4;
            const hot = val > 0 && busy && d >= busy.from && d <= busy.to;
            return <rect key={d} x={x(d)} y={TOP + H - h} width={COL} height={h} rx={val > 0 ? 3 : 2} fill={hot ? "#0E8A8F" : "#BDEBED"} />;
          })}
          {usual && <circle cx={x(usual) + COL / 2} cy={4 + 4} r={4} fill="#FF2E92" />}
        </svg>
        <div className="relative mt-1 h-4 font-sans text-[11px] text-[#6E675F] dark:text-muted-foreground">
          <span className="absolute left-0">Day 1</span>
          {busy && <span className="absolute -translate-x-1/2 font-bold text-[#0E8A8F]" style={{ left: `${Math.min(82, Math.max(18, pctX((busy.from + busy.to) / 2)))}%` }}>{busy.from} to {busy.to}</span>}
          <span className="absolute right-0">{len}</span>
        </div>
      </div>
      {caption && <p className="font-sans text-[13px] leading-relaxed text-[#6E675F] dark:text-muted-foreground">{caption}</p>}
    </section>
  );
}

/** How common the symptom is: 20 dots, filled by share of her cohort. Only for joined women with a count. */
export function CommonRing({ c, sheLogged }: { c: Community; sheLogged: boolean }) {
  if (!c.joined) return null;
  const pick = [c.stage, c.everyone].find((r) => r && (r.women_band === "few" || ((r.women_count ?? 0) >= 10 && (r.cohort_women ?? 0) >= 10)));
  if (!pick) return null;
  const few = pick.women_band === "few";
  const share = few ? 0 : Math.min(1, pick.women_count! / pick.cohort_women!);
  let filled = few ? 1 + Number(sheLogged) : Math.max(1, Math.round(share * 20));
  if (!few && sheLogged && filled < 2) filled = 2;
  const group = pick === c.stage ? "women like you" : "women";
  const inN = share > 0 ? Math.max(1, Math.round(1 / share)) : 0;
  const label = few ? `A few ${group} feel this` : inN <= 1 ? `Most ${group} feel this` : `About 1 in ${inN} ${group} feel this`;
  return (
    <svg width={76} height={76} viewBox="0 0 76 76" role="img" aria-label={label} className="shrink-0">
      <circle cx={38} cy={38} r={30} fill="none" stroke="#DDD7CC" strokeWidth={1} />
      {Array.from({ length: 20 }, (_, i) => {
        const a = (i / 20) * 2 * Math.PI - Math.PI / 2;
        const cx = 38 + 30 * Math.cos(a), cy = 38 + 30 * Math.sin(a);
        const isHers = sheLogged && i === filled - 1;
        if (isHers) return <circle key={i} cx={cx} cy={cy} r={5.5} fill="#FF2E92" stroke="hsl(var(--background))" strokeWidth={2} />;
        return i < filled
          ? <circle key={i} cx={cx} cy={cy} r={3.4} fill="#22C3CE" />
          : <circle key={i} cx={cx} cy={cy} r={3.4} fill="hsl(var(--background))" stroke="#DDD7CC" strokeWidth={1} />;
      })}
    </svg>
  );
}
