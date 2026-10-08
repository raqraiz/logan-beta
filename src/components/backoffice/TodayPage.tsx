import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBackOffice } from "@/components/backoffice/BackOfficeShell";
import { Card, CardTitle, Failed, GhostButton, InfoTip, MainButton, useLoad } from "@/components/backoffice/parts";
import { fetchActiveUsersNow } from "@/lib/adminActivity";
import {
  fetchGoal, fetchNeedsYou, fetchOnboardedByDay, fetchTogetherStrip, fetchWeekToDate, saveGoal,
} from "@/lib/backOffice/api";
import { buildPath, goalPace, rangeDates, stickiness, todayKey } from "@/lib/backOffice/math";

const TIPS = {
  today: "Women who did anything in Logan today (UTC): sent a chat message, logged a symptom, or used the app.",
  week: "Women who did anything in Logan from Monday to today (UTC).",
  fresh: "Women who finished onboarding from Monday to today (UTC).",
  sticky: "Women active in the last 7 days ÷ women active in the last 30 days.",
};

const OLD = (tab: string) => `/admin/classic?tab=${tab}`;
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("en-GB"));

function Tile({ label, tip, value, loading, error, retry }: {
  label: string; tip: string; value: string; loading: boolean; error: boolean; retry: () => void;
}) {
  return (
    <Card className="!p-4">
      <p className="text-sm font-medium text-[#6E675F]">{label} <InfoTip text={tip} /></p>
      <p className="mt-1 font-display text-4xl font-semibold text-[#23201C]">{error ? "—" : loading ? "…" : value}</p>
      {error && <Failed onRetry={retry} />}
    </Card>
  );
}

