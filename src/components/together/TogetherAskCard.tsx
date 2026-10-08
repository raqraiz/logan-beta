import { useEffect, useState } from "react";
import { TOGETHER_CONSENT_COPY, loadTogether, markTogetherShown, setTogetherConsent, trackTogether } from "@/lib/together";

/** Asked once in chat to women who haven't answered. Never shown again after either answer. */
export function TogetherAskCard({ userId }: { userId: string }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    loadTogether(userId).then((s) => { if (alive && !s.consent && !s.shownAt) { setShow(true); trackTogether("together_consent_shown"); } });
    return () => { alive = false; };
  }, [userId]);
  if (!show) return null;
  const answer = async (yes: boolean) => {
    setBusy(true); setErr(false);
    if (yes && !(await setTogetherConsent(userId, true))) { setBusy(false); setErr(true); return; }
    await markTogetherShown(userId);
    trackTogether(yes ? "together_consent_yes" : "together_consent_not_now");
    setShow(false);
  };
  return (
    <div className="mb-6 flex flex-col items-start gap-3">
      <p className="text-[15px] leading-relaxed text-foreground">{TOGETHER_CONSENT_COPY}</p>
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => answer(true)} className="min-h-[44px] rounded-full bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-60">Count me in</button>
        <button type="button" disabled={busy} onClick={() => answer(false)} className="min-h-[44px] rounded-full border border-border bg-card px-5 text-sm font-semibold text-foreground">Not now</button>
      </div>
      {err && <p className="text-sm text-destructive">That didn't save. Try again?</p>}
    </div>
  );
}
