import { useEffect, useState } from "react";
import { TOGETHER_CHANGED, loadTogether } from "@/lib/together";
import { isCurrentConsent, keepTogetherV2, leaveTogetherV2 } from "@/lib/togetherWords";

export const CONSENT_UPDATE_TEXT =
  "A quick update on Together. Words you add yourself can now show up there too, without your name, once I've checked them. If you'd rather keep your words to yourself, you can leave Together. Until you choose, your words stay private.";

/**
 * One message for women who joined Together before words existed. It stays until she answers,
 * then it is gone for good. Until she taps "Keep me in", her logs keep counting as before
 * and none of her words are shared.
 */
export function TogetherConsentUpdate({ userId }: { userId: string }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => loadTogether(userId).then((s) => { if (alive) setShow(s.consent && !isCurrentConsent(s.version)); });
    void load();
    globalThis.addEventListener(TOGETHER_CHANGED, load);
    return () => { alive = false; globalThis.removeEventListener(TOGETHER_CHANGED, load); };
  }, [userId]);
  if (!show) return null;
  const answer = async (keep: boolean) => {
    setBusy(true); setErr(false);
    const ok = keep ? await keepTogetherV2() : await leaveTogetherV2();
    setBusy(false);
    if (!ok) { setErr(true); return; }
    setShow(false);
  };
  return (
    <div className="mb-6 flex flex-col items-start gap-3" role="group" aria-label="Together update">
      <p className="text-[15px] leading-relaxed text-foreground">{CONSENT_UPDATE_TEXT}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void answer(true)} className="min-h-[44px] rounded-full bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-60">Keep me in</button>
        <button type="button" disabled={busy} onClick={() => void answer(false)} className="min-h-[44px] rounded-full border border-border bg-card px-5 text-sm font-semibold text-foreground disabled:opacity-60">Leave Together</button>
      </div>
      {err && <p className="text-sm text-destructive">That didn't save. Try again?</p>}
    </div>
  );
}
