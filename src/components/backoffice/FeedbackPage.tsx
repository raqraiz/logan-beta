import { useState } from "react";
import { Link } from "react-router-dom";
import { useBackOffice } from "@/components/backoffice/BackOfficeShell";
import { Card, CardTitle, Failed, GhostButton, LINE, MainButton, MUTED, PillToggle, SELECTED, useLoad } from "@/components/backoffice/parts";
import {
  THEMES, approveDraft, backfillBatch, backfillWaiting, createReplyDraft, displayName, editDraft, fetchFeedback, fetchFeedbackCounts,
  fetchWaitingDrafts, markFeedbackHandled, rejectDraft, replyStarter, sendTeamMessage, setFeedbackTheme, stateLabel, themeLabel, timeAgo,
  type FeedbackItem, type FeedbackTab, type Theme, type WaitingDraft,
} from "@/lib/backOffice/feedback";

const field = "w-full rounded-2xl border border-[#E6E0D5] bg-white px-4 py-3 text-sm text-[#23201C] placeholder:text-[#6E675F]";

function ReplyBox({ item, sup, onDone }: { item: FeedbackItem; sup: boolean; onDone: (note: string) => void }) {
  const [body, setBody] = useState(replyStarter(item.firstName));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(false);
    try {
      if (sup && item.userId) { await sendTeamMessage(item.userId, item.id, body.trim()); onDone("Sent. Marked handled."); }
      else { await createReplyDraft(item.id, body.trim()); onDone("Sent to a super admin for approval."); }
    } catch { setErr(true); setBusy(false); }
  };
  return (
    <div className="mt-3 space-y-2">
      <textarea aria-label="Your reply" className={`${field} min-h-[110px]`} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
      <p className="text-xs text-[#6E675F]">
        {sup ? "She sees this in her chat, marked as a message from the Logan team." : "A super admin approves it before she sees it."}
      </p>
      {err && <p className="text-sm text-[#23201C]">That didn't send. Please try again.</p>}
      <MainButton disabled={busy || !body.trim()} onClick={submit}>{busy ? "Sending…" : sup ? "Send" : "Send for approval"}</MainButton>
    </div>
  );
}

