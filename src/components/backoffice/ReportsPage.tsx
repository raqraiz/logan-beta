import { useEffect, useState, type ReactNode } from "react";
import { useBackOffice } from "@/components/backoffice/BackOfficeShell";
import { Card, CardTitle, Failed, Figure, GhostButton, InfoTip, MainButton, useLoad } from "@/components/backoffice/parts";
import {
  approveReportDraft, editReportDraft, fetchReport, fetchReportMonths, finalizeReport, growthText, logReportCopy, longDate,
  monthTitle, prevMonthName, rejectReportDraft, reportToText, retentionText, saveReportDraft, saveReportNotes, THEME_LABELS,
  type Report, type ReportMonth, type ReportNotes, type ReportStatus,
} from "@/lib/backOffice/reports";

const field = "w-full rounded-2xl border border-[#E6E0D5] bg-white px-4 py-3 text-sm text-[#23201C] placeholder:text-[#6E675F]";
const label = "mt-4 block text-[13px] font-bold uppercase tracking-[0.06em] text-[#6E675F]";
const row = "flex items-baseline justify-between gap-4 border-b border-[#F4F1EA] py-1.5 text-sm";
const fmt = (v: number) => v.toLocaleString("en-GB");

const STATUS_LABEL: Record<ReportStatus, string> = { live: "Live", unlocked: "Not locked yet", locked: "Locked", final: "Final" };

function Stat({ name, value, sub }: { name: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 flex-1 basis-[130px] space-y-0.5">
      <span className="block text-xs font-semibold text-[#6E675F]">{name}</span>
      <Figure size={26}>{value}</Figure>
      {sub && <span className="block text-xs text-[#6E675F]">{sub}</span>}
    </div>
  );
}

/** Month-end totals against the goal. Frozen with the month, so a locked chart never moves. */
function GoalChart({ report }: { report: Report }) {
  const pts = report.numbers.chart;
  const goal = report.numbers.goalCount;
  if (pts.length < 2 || goal <= 0) return null;
  const max = Math.max(goal, ...pts.map((p) => p.total));
  const x = (i: number) => 8 + (i / (pts.length - 1)) * 600;
  const y = (v: number) => 130 - (v / max) * 110;
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.total).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg viewBox="0 0 640 150" width="100%" height="150" role="img" aria-label={`Women on Logan at each month end against the goal of ${fmt(goal)}`}>
      <defs><linearGradient id="rp-grad" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#FF2E92" /><stop offset="0.5" stopColor="#A22BE8" /><stop offset="1" stopColor="#2BD4D9" /></linearGradient></defs>
      <line x1="0" y1={y(goal)} x2="640" y2={y(goal)} stroke="#6E675F" strokeWidth="2" strokeDasharray="6 6" />
      <text x="636" y={y(goal) - 6} textAnchor="end" fontSize="12" fill="#6E675F">Goal {fmt(goal)}</text>
      <path d={path} fill="none" stroke="url(#rp-grad)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(pts.length - 1)} cy={y(last.total)} r="6" fill="#A22BE8" />
      <text x={x(pts.length - 1) - 10} y={y(last.total) - 10} textAnchor="end" fontSize="12" fontWeight="700" fill="#23201C">{fmt(last.total)}</text>
    </svg>
  );
}

function NotesFields({ value, onChange, disabled }: { value: ReportNotes; onChange: (v: ReportNotes) => void; disabled: boolean }) {
  const set = (k: keyof ReportNotes) => (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value });
  const box = (k: keyof ReportNotes, title: string, hint: string, rows: number) => (
    <>
      <label htmlFor={`note-${k}`} className={label}>{title}</label>
      <textarea id={`note-${k}`} className={`${field} mt-1.5`} rows={rows} maxLength={1200} disabled={disabled} value={value[k]} onChange={set(k)} placeholder={hint} />
    </>
  );
  return (
    <>
      {box("highlights", "Highlights", "Write 2 or 3 lines: what went well this month", 3)}
      {box("lowlights", "Lowlights", "What did not go well, or got harder", 3)}
      {box("asks", "Asks", "What you want from investors: intros, advice, hires", 2)}
    </>
  );
}

