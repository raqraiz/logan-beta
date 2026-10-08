import { useState } from "react";
import { Card, CardTitle, GhostButton, MainButton } from "@/components/backoffice/parts";
import { BroadcastConfirm } from "@/components/backoffice/BroadcastConfirm";
import { approveBroadcast, type Audience } from "@/lib/backOffice/send";
import { approveDraft, displayName, editDraft, rejectDraft, timeAgo, type WaitingDraft } from "@/lib/backOffice/feedback";

const field = "w-full rounded-2xl border border-[#E6E0D5] bg-white px-4 py-3 text-sm text-[#23201C] placeholder:text-[#6E675F]";

export function WaitingCard({ d, onChanged }: { d: WaitingDraft; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(d.body);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const broadcast = d.kind === "broadcast";
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(false); try { await fn(); onChanged(); } catch { setErr(true); setBusy(false); } };
  return (
    <div className="rounded-2xl border border-[#E6E0D5] p-4">
      <p className="text-sm text-[#6E675F]">
        To <span className="font-semibold text-[#23201C]">{broadcast ? (d.audienceLabel ?? "Everyone") : displayName(d, true)}</span>
        {broadcast && d.recipientCount != null ? ` · ${d.recipientCount} ${d.recipientCount === 1 ? "woman" : "women"} when drafted` : ""}
        {d.writtenBy ? ` · written by ${d.writtenBy}` : ""} · {timeAgo(d.createdAt)}
      </p>
      {d.feedbackText && <p className="mt-2 text-sm italic text-[#6E675F]">She wrote: “{d.feedbackText}”</p>}
      {editing
        ? <textarea aria-label="Edit reply" className={`${field} mt-2 min-h-[100px]`} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
        : <p className="mt-2 whitespace-pre-wrap text-[15px] text-[#23201C] [overflow-wrap:anywhere]">{d.body}</p>}
      {err && <p className="mt-2 text-sm text-[#23201C]">That didn't work. Please try again.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {editing
          ? <GhostButton disabled={busy || !body.trim()} onClick={() => run(async () => { await editDraft(d.id, body.trim()); setEditing(false); })}>Save edit</GhostButton>
          : <GhostButton disabled={busy} onClick={() => setEditing(true)}>Edit</GhostButton>}
        <MainButton disabled={busy || editing} onClick={() => (broadcast ? setConfirming(true) : run(() => approveDraft(d.id)))}>Approve and send</MainButton>
        <GhostButton disabled={busy} onClick={() => run(() => rejectDraft(d.id))}>Reject</GhostButton>
      </div>
      {broadcast && (
        <BroadcastConfirm
          open={confirming}
          onOpenChange={setConfirming}
          audience={(d.audience ?? { type: "all" }) as Audience}
          label={d.audienceLabel ?? "Everyone"}
          onConfirm={async () => { await approveBroadcast(d.id); onChanged(); }}
        />
      )}
    </div>
  );
}

/** "Waiting for your approval" (super admin). Each screen shows only its own kind of draft. */
export function WaitingDrafts({ kind, drafts, onChanged }: { kind: string; drafts: WaitingDraft[] | null; onChanged: () => void }) {
  const mine = (drafts ?? []).filter((d) => d.kind === kind);
  if (mine.length === 0) return null;
  return (
    <Card>
      <CardTitle>Waiting for your approval</CardTitle>
      <div className="space-y-3">{mine.map((d) => <WaitingCard key={d.id} d={d} onChanged={onChanged} />)}</div>
    </Card>
  );
}
