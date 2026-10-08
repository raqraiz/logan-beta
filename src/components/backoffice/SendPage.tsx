import { useRef, useState } from "react";
import { format } from "date-fns";
import { useBackOffice } from "@/components/backoffice/BackOfficeShell";
import { BroadcastConfirm } from "@/components/backoffice/BroadcastConfirm";
import { Card, CardTitle, Failed, GhostButton, LINE, MainButton, MUTED, SELECTED, useLoad } from "@/components/backoffice/parts";
import { WaitingDrafts } from "@/components/backoffice/WaitingDrafts";
import { fetchWaitingDrafts, timeAgo, type WaitingDraft } from "@/lib/backOffice/feedback";
import { LIFE_STAGE_LABELS, type LifeStageKey } from "@/lib/metrics/lifeStage";
import {
  EVERYONE, FEEDBACK_ASK_STARTER, MAX_BODY, SEND_STAGES, audienceKey, canSend, createBroadcastDraft, fetchBroadcastCount,
  fetchBroadcastHistory, sendBroadcastDirect, sendBroadcastTest, sendErrorText, type Audience, type BroadcastRow,
} from "@/lib/backOffice/send";

const field = "w-full rounded-2xl border border-[#E6E0D5] bg-white px-4 py-3 text-sm text-[#23201C] placeholder:text-[#6E675F]";

const audienceLabel = (a: Audience) =>
  a.type === "all" ? "Everyone" : SEND_STAGES.filter((s) => a.stages.includes(s)).map((s) => LIFE_STAGE_LABELS[s]).join(", ");

const women = (n: number) => `${n} ${n === 1 ? "woman" : "women"}`;

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={children as string}
      onClick={onClick}
      className="rounded-full border px-3.5 py-1.5 text-sm font-semibold text-[#23201C]"
      style={{ borderColor: LINE, background: on ? SELECTED : "white" }}
    >
      {on ? "✓ " : ""}{children}
    </button>
  );
}

/** How it will look in her inbox (same card as the team inbox). */
function InboxPreview({ body }: { body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground">
      <p className="mb-1 text-xs font-semibold text-primary">Message from the Logan team</p>
      {body.trim()
        ? <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{body}</p>
        : <p className="text-sm text-muted-foreground">Your message shows here as you type.</p>}
      <p className="mt-2 text-xs text-muted-foreground">{format(new Date(), "d MMM yyyy")}</p>
    </div>
  );
}

