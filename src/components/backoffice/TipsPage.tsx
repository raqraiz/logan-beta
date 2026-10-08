import { useState } from "react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardTitle, Failed, GhostButton, MainButton, PillToggle, useLoad } from "@/components/backoffice/parts";
import { timeAgo } from "@/lib/backOffice/feedback";
import {
  fetchReportedWords, fetchTips, fetchTipTotals, reasonText, reviewTip, reviewWord, type TipItem, type TipTab, type WordItem,
} from "@/lib/backOffice/tips";

const badge = "inline-block rounded-full border border-[#E6E0D5] px-2.5 py-0.5 text-xs font-semibold text-[#23201C]";

function TipCard({ tip, tab, onChanged }: { tip: TipItem; tab: TipTab; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const run = async (action: "approve" | "remove" | "remove_author") => {
    setBusy(true); setErr(false);
    try { await reviewTip(tip.id, action); setConfirming(false); onChanged(); } catch { setErr(true); setBusy(false); }
  };
  const pending = tip.status === "pending";
  const n = tip.authorTipCount;
  return (
    <Card>
      {tab === "review" && <span className={badge}>{pending ? "Logan wasn't sure" : `Reported ${tip.reportCount}×`}</span>}
      <p className="mt-2 text-sm text-[#6E675F]"><span className="font-semibold text-[#23201C]">{tip.symptom}</span> · {timeAgo(tip.createdAt)}</p>
      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[#23201C]">“{tip.text}”</p>
      {tab === "review" && (
        <p className="mt-2 text-xs text-[#6E675F]">
          {pending ? `Why: ${tip.why ?? ""}` : `Reason: ${reasonText(tip.reasons) || "No reason given"}`}
        </p>
      )}
      {err && <p className="mt-2 text-sm text-[#23201C]">That didn't save. Please try again.</p>}
      {tab !== "removed" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tab === "review" && <MainButton disabled={busy} onClick={() => run("approve")}>Approve</MainButton>}
          <GhostButton disabled={busy} onClick={() => run("remove")}>Remove</GhostButton>
          <GhostButton disabled={busy} onClick={() => setConfirming(true)}>Remove all tips from this author</GhostButton>
        </div>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove all tips from this author?</AlertDialogTitle>
            <AlertDialogDescription>
              {n === 1 ? "1 tip" : `${n} tips`} will be removed. This can't be undone, and her identity is never shown.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <MainButton disabled={busy} onClick={() => run("remove_author")}>{busy ? "Removing…" : `Remove ${n === 1 ? "1 tip" : `${n} tips`}`}</MainButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function WordCard({ w, onChanged }: { w: WordItem; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const run = async (action: "approve" | "remove") => {
    setBusy(true); setErr(false);
    try { await reviewWord(w.word, action); onChanged(); } catch { setErr(true); setBusy(false); }
  };
  return (
    <Card>
      <span className={badge}>Word</span>
      <p className="mt-2 text-[15px] text-[#23201C]">“{w.word}”</p>
      <p className="mt-2 text-xs text-[#6E675F]">Reason: {reasonText(w.reasons) || "No reason given"}</p>
      {err && <p className="mt-2 text-sm text-[#23201C]">That didn't save. Please try again.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <MainButton disabled={busy} onClick={() => run("approve")}>Approve</MainButton>
        <GhostButton disabled={busy} onClick={() => run("remove")}>Remove</GhostButton>
      </div>
    </Card>
  );
}

export default function TipsPage() {
  const [tab, setTab] = useState<TipTab>("review");
  const totals = useLoad(fetchTipTotals, []);
  const tips = useLoad(() => fetchTips(tab), [tab]);
  const words = useLoad(fetchReportedWords, []);
  const refresh = () => { totals.reload(); tips.reload(); words.reload(); };
  const t = totals.data;
  const wordCount = words.data?.length ?? 0;
  const reviewCount = t ? t.tabs.review + wordCount : null;
  const showWords = tab === "review" && words.data;
  const empty = (tips.data?.length ?? 0) === 0 && (tab !== "review" || wordCount === 0);

  return (
    <>
      <header>
        <h1 className="font-display text-[42px] font-semibold leading-none text-[#23201C]">Tips</h1>
        <p className="mt-2 text-xs text-[#6E675F]">
          Logan checks every tip first. You only see the ones it wasn't sure about and the ones women reported. Authors are never shown.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <PillToggle<TipTab>
            label="Show"
            value={tab}
            onChange={setTab}
            options={[
              { value: "review", label: `To review${reviewCount !== null ? ` ${reviewCount}` : ""}` },
              { value: "live", label: `Live${t ? ` ${t.tabs.live}` : ""}` },
              { value: "removed", label: "Removed" },
            ]}
          />
          {tips.error ? <Failed onRetry={tips.reload} />
            : tips.loading && !tips.data ? <p className="text-sm text-[#6E675F]">Loading…</p>
            : empty ? <Card><p className="text-sm text-[#6E675F]">{tab === "review" ? "Nothing to review. You're all caught up." : tab === "live" ? "No live tips yet." : "Nothing removed."}</p></Card>
            : (
              <div className="space-y-3">
                {showWords && words.data!.map((w) => <WordCard key={`word:${w.word}`} w={w} onChanged={refresh} />)}
                {tips.data!.map((x) => <TipCard key={x.id} tip={x} tab={tab} onChanged={refresh} />)}
              </div>
            )}
        </div>

        <aside>
          <Card>
            <CardTitle>This month</CardTitle>
            {totals.error ? <Failed onRetry={totals.reload} /> : (
              <ul className="space-y-2 text-sm">
                {([
                  ["Shared", t?.month.shared], ["Live after Logan's check", t?.month.live], ["Turned down by Logan", t?.month.turnedDown],
                  ["Reported", t?.month.reported], ["Removed by an admin", t?.month.removed], ["“Helped me too” taps", t?.month.helped],
                ] as [string, number | undefined][]).map(([label, v]) => (
                  <li key={label} className="flex items-center justify-between gap-3">
                    <span className="text-[#23201C]">{label}</span>
                    <span className="font-semibold tabular-nums text-[#23201C]">{v ?? "…"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
