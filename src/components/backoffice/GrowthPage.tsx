import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UtmLinkBuilder } from "@/components/admin/UtmLinkBuilder";
import { useBackOffice } from "@/components/backoffice/BackOfficeShell";
import { Card, CardTitle, Failed, GhostButton, MainButton, PillToggle, useLoad } from "@/components/backoffice/parts";
import { fetchCampaignLinks, fetchNeedsYou, fetchSignupSources, fetchWeeklyMeasurement } from "@/lib/backOffice/api";
import { active14, cell, rangeDates, returnedPct, weekLabel } from "@/lib/backOffice/math";
import { LIFE_STAGE_LABELS, type LifeStageKey } from "@/lib/metrics/lifeStage";

const STAGES = (Object.keys(LIFE_STAGE_LABELS) as LifeStageKey[]).filter((k) => k !== "bc_iud");
const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#6E675F]";
const td = "px-3 py-2.5 text-sm";

export default function GrowthPage() {
  const { role, range } = useBackOffice();
  const [by, setBy] = useState<"campaign" | "channel">("campaign");
  const [stage, setStage] = useState<string>("");
  const [building, setBuilding] = useState(false);
  const [copied, setCopied] = useState("");
  const { from, to } = rangeDates(range);
  const st = stage || null;

  const sources = useLoad(() => fetchSignupSources(from, to, by, st), [from, to, by, st]);
  const weekly = useLoad(() => fetchWeeklyMeasurement(from, to, st), [from, to, st]);
  const links = useLoad(() => fetchCampaignLinks(from, to), [from, to]);
  const since = useLoad(fetchNeedsYou, []);

  if (role !== "super_admin") return <Navigate to="/admin" replace />;

  const copy = async (slug: string) => {
    try { await navigator.clipboard.writeText(`https://asklogan.ai/s/${slug}`); setCopied(slug); setTimeout(() => setCopied(""), 1500); } catch { /* clipboard blocked */ }
  };
  // Clicks only exist from the day counting started; say so when the chosen range reaches back before that.
  const sinceDay = since.data?.clickCountingSince ? since.data.clickCountingSince.slice(0, 10) : null;
  const sinceNote = sinceDay && (from === null || from < sinceDay)
    ? `Clicks counted from ${new Date(`${sinceDay}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}.`
    : "";

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <label className="flex items-center gap-2 text-sm text-[#6E675F]">
          Life stage
          <select value={stage} onChange={(e) => setStage(e.target.value)} className="rounded-full border border-[#E6E0D5] bg-white px-3.5 py-1.5 text-sm text-[#23201C]">
            <option value="">All women</option>
            {STAGES.map((s) => <option key={s} value={s}>{LIFE_STAGE_LABELS[s]}</option>)}
          </select>
        </label>
      </div>

      <Card>
        <CardTitle aside={<PillToggle<"campaign" | "channel"> label="Group signups by" value={by} onChange={setBy} options={[{ value: "campaign", label: "Campaign" }, { value: "channel", label: "Channel" }]} />}>
          Where signups came from
        </CardTitle>
        {sources.error ? <Failed onRetry={sources.reload} /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-[#E6E0D5]"><th className={th}>{by === "campaign" ? "Campaign" : "Channel"}</th><th className={th}>Clicks</th><th className={th}>Signups</th><th className={th}>Active 14d</th></tr></thead>
              <tbody>
                {(sources.data ?? []).map((r) => (
                  <tr key={r.source} className="border-b border-[#E6E0D5] last:border-0">
                    <td className={td}>{r.source}</td>
                    <td className={td}>{cell(r.clicks)}</td>
                    <td className={td}>{cell(r.signups)}</td>
                    <td className={td}>{active14(r.active14Base, r.active14)}</td>
                  </tr>
                ))}
                {sources.data?.length === 0 && <tr><td colSpan={4} className={`${td} text-[#6E675F]`}>No signups in this range.</td></tr>}
                {!sources.data && <tr><td colSpan={4} className={`${td} text-[#6E675F]`}>…</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <ul className="mt-3 space-y-1 text-xs text-[#6E675F]">
          <li>Clicks are link clicks inside the date range{st ? ", and are not available by life stage (—)" : ""}.{sinceNote ? ` ${sinceNote}` : ""}</li>
          <li>Active 14d: signups active again within 14 days of joining, out of those whose 14 days are over. — means none have finished yet.</li>
        </ul>
      </Card>

      <Card>
        <CardTitle aside={<MainButton onClick={() => setBuilding(true)}>New link</MainButton>}>Campaign links</CardTitle>
        {links.error ? <Failed onRetry={links.reload} /> : (
          <ul className="divide-y divide-[#E6E0D5]">
            {(links.data ?? []).map((l) => (
              <li key={l.slug} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{l.campaign ?? "(no campaign)"} <span className="font-normal text-[#6E675F]">· {[l.source, l.medium].filter(Boolean).join(" / ") || "no source"}</span></p>
                  <p className="truncate text-xs text-[#6E675F]">asklogan.ai/s/{l.slug} · {l.clicks} clicks · {l.signups} signups</p>
                </div>
                <GhostButton onClick={() => copy(l.slug)}>{copied === l.slug ? "✓ Copied" : "Copy"}</GhostButton>
              </li>
            ))}
            {links.data?.length === 0 && <li className="py-3 text-sm text-[#6E675F]">No links yet.</li>}
            {!links.data && <li className="py-3 text-sm text-[#6E675F]">…</li>}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Weekly measurement</CardTitle>
        {weekly.error ? <Failed onRetry={weekly.reload} /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-[#E6E0D5]">
                <th className={th}>Week (Mon to Sun)</th><th className={th}>New</th><th className={th}>Active</th>
                <th className={th}>Returned next week %</th><th className={th}>Heads-ups opened</th><th className={th}>Feedback</th>
              </tr></thead>
              <tbody>
                {[...(weekly.data ?? [])].reverse().map((w) => (
                  <tr key={w.weekStart} className="border-b border-[#E6E0D5] last:border-0">
                    <td className={td}>{weekLabel(w.weekStart)}</td>
                    <td className={td}>{cell(w.newUsers)}</td>
                    <td className={td}>{cell(w.activeUsers)}</td>
                    <td className={td}>{returnedPct(w.returnedBase, w.returned)}</td>
                    <td className={td}>{cell(w.headsupsOpened)}</td>
                    <td className={td}>{cell(w.feedback)}</td>
                  </tr>
                ))}
                {!weekly.data && <tr><td colSpan={6} className={`${td} text-[#6E675F]`}>…</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <ul className="mt-3 space-y-1 text-xs text-[#6E675F]">
          <li>Returned next week %: women who joined that week and were active the week after. — means the next week isn't over yet.</li>
          <li>Heads-ups opened counts heads-ups marked opened, by the week they were opened.</li>
          <li>This week is Monday to today. Life stage only filters totals.</li>
        </ul>
      </Card>

      <Dialog open={building} onOpenChange={(o) => { setBuilding(o); if (!o) links.reload(); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-[22px] border-[#E6E0D5] bg-[#F4F1EA]">
          <DialogHeader><DialogTitle className="font-display text-xl font-semibold text-[#23201C]">New campaign link</DialogTitle></DialogHeader>
          <UtmLinkBuilder />
        </DialogContent>
      </Dialog>
    </>
  );
}