function History({ rows, sup }: { rows: BroadcastRow[]; sup: boolean }) {
  const sent = rows.filter((r) => r.status === "sent");
  const waiting = sup ? [] : rows.filter((r) => r.status === "waiting");
  return (
    <>
      {waiting.length > 0 && (
        <Card>
          <CardTitle>Waiting for approval</CardTitle>
          <ul className="space-y-3">
            {waiting.map((r) => (
              <li key={r.id} className="text-sm">
                <p className="font-semibold text-[#23201C]">To {r.audienceLabel}</p>
                <p style={{ color: MUTED }}>Drafted {timeAgo(r.createdAt)}{r.writtenBy ? ` by ${r.writtenBy}` : ""}{r.recipientCount != null ? ` · ${women(r.recipientCount)}` : ""}</p>
                {r.body && <p className="mt-1 whitespace-pre-wrap text-[#23201C] [overflow-wrap:anywhere]">{r.body}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <CardTitle>Sent</CardTitle>
        {sent.length === 0 ? <p className="text-sm text-[#6E675F]">Nothing sent yet.</p> : (
          <ul className="divide-y divide-[#F4F1EA]">
            {sent.map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <p className="font-semibold text-[#23201C]">{r.sentAt ? format(new Date(r.sentAt), "d MMM yyyy") : ""} · {r.audienceLabel}</p>
                <p style={{ color: MUTED }}>
                  {r.recipientCount != null ? women(r.recipientCount) : ""}{r.sentBy ? ` · sent by ${r.sentBy}` : ""}
                </p>
                {r.body && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[#6E675F]">Show message</summary>
                    <p className="mt-1 whitespace-pre-wrap text-[#23201C] [overflow-wrap:anywhere]">{r.body}</p>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function SendPage() {
  const { role } = useBackOffice();
  const sup = role === "super_admin";
  const [audience, setAudience] = useState<Audience>(EVERYONE);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  // One id per message. A double click or a retry reuses it, and the database refuses to send the same id twice.
  const sendId = useRef(crypto.randomUUID());

  const count = useLoad(() => fetchBroadcastCount(audience), [audienceKey(audience)]);
  const history = useLoad(fetchBroadcastHistory, []);
  const waiting = useLoad(() => (sup ? fetchWaitingDrafts() : Promise.resolve([] as WaitingDraft[])), [sup]);
  const refresh = () => { count.reload(); history.reload(); waiting.reload(); };

  const trimmed = body.trim();
  const bodyOk = trimmed.length > 0 && body.length <= MAX_BODY;
  const countOk = canSend(count.error ? null : count.data);
  const ready = bodyOk && countOk && !busy;

  const toggleStage = (s: LifeStageKey) => {
    const cur = audience.type === "stages" ? audience.stages : [];
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    setAudience(next.length === 0 ? EVERYONE : { type: "stages", stages: next });
  };

  const saveDraft = async () => {
    setBusy(true); setNote(null);
    try {
      await createBroadcastDraft(audience, trimmed);
      setBody("");
      setNote({ text: sup ? "Draft saved. It's in the waiting list above." : "Draft saved. A super admin will look at it before anything is sent." });
      refresh();
    } catch (e) { setNote({ text: sendErrorText(e), bad: true }); }
    setBusy(false);
  };

  const sendTest = async () => {
    setBusy(true); setNote(null);
    try { await sendBroadcastTest(trimmed); setNote({ text: "Test sent to your own inbox only." }); }
    catch { setNote({ text: "The test didn't send. Please try again.", bad: true }); }
    setBusy(false);
  };

  const doSend = async () => {
    const sent = await sendBroadcastDirect(sendId.current, audience, trimmed);
    sendId.current = crypto.randomUUID();
    setBody("");
    setNote({ text: `Sent to ${women(sent)}.` });
    refresh();
  };

  const cnt = count.data;
  const countText = count.error ? "Couldn't count" : !cnt ? "Counting…" : cnt.kind === "small" ? "Fewer than 10 women" : `Goes to ${women(cnt.n)}`;

  return (
    <>
      <header>
        <h1 className="font-display text-[42px] font-semibold leading-none text-[#23201C]">Send</h1>
        <p className="mt-2 text-xs text-[#6E675F]">Goes to each woman's team inbox, never the Logan chat. Counts only, no names.</p>
      </header>

      {sup && <WaitingDrafts kind="broadcast" drafts={waiting.data} onChanged={refresh} />}

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Card className="space-y-4">
          <CardTitle>New message</CardTitle>

          <div>
            <p className="mb-2 text-sm font-semibold text-[#6E675F]">Who gets it <span className="font-normal">· life stage filters a total, no names</span></p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Audience">
              <Chip on={audience.type === "all"} onClick={() => setAudience(EVERYONE)}>Everyone</Chip>
              {SEND_STAGES.map((s) => (
                <Chip key={s} on={audience.type === "stages" && audience.stages.includes(s)} onClick={() => toggleStage(s)}>{LIFE_STAGE_LABELS[s]}</Chip>
              ))}
            </div>
            <p className="mt-2 text-sm font-semibold text-[#23201C]" aria-live="polite">
              {countText}
              {cnt?.kind === "small" && <span className="ml-2 font-normal text-[#6E675F]">Groups under 10 can't be sent.</span>}
              {cnt?.kind === "n" && cnt.n === 0 && <span className="ml-2 font-normal text-[#6E675F]">Nobody is in this group yet.</span>}
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label htmlFor="send-body" className="text-sm font-semibold text-[#6E675F]">Message</label>
              <GhostButton onClick={() => setBody(FEEDBACK_ASK_STARTER)} disabled={busy}>Draft a feedback ask</GhostButton>
            </div>
            <textarea
              id="send-body"
              className={`${field} min-h-[150px]`}
              maxLength={MAX_BODY}
              placeholder="Plain words, no em dashes."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="mt-1 text-right text-xs tabular-nums text-[#6E675F]">{body.length} / {MAX_BODY}</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[#6E675F]">How it looks in her inbox</p>
            <InboxPreview body={body} />
          </div>

          {note && <p className="text-sm text-[#23201C]" role="status">{note.text}</p>}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {sup && <GhostButton disabled={!bodyOk || busy} onClick={sendTest}>Send a test to me</GhostButton>}
            <GhostButton disabled={!ready} onClick={saveDraft}>Save draft</GhostButton>
            {sup && <MainButton disabled={!ready} onClick={() => setConfirming(true)}>Send</MainButton>}
          </div>
          {!sup && <p className="text-xs text-[#6E675F]">A super admin approves before anything reaches women.</p>}
          {count.error && <Failed onRetry={count.reload} />}
        </Card>

        <div className="space-y-5">
          {history.error ? <Card><Failed onRetry={history.reload} /></Card> : history.data ? <History rows={history.data} sup={sup} /> : <p className="text-sm text-[#6E675F]">Loading…</p>}
        </div>
      </div>

      {sup && (
        <BroadcastConfirm open={confirming} onOpenChange={setConfirming} audience={audience} label={audienceLabel(audience)} onConfirm={doSend} />
      )}
    </>
  );
}