function ReportBody({ report, role, onChanged, monthsCard }: { report: Report; role: "super_admin" | "admin"; onChanged: () => void; monthsCard: ReactNode }) {
  const sup = role === "super_admin";
  const x = report.numbers;
  const live = report.status === "live";
  const final = report.status === "final";
  const when = live ? "so far" : "at month end";
  // Super admin edits the approved notes. Admin edits their own waiting draft (or starts from the approved notes).
  const start: ReportNotes = sup ? report.notes : (report.draft?.mine ? report.draft : report.notes);
  const [notes, setNotes] = useState<ReportNotes>(start);
  const [draftEdit, setDraftEdit] = useState<ReportNotes | null>(report.draft ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmFinal, setConfirmFinal] = useState(false);
  useEffect(() => {
    setNotes(start); setDraftEdit(report.draft ?? null); setMsg(""); setErr(false); setConfirmFinal(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setErr(false); setMsg("");
    try { await fn(); setMsg(ok); onChanged(); } catch { setErr(true); } finally { setBusy(false); }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportToText({ ...report, notes: { ...report.notes, ...(sup ? notes : {}) } }));
      setCopied(true); setTimeout(() => setCopied(false), 1800);
      logReportCopy(report.month).catch(() => undefined);   // audit entry only, no content
    } catch { setErr(true); }
  };

  const stateLine = live ? "So far this month, not locked"
    : report.late ? "Calculated after the month ended"
    : report.lockedAt ? `Numbers locked on ${longDate(report.lockedAt)}, so they won't change later` : "Locked";

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <Card className="min-w-0 flex-[3]">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[22px] font-bold text-[#23201C]">Logan · {monthTitle(report.month)} update</h2>
          <span className="rounded-full border border-[#E6E0D5] px-2.5 py-0.5 text-xs font-semibold text-[#6E675F]">{STATUS_LABEL[report.status === "live" ? "live" : report.status]}</span>
        </div>
        <p className="mt-1 text-[13px] text-[#6E675F]">{stateLine}{report.late && report.lockedAt ? `. Locked on ${longDate(report.lockedAt)}.` : ""}</p>

        <div className="mt-4 flex flex-wrap gap-4">
          <Stat name={live ? "Women on Logan so far" : "Women on Logan"} value={fmt(x.totalUsers)} sub={`+${fmt(x.newUsers)} this month`} />
          <Stat name="Growth vs last month" value={x.growthPct === null ? "n/a" : growthText(x.growthPct)} sub={x.growthPct === null ? "No users the month before" : `${fmt(x.prevTotal)} women a month earlier`} />
          <Stat name="Goal" value={x.goalPct === null ? "n/a" : `${x.goalPct}%`} sub={`of ${fmt(x.goalCount)}${x.goalDate ? ` by ${longDate(x.goalDate)}` : ""}`} />
        </div>
        <div className="mt-4"><GoalChart report={report} /></div>

        <div className="mt-4 flex flex-wrap gap-4">
          <Stat name="Monthly active" value={fmt(x.mau)} sub={`last 30 days ${when}`} />
          <Stat name="Weekly active, average" value={x.avgWeeklyActive === null ? "n/a" : String(x.avgWeeklyActive)} sub="full weeks only" />
          <Stat name="Stickiness" value={x.stickiness === null ? "n/a" : x.stickiness.toFixed(2)} sub="7 day ÷ 30 day" />
        </div>

        <div className="mt-4 rounded-2xl bg-[#F4F1EA] px-4 py-3">
          <span className="block text-xs font-semibold text-[#6E675F]">
            Still active the next month <InfoTip text={`Of the women who joined in ${prevMonthName(report.month)}, the share who were active at any point during ${monthTitle(report.month)}. Active is counted the same way as everywhere else in the back office. Shows "Fewer than 10 joined" when that group is under 10.`} />
          </span>
          <span className="mt-0.5 block text-lg font-bold text-[#23201C]" style={{ fontVariantNumeric: "tabular-nums" }}>{retentionText(x.retention)}</span>
          <span className="block text-xs text-[#6E675F]">Women who joined in {prevMonthName(report.month)}</span>
        </div>

        <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <span className={`${label} mt-0`}>Signup sources</span>
            {x.sources.length === 0 ? <p className="py-1.5 text-sm text-[#6E675F]">No signups this month.</p> : x.sources.map((s) => (
              <div key={s.source} className={row}><span>{s.source}</span><span className="font-semibold">{fmt(s.signups)}</span></div>
            ))}
            <div className={row}><span>Referral joins this month</span><span className="font-semibold">{fmt(x.referralJoins)}</span></div>
          </div>
          <div>
            <span className={`${label} mt-0`}>Feedback received: {fmt(x.feedback.total)}</span>
            {THEME_LABELS.map(([k, l]) => (
              <div key={k} className={row}><span>{l}</span><span className="font-semibold">{fmt(x.feedback.themes[k] ?? 0)}</span></div>
            ))}
          </div>
        </div>

        {final ? (
          <div className="mt-2">
            {(["highlights", "lowlights", "asks"] as const).map((k) => (
              <div key={k}>
                <span className={label}>{k[0].toUpperCase() + k.slice(1)}</span>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{report.notes[k].trim() || "None this month."}</p>
              </div>
            ))}
            <p className="mt-4 text-xs text-[#6E675F]">Final{report.notes.finalAt ? ` since ${longDate(report.notes.finalAt)}` : ""}. Final reports can't be edited.</p>
          </div>
        ) : (
          <div>
            <NotesFields value={notes} onChange={setNotes} disabled={busy} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {sup
                ? <MainButton disabled={busy} onClick={() => run(() => saveReportNotes(report.month, notes), "Notes saved.")}>Save notes</MainButton>
                : <MainButton disabled={busy || !(notes.highlights.trim() || notes.lowlights.trim() || notes.asks.trim())}
                    onClick={() => run(() => saveReportDraft(report.month, notes), "Draft saved. It's waiting for approval.")}>Save draft</MainButton>}
              {!sup && report.draft?.mine && <span className="text-xs text-[#6E675F]">Your draft is waiting for approval.</span>}
              {!sup && !report.draft?.mine && <span className="text-xs text-[#6E675F]">A super admin approves drafts before they show in the report.</span>}
            </div>
          </div>
        )}
        {err && <p role="alert" className="mt-3 text-sm text-[#23201C]">That didn't work. Please try again.</p>}
        {msg && <p role="status" className="mt-3 text-sm text-[#6E675F]">{msg}</p>}
      </Card>

      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:basis-[260px]">
        <Card>
          <CardTitle>This report</CardTitle>
          <div className="flex flex-col items-start gap-2">
            <MainButton onClick={copy}>{copied ? "Copied" : "Copy report"}</MainButton>
            <p className="text-xs text-[#6E675F]">Copies plain text for your investor email. Logan doesn't send it.</p>
            {sup && report.status === "locked" && (confirmFinal ? (
              <div className="space-y-2 rounded-2xl border border-[#E6E0D5] p-3">
                <p className="text-sm">Mark {monthTitle(report.month)} Final? It becomes read-only.</p>
                <div className="flex gap-2">
                  <MainButton disabled={busy} onClick={() => run(() => finalizeReport(report.month), "Marked Final.")}>Yes, mark Final</MainButton>
                  <GhostButton onClick={() => setConfirmFinal(false)}>Cancel</GhostButton>
                </div>
              </div>
            ) : <GhostButton onClick={() => setConfirmFinal(true)}>Mark Final</GhostButton>)}
            {sup && live && <p className="text-xs text-[#6E675F]">A month can be marked Final once it has ended and locked.</p>}
          </div>
        </Card>

        {sup && report.draft && draftEdit && !final && (
          <Card>
            <CardTitle>Waiting for your approval</CardTitle>
            <p className="text-sm text-[#6E675F]">Notes drafted{report.draft.writtenBy ? ` by ${report.draft.writtenBy}` : ""}. Approving replaces the notes in this report.</p>
            <NotesFields value={draftEdit} onChange={setDraftEdit} disabled={busy} />
            <div className="mt-3 flex flex-wrap gap-2">
              <GhostButton disabled={busy} onClick={() => run(() => editReportDraft(report.draft!.id, draftEdit), "Draft edit saved.")}>Save edit</GhostButton>
              <MainButton disabled={busy} onClick={() => run(async () => { await editReportDraft(report.draft!.id, draftEdit); await approveReportDraft(report.draft!.id); }, "Approved.")}>Approve</MainButton>
              <GhostButton disabled={busy} onClick={() => run(() => rejectReportDraft(report.draft!.id), "Draft rejected.")}>Reject</GhostButton>
            </div>
          </Card>
        )}
        {monthsCard}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { role } = useBackOffice();
  const months = useLoad(fetchReportMonths, []);
  const [month, setMonth] = useState<string | null>(null);
  const list: ReportMonth[] = Array.isArray(months.data) ? months.data : [];
  const selected = month ?? list[0]?.month ?? null;
  const report = useLoad(() => (selected ? fetchReport(selected) : Promise.resolve(null)), [selected]);
  const refresh = () => { months.reload(); report.reload(); };

  const monthsCard = (
    <Card>
      <CardTitle>Months</CardTitle>
      <ul className="space-y-1">
        {list.map((m) => {
          const on = m.month === selected;
          return (
            <li key={m.month}>
              <button type="button" aria-current={on ? "true" : undefined} onClick={() => setMonth(m.month)}
                className={`flex w-full items-center justify-between gap-2 rounded-full px-3.5 py-2 text-left text-sm ${on ? "bg-[#F4F1EA] font-bold text-[#23201C]" : "text-[#6E675F] hover:text-[#23201C]"}`}>
                <span>{monthTitle(m.month)}</span>
                <span className="text-xs font-semibold">{STATUS_LABEL[m.status]}{m.draftWaiting ? " · draft" : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-[#6E675F]">A month locks the first time it's opened after it ends. Locked numbers never change.</p>
    </Card>
  );

  return (
    <>
      <h1 className="font-display text-[42px] font-semibold leading-none text-[#23201C]">Investor reports</h1>
      {months.error ? <Failed onRetry={months.reload} /> : months.data === "not_set_up" ? (
        <Card><p className="text-sm text-[#6E675F]">Investor reports aren't switched on yet. They need the latest database update first.</p></Card>
      ) : months.data && list.length === 0 ? (
        <Card><p className="text-sm text-[#6E675F]">No one has joined yet, so there's nothing to report. The first month appears when the first woman finishes setting up.</p></Card>
      ) : report.error ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start"><Card className="flex-[3]"><Failed onRetry={report.reload} /></Card><div className="flex-1">{monthsCard}</div></div>
      ) : !report.data ? (
        <Card><p className="text-sm text-[#6E675F]">Loading…</p></Card>
      ) : (
        <ReportBody key={report.data.month} report={report.data} role={role} onChanged={refresh} monthsCard={monthsCard} />
      )}
    </>
  );
}
