import { useState } from "react";
import { Link } from "react-router-dom";
import { useBackOffice } from "@/components/backoffice/BackOfficeShell";
import { WaitingDrafts } from "@/components/backoffice/WaitingDrafts";
import { Card, Failed, Figure, GhostButton, MainButton, PillToggle, useLoad } from "@/components/backoffice/parts";
import { displayName, fetchWaitingDrafts, timeAgo, type WaitingDraft } from "@/lib/backOffice/feedback";
import {
  activePercent, fetchReferrers, fetchReferralSummary, sendThankYou, thankYouStarter, type ReferralPeriod, type ReferrerRow,
} from "@/lib/backOffice/referrals";

const field = "w-full rounded-2xl border border-[#E6E0D5] bg-white px-4 py-3 text-sm text-[#23201C] placeholder:text-[#6E675F]";
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function ThankYouBox({ row, sup, onDone }: { row: ReferrerRow; sup: boolean; onDone: (note: string) => void }) {
  const [body, setBody] = useState(thankYouStarter(row.firstName, row.allTime));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(false);
    try {
      const r = await sendThankYou(row.refKey, body.trim());
      onDone(r === "sent" ? "Sent." : "Sent to a super admin for approval.");
    } catch { setErr(true); setBusy(false); }
  };
  return (
    <div className="mt-3 space-y-2">
      <textarea aria-label="Your thank-you" className={`${field} min-h-[96px]`} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
      <p className="text-xs text-[#6E675F]">
        {sup ? "She sees this in her chat, labelled “A thank-you from the Logan team”." : "A super admin approves it before she sees it."}
      </p>
      {err && <p className="text-sm text-[#23201C]">That didn't send. Please try again.</p>}
      <MainButton disabled={busy || !body.trim()} onClick={submit}>{busy ? "Sending…" : sup ? "Send" : "Send for approval"}</MainButton>
    </div>
  );
}

function ReferrerRowView({ row, sup, onChanged }: { row: ReferrerRow; sup: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const name = displayName(row, sup);
  const pct = activePercent(row.active, row.activeBase);
  return (
    <>
      <tr className="border-t border-[#E6E0D5] align-top">
        <td className="py-3 pr-3 font-semibold text-[#23201C]">
          {sup && row.userId ? <Link to={`/admin/users/${row.userId}`} className="underline underline-offset-2">{name} ›</Link> : name}
        </td>
        <td className="py-3 pr-3 tabular-nums">{row.signups}</td>
        <td className="py-3 pr-3 tabular-nums text-[#6E675F]">{row.activeBase > 0 ? `${row.active} of ${row.activeBase}${pct !== null ? ` (${pct}%)` : ""}` : "Too early"}</td>
        <td className="py-3 pr-3 text-[#6E675F]">{timeAgo(row.lastReferral)}</td>
        <td className="py-3">
          {row.thankedAt ? <span className="text-[#6E675F]">Sent {shortDate(row.thankedAt)}</span>
            : note ? <span className="text-[#6E675F]">{note}</span>
            : <GhostButton onClick={() => setOpen((v) => !v)}>Draft thank-you</GhostButton>}
        </td>
      </tr>
      {open && !note && !row.thankedAt && (
        <tr><td colSpan={5} className="pb-4">
          <ThankYouBox row={row} sup={sup} onDone={(m) => { setNote(m); setOpen(false); onChanged(); }} />
        </td></tr>
      )}
    </>
  );
}

export default function ReferralsPage() {
  const { role } = useBackOffice();
  const sup = role === "super_admin";
  const [period, setPeriod] = useState<ReferralPeriod>("month");
  const summary = useLoad(() => fetchReferralSummary(period), [period]);
  const list = useLoad(() => fetchReferrers(period), [period]);
  const waiting = useLoad(() => (sup ? fetchWaitingDrafts() : Promise.resolve([] as WaitingDraft[])), [sup]);
  const refresh = () => { summary.reload(); list.reload(); waiting.reload(); };
  const sm = summary.data;
  const pct = sm ? activePercent(sm.active, sm.activeBase) : null;
  const label = period === "month" ? "this month" : "all time";

  return (
    <>
      <header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-[42px] font-semibold leading-none text-[#23201C]">Referrals</h1>
          <PillToggle<ReferralPeriod>
            label="Period"
            value={period}
            onChange={setPeriod}
            options={[{ value: "month", label: "This month" }, { value: "all", label: "All time" }]}
          />
        </div>
      </header>

      {sup && <WaitingDrafts kind="thank_you" drafts={waiting.data} onChanged={refresh} />}

      {summary.error ? <Card><Failed onRetry={summary.reload} /></Card> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-[#6E675F]">Referred signups ({label})</p>
            <div className="mt-2"><Figure size={34}>{sm ? sm.signups : "…"}</Figure></div>
          </Card>
          <Card>
            <p className="text-sm text-[#6E675F]">Still active after 14 days</p>
            <div className="mt-2"><Figure size={34}>{sm ? (pct === null ? "—" : `${pct}%`) : "…"}</Figure></div>
            <p className="mt-2 text-xs text-[#6E675F]">Of referred women whose first 14 days are over, how many were active again within them.</p>
          </Card>
          <Card>
            <p className="text-sm text-[#6E675F]">Active referrers</p>
            <div className="mt-2"><Figure size={34}>{sm ? sm.referrers : "…"}</Figure></div>
            <p className="mt-2 text-xs text-[#6E675F]">Referred at least 1 woman {label}.</p>
          </Card>
        </div>
      )}

      <Card>
        {list.error ? <Failed onRetry={list.reload} />
          : list.loading && !list.data ? <p className="text-sm text-[#6E675F]">Loading…</p>
          : (list.data?.length ?? 0) === 0 ? <p className="text-sm text-[#6E675F]">No referrals {label} yet.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-[#6E675F]">
                    <th className="pb-2 pr-3 font-semibold">Referrer</th>
                    <th className="pb-2 pr-3 font-semibold">Signed up</th>
                    <th className="pb-2 pr-3 font-semibold">Active after 14d</th>
                    <th className="pb-2 pr-3 font-semibold">Last referral</th>
                    <th className="pb-2 font-semibold">Thank-you</th>
                  </tr>
                </thead>
                <tbody>{list.data!.map((r) => <ReferrerRowView key={r.refKey} row={r} sup={sup} onChanged={refresh} />)}</tbody>
              </table>
            </div>
          )}
      </Card>

      <p className="text-xs text-[#6E675F]">
        {sup ? "Open a referrer to see her page and the women she invited." : "A thank-you reaches her inside Logan."}
      </p>
    </>
  );
}