function FeedbackCard({ item, sup, onChanged }: { item: FeedbackItem; sup: boolean; onChanged: () => void }) {
  const [replying, setReplying] = useState(false);
  const [note, setNote] = useState("");
  const [theme, setTheme] = useState<Theme>(item.theme);
  const [err, setErr] = useState(false);
  const label = stateLabel(item.state, sup);
  const name = displayName(item, sup);
  const run = async (fn: () => Promise<unknown>) => { setErr(false); try { await fn(); onChanged(); } catch { setErr(true); } };
  return (
    <Card>
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#23201C]">“{item.text}”</p>
      {label && <p className="mt-2 inline-block rounded-full border border-[#E6E0D5] px-2.5 py-0.5 text-xs text-[#6E675F]">{label}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[#6E675F]">
        {sup && item.userId ? <Link to={`/admin/users/${item.userId}`} className="font-semibold text-[#23201C] underline underline-offset-2">{name}</Link> : <span className="font-semibold text-[#23201C]">{name}</span>}
        <span>{item.channel === "in_app" ? "In-app" : item.channel}</span>
        <span>{timeAgo(item.createdAt)}</span>
        <select
          aria-label="Theme"
          value={theme}
          onChange={(e) => { const t = e.target.value as Theme; setTheme(t); run(() => setFeedbackTheme(item.id, t)); }}
          className="rounded-full border border-[#E6E0D5] bg-white px-3 py-1 text-sm text-[#23201C]"
        >
          {THEMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!item.handled && !note && <GhostButton onClick={() => setReplying((v) => !v)}>Draft a reply</GhostButton>}
        {item.handled
          ? <GhostButton onClick={() => run(() => markFeedbackHandled(item.id, false))}>Mark as new</GhostButton>
          : <GhostButton onClick={() => run(() => markFeedbackHandled(item.id, true))}>Mark handled</GhostButton>}
        {note && <span className="text-sm text-[#6E675F]">{note}</span>}
        {err && <span className="text-sm text-[#23201C]">That didn't save. Please try again.</span>}
      </div>
      {replying && !note && <ReplyBox item={item} sup={sup} onDone={(m) => { setNote(m); setReplying(false); onChanged(); }} />}
    </Card>
  );
}

function WaitingCard({ d, onChanged }: { d: WaitingDraft; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(d.body);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(false); try { await fn(); onChanged(); } catch { setErr(true); setBusy(false); } };
  return (
    <div className="rounded-2xl border border-[#E6E0D5] p-4">
      <p className="text-sm text-[#6E675F]">
        To <span className="font-semibold text-[#23201C]">{displayName(d, true)}</span>
        {d.writtenBy ? ` · written by ${d.writtenBy}` : ""} · {timeAgo(d.createdAt)}
      </p>
      {d.feedbackText && <p className="mt-2 text-sm italic text-[#6E675F]">She wrote: “{d.feedbackText}”</p>}
      {editing
        ? <textarea aria-label="Edit reply" className={`${field} mt-2 min-h-[100px]`} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
        : <p className="mt-2 whitespace-pre-wrap text-[15px] text-[#23201C]">{d.body}</p>}
      {err && <p className="mt-2 text-sm text-[#23201C]">That didn't work. Please try again.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {editing
          ? <GhostButton disabled={busy || !body.trim()} onClick={() => run(async () => { await editDraft(d.id, body.trim()); setEditing(false); })}>Save edit</GhostButton>
          : <GhostButton disabled={busy} onClick={() => setEditing(true)}>Edit</GhostButton>}
        <MainButton disabled={busy || editing} onClick={() => run(() => approveDraft(d.id))}>Approve and send</MainButton>
        <GhostButton disabled={busy} onClick={() => run(() => rejectDraft(d.id))}>Reject</GhostButton>
      </div>
    </div>
  );
}

/** One-off: writes the cleaned copy for older feedback. Shows the count first and writes only after a confirm. */
function BackfillCard() {
  const waiting = useLoad(backfillWaiting, []);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [err, setErr] = useState(false);
  const count = left ?? waiting.data ?? 0;
  if (waiting.loading || waiting.error || (count === 0 && !running)) return null;
  const run = async () => {
    setConfirming(false); setRunning(true); setErr(false);
    try {
      for (;;) {
        const r = await backfillBatch();
        setLeft(r.waiting);
        if (r.cleaned === 0 || r.waiting === 0) break;
      }
    } catch { setErr(true); }
    setRunning(false);
    waiting.reload();
  };
  return (
    <Card>
      <CardTitle>Older feedback</CardTitle>
      <p className="text-sm text-[#6E675F]">{count} older {count === 1 ? "note needs" : "notes need"} a cleaned copy so admins can read them without health details. Nothing she wrote is changed.</p>
      {err && <p className="mt-2 text-sm text-[#23201C]">Stopped part way. You can run it again.</p>}
      <div className="mt-3">
        {running ? <span className="text-sm text-[#6E675F]">Cleaning… {count} left</span>
          : confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-[#23201C]">Clean {count} notes now?</span>
              <MainButton onClick={run}>Yes, clean</MainButton>
              <GhostButton onClick={() => setConfirming(false)}>Cancel</GhostButton>
            </div>
          ) : <GhostButton onClick={() => setConfirming(true)}>Clean older feedback ({count} waiting)</GhostButton>}
      </div>
    </Card>
  );
}

export default function FeedbackPage() {
  const { role } = useBackOffice();
  const sup = role === "super_admin";
  const [tab, setTab] = useState<FeedbackTab>("new");
  const [theme, setTheme] = useState<Theme | null>(null);
  const counts = useLoad(() => fetchFeedbackCounts(tab), [tab]);
  const list = useLoad(() => fetchFeedback(tab, theme), [tab, theme]);
  const waiting = useLoad(() => (sup ? fetchWaitingDrafts() : Promise.resolve([] as WaitingDraft[])), [sup]);
  const refresh = () => { counts.reload(); list.reload(); waiting.reload(); };
  const c = counts.data;

  return (
    <>
      <header>
        <h1 className="font-display text-[42px] font-semibold leading-none text-[#23201C]">Feedback</h1>
        <p className="mt-2 text-xs text-[#6E675F]">
          {sup ? "Health details stay hidden unless she said yes." : "Health details are always removed for admins."}
        </p>
      </header>

      {sup && (waiting.data?.length ?? 0) > 0 && (
        <Card>
          <CardTitle>Waiting for your approval</CardTitle>
          <div className="space-y-3">{waiting.data!.map((d) => <WaitingCard key={d.id} d={d} onChanged={refresh} />)}</div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <PillToggle<FeedbackTab>
              label="Show"
              value={tab}
              onChange={(v) => { setTab(v); setTheme(null); }}
              options={[
                { value: "new", label: `New${c ? ` ${c.tabs.new}` : ""}` },
                { value: "handled", label: `Handled${c ? ` ${c.tabs.handled}` : ""}` },
                { value: "all", label: `All${c ? ` ${c.tabs.all}` : ""}` },
              ]}
            />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Theme">
            {THEMES.map((t) => {
              const on = theme === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  aria-label={`${t.label}${c ? ` ${c.themes[t.value]}` : ""}`}
                  onClick={() => setTheme(on ? null : t.value)}
                  className="rounded-full border px-3.5 py-1.5 text-sm font-semibold text-[#23201C]"
                  style={{ borderColor: LINE, background: on ? SELECTED : "white" }}
                >
                  {on ? "✓ " : ""}{t.label}{c ? <span className="ml-1.5 font-medium" style={{ color: MUTED }}>{c.themes[t.value]}</span> : null}
                </button>
              );
            })}
          </div>

          {list.error ? <Failed onRetry={list.reload} />
            : list.loading && !list.data ? <p className="text-sm text-[#6E675F]">Loading…</p>
            : (list.data?.length ?? 0) === 0 ? <Card><p className="text-sm text-[#6E675F]">{tab === "new" ? "Nothing new. You're all caught up." : "No feedback here."}</p></Card>
            : <div className="space-y-3">{list.data!.map((i) => <FeedbackCard key={i.id} item={i} sup={sup} onChanged={refresh} />)}</div>}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardTitle>This month</CardTitle>
            {counts.error ? <Failed onRetry={counts.reload} /> : (
              <ul className="space-y-2">
                {THEMES.map((t) => (
                  <li key={t.value} className="flex items-center justify-between text-sm">
                    <span className="text-[#23201C]">{themeLabel(t.value)}</span>
                    <span className="font-semibold tabular-nums text-[#23201C]">{c ? c.month[t.value] : "…"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {sup && <BackfillCard />}
        </aside>
      </div>
    </>
  );
}
