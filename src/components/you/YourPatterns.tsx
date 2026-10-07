import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SymptomHistory } from "@/components/home/SymptomHistory";

type Status = "Confirmed" | "Emerging" | "Watching";
interface Pattern { name: string; from: number; to: number; cycles: number; status: Status }

const DAY = 86400000;

/** Pattern rows from logged symptoms: how many separate cycles a symptom showed up in, and on which cycle days. */
export function computePatterns(rows: { logged_at: string; cycle_day: number | null; symptoms: unknown }[], now = Date.now()): Pattern[] {
  const by: Record<string, { days: number[]; starts: number[]; last: number }> = {};
  for (const r of rows) {
    if (!r.cycle_day || r.cycle_day < 1) continue;
    const t = new Date(r.logged_at).getTime();
    const start = t - (r.cycle_day - 1) * DAY;
    for (const s of (Array.isArray(r.symptoms) ? r.symptoms : []) as { name?: string; severity?: number }[]) {
      const raw = typeof s === "string" ? s : s?.name;
      if (!raw || !String(raw).trim()) continue;
      if (typeof s !== "string" && typeof s?.severity === "number" && s.severity <= 0) continue;
      const key = String(raw).trim().toLowerCase();
      by[key] ??= { days: [], starts: [], last: 0 };
      by[key].days.push(r.cycle_day);
      by[key].starts.push(start);
      by[key].last = Math.max(by[key].last, t);
    }
  }
  const out: Pattern[] = [];
  for (const [key, v] of Object.entries(by)) {
    // Group estimated cycle starts that land within ~10 days of each other as one cycle.
    const starts = [...v.starts].sort((a, b) => a - b);
    let cycles = 0; let anchor = -Infinity;
    for (const s of starts) if (s - anchor > 10 * DAY) { cycles++; anchor = s; }
    let status: Status | null = null;
    if (cycles >= 3) status = "Confirmed";
    else if (cycles === 2) status = "Emerging";
    else if (now - v.last < 45 * DAY) status = "Watching";
    if (!status) continue;
    const d = [...v.days].sort((a, b) => a - b);
    const from = d[Math.floor((d.length - 1) * 0.25)];
    const to = d[Math.ceil((d.length - 1) * 0.75)];
    out.push({ name: key.charAt(0).toUpperCase() + key.slice(1), from, to, cycles, status });
  }
  const rank: Record<Status, number> = { Confirmed: 0, Emerging: 1, Watching: 2 };
  return out.sort((a, b) => rank[a.status] - rank[b.status] || b.cycles - a.cycles).slice(0, 3);
}

const STYLE: Record<Status, { text: string; dot: string }> = {
  Confirmed: { text: "text-[#C4247A]", dot: "bg-[#FF2E92] border-[#FF2E92]" },
  Emerging: { text: "text-[#0B7479]", dot: "border-[#0E8A8F]" },
  Watching: { text: "text-[#6E675F]", dot: "border-[#6E675F]" },
};

interface Props {
  userId: string;
  lastPeriodStart?: string;
  cycleLengthDays: number;
  isNonCycling: boolean;
  lifeStage?: string;
  onLogFeeling: () => void;
}

export function YourPatterns({ userId, lastPeriodStart, cycleLengthDays, isNonCycling, lifeStage, onLogFeeling }: Props) {
  const [patterns, setPatterns] = useState<Pattern[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const since = new Date(Date.now() - 200 * DAY).toISOString();
    supabase.from("symptom_logs").select("logged_at, cycle_day, symptoms").eq("user_id", userId).gte("logged_at", since)
      .then(({ data }) => setPatterns(computePatterns(data ?? [])));
  }, [userId]);

  return (
    <section>
      <p className="mb-2 text-[13px] font-semibold text-[#6E675F]">Your patterns</p>
      <div className="rounded-[22px] border border-border bg-card">
        {patterns === null ? (
          <div className="h-16" />
        ) : patterns.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            Log how you feel for a couple of cycles and your patterns will show up here.{" "}
            <button type="button" onClick={onLogFeeling} className="font-semibold text-[#0B7479] underline underline-offset-2">How I feel</button>
          </p>
        ) : (
          patterns.map((p, i) => (
            <button key={p.name} type="button" onClick={() => setOpen(true)}
              className={`flex w-full items-center gap-3 px-5 py-4 text-left ${i > 0 ? "border-t border-[#DDD7CC]" : ""}`}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 ${STYLE[p.status].dot}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">
                {p.name}, {p.from === p.to ? `day ${p.from}` : `days ${p.from} to ${p.to}`}
              </span>
              <span className={`text-[13px] font-semibold ${STYLE[p.status].text}`}>{p.status}</span>
            </button>
          ))
        )}
      </div>
      <SymptomHistory open={open} onOpenChange={setOpen} userId={userId} lastPeriodStart={lastPeriodStart}
        cycleLengthDays={cycleLengthDays} isNonCycling={isNonCycling} lifeStage={lifeStage} />
    </section>
  );
}
