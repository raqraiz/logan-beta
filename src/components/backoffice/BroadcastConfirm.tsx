import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MainButton } from "@/components/backoffice/parts";
import { canSend, fetchBroadcastCount, sendErrorText, type Audience, type CountResult } from "@/lib/backOffice/send";

/** "Send to N women?" The count is taken fresh when the dialog opens. The database counts again at the moment of sending. */
export function BroadcastConfirm({ open, onOpenChange, audience, label, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; audience: Audience; label: string; onConfirm: () => Promise<void>;
}) {
  const [count, setCount] = useState<CountResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setCount(null); setErr(null);
    fetchBroadcastCount(audience).then((c) => { if (live) setCount(c); }).catch(() => { if (live) setErr("Couldn't check the number of women. Please try again."); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const n = count?.kind === "n" ? count.n : 0;
  const go = async () => {
    setBusy(true); setErr(null);
    try { await onConfirm(); onOpenChange(false); } catch (e) { setErr(sendErrorText(e)); }
    setBusy(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {!count ? "Checking who this reaches…" : count.kind === "small" ? "Fewer than 10 women" : n === 0 ? "Nobody in this group" : `Send to ${n} ${n === 1 ? "woman" : "women"}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {count && canSend(count)
              ? `Goes to ${label} as a message from the Logan team in their inbox. It can't be taken back.`
              : count ? "This group can't be sent to." : "One moment."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {err && <p className="text-sm text-[#23201C]">{err}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <MainButton disabled={busy || !canSend(count)} onClick={go}>{busy ? "Sending…" : canSend(count) ? `Send to ${n}` : "Send"}</MainButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