function GoalDialog({ open, onClose, goal, onSaved }: {
  open: boolean; onClose: () => void; goal: { count: number; date: string }; onSaved: () => void;
}) {
  const [count, setCount] = useState(String(goal.count));
  const [date, setDate] = useState(goal.date);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (open) { setCount(String(goal.count)); setDate(goal.date); setErr(""); } }, [open, goal]);
  const save = async () => {
    setBusy(true); setErr("");
    try { await saveGoal(Number(count), date); onSaved(); onClose(); } catch { setErr("That didn't save. Check the number and use a future date."); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-[22px] border-[#E6E0D5] bg-white">
        <DialogHeader><DialogTitle className="font-display text-xl font-semibold text-[#23201C]">Edit the goal</DialogTitle></DialogHeader>
        <label className="block text-sm text-[#6E675F]">Women
          <input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} className="mt-1 w-full rounded-full border border-[#E6E0D5] px-4 py-2 text-[#23201C]" />
        </label>
        <label className="block text-sm text-[#6E675F]">By
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-full border border-[#E6E0D5] px-4 py-2 text-[#23201C]" />
        </label>
        {err && <p className="text-sm text-[#23201C]">{err}</p>}
        <div className="flex justify-end gap-2"><GhostButton onClick={onClose}>Cancel</GhostButton><MainButton onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</MainButton></div>
      </DialogContent>
    </Dialog>
  );
}

export default function TodayPage() {
  const { role, range } = useBackOffice();
  const sup = role === "super_admin";
  const today = todayKey();
  const [editing, setEditing] = useState(false);

  const now = useLoad(fetchActiveUsersNow, []);
  const week = useLoad(fetchWeekToDate, []);
  const needs = useLoad(fetchNeedsYou, []);
  const strip = useLoad(fetchTogetherStrip, []);
  const goal = useLoad(fetchGoal, []);
  const series = useLoad(() => fetchOnboardedByDay(null, today), [today]);

  const total = series.data?.length ? series.data[series.data.length - 1].total : null;
  const pace = goal.data && total !== null ? goalPace(total, goal.data.count, goal.data.date, today) : null;
  const points = useMemo(() => {
    if (!series.data || !goal.data) return [];
    return buildPath(series.data.map((d) => ({ day: d.day, total: d.total })), goal.data.count, goal.data.date, today, rangeDates(range).from);
  }, [series.data, goal.data, today, range]);

  const stick = now.data ? stickiness(now.data.wau, now.data.mau) : null;
  const rows: { label: string; count: number | null; to: string; warn?: boolean }[] = needs.data ? [
    { label: "New feedback (last 7 days)", count: needs.data.newFeedback, to: OLD("overview") },
    { label: "Tips to review (waiting for Logan's check, plus reported)", count: needs.data.tipsWaiting + needs.data.tipsReported, to: OLD("tips") },
    sup
      ? { label: "Message failures (last 7 days)", count: needs.data.messageFailures7d, to: OLD("overview") }
      : { label: "New referrals this week (referrers to thank)", count: needs.data.newReferrersWeek, to: OLD("referrals") },
  ] : [];
  const linksDead = sup && needs.data && (needs.data.linkCount ?? 0) > 0 && needs.data.linkClicksTotal === 0;

  return (
    <>
      <h1 className="font-display text-3xl font-semibold text-[#23201C]">Today</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Active today" tip={TIPS.today} value={fmt(now.data?.dau)} loading={now.loading && !now.data} error={now.error} retry={now.reload} />
        <Tile label="Active this week" tip={TIPS.week} value={fmt(week.data?.activeWeek)} loading={week.loading && !week.data} error={week.error} retry={week.reload} />
        <Tile label="New this week" tip={TIPS.fresh} value={fmt(week.data?.newWeek)} loading={week.loading && !week.data} error={week.error} retry={week.reload} />
        <Tile label="Stickiness" tip={TIPS.sticky} value={stick === null ? "—" : stick.toFixed(2)} loading={now.loading && !now.data} error={now.error} retry={now.reload} />
      </div>

      <Card>
        <CardTitle aside={sup && goal.data ? <GhostButton onClick={() => setEditing(true)}>Edit goal</GhostButton> : undefined}>
          Path to {goal.data ? goal.data.count.toLocaleString("en-GB") : "1,000"} women by {goal.data ? new Date(`${goal.data.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "1 Jan"}
        </CardTitle>
        {(series.error || goal.error) ? <Failed onRetry={() => { series.reload(); goal.reload(); }} /> : (
          <>
            <p className="mb-3 text-sm text-[#6E675F]" aria-live="polite">
              {total === null || !goal.data ? "…" : (
                <>
                  <span className="font-semibold text-[#23201C]">{total.toLocaleString("en-GB")}</span> of {goal.data.count.toLocaleString("en-GB")}
                  {pace?.status === "on" && <> · need <span className="font-semibold text-[#23201C]">{pace.perDay}</span> a day</>}
                  {pace?.status === "reached" && <> · goal reached</>}
                  {pace?.status === "passed" && <> · goal date has passed</>}
                </>
              )}
            </p>
            <div className="h-64 w-full" role="img" aria-label="Line chart: women so far against a straight line to the goal">
              <ResponsiveContainer>
                <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="bo-actual" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#FF2E92" /><stop offset="50%" stopColor="#A22BE8" /><stop offset="100%" stopColor="#2BD4D9" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#E6E0D5" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "#6E675F", fontSize: 11 }} minTickGap={48} tickFormatter={(d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} />
                  <YAxis tick={{ fill: "#6E675F", fontSize: 11 }} width={44} allowDecimals={false} />
                  <ChartTooltip contentStyle={{ borderRadius: 14, border: "1px solid #E6E0D5", fontSize: 12 }} labelFormatter={(d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} />
                  <Line type="linear" dataKey="goal" name="Goal" stroke="#6E675F" strokeDasharray="6 5" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="actual" name="Women" stroke="url(#bo-actual)" strokeWidth={3} dot={false} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>

      <Card>
        <CardTitle>Needs you</CardTitle>
        {needs.error ? <Failed onRetry={needs.reload} /> : (
          <ul className="divide-y divide-[#E6E0D5]">
            {rows.map((r) => (
              <li key={r.label}>
                <Link to={r.to} className="flex items-center justify-between gap-3 py-3 text-sm hover:opacity-80">
                  <span>{r.label}</span>
                  <span className="font-display text-2xl font-semibold">{fmt(r.count)}</span>
                </Link>
              </li>
            ))}
            {linksDead && (
              <li>
                <Link to="/admin/growth" className="flex items-center justify-between gap-3 py-3 text-sm hover:opacity-80">
                  <span><span aria-hidden>⚠ </span>Campaign link clicks read 0 across all links, so clicks aren't being counted</span>
                  <span className="font-display text-2xl font-semibold">0</span>
                </Link>
              </li>
            )}
            {!needs.data && <li className="py-3 text-sm text-[#6E675F]">…</li>}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Together</CardTitle>
        {strip.error ? <Failed onRetry={strip.reload} /> : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ["Women who joined", fmt(strip.data?.womenJoined)],
              ["Symptoms with 10+ women", fmt(strip.data?.symptoms10Plus)],
              ["Tips live", fmt(strip.data?.tipsLive)],
              ["Tips waiting", fmt(strip.data?.tipsWaiting)],
              ["Tips reported", fmt(strip.data?.tipsReported)],
              ["New community words this week", fmt(strip.data?.newWordsWeek)],
            ].map(([k, v]) => (
              <div key={k}>
                <dd className="font-display text-3xl font-semibold">{strip.data ? v : "…"}</dd>
                <dt className="text-sm text-[#6E675F]">{k}</dt>
              </div>
            ))}
          </dl>
        )}
      </Card>

      {goal.data && <GoalDialog open={editing} onClose={() => setEditing(false)} goal={goal.data} onSaved={goal.reload} />}
    </>
  );
}
