import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";
import { loadTogether, markTogetherShown, setTogetherConsent, trackTogether, TOGETHER_CHANGED } from "@/lib/together";

export function TogetherCirclesIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} style={style}>
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" />
    </svg>
  );
}

const BODY =
  "Together shows what women like you are feeling, so you can see you're not the only one. If you join, the symptoms you log are added to anonymous totals. No one sees your name, your logs or your messages. Numbers only show when at least 10 women share something. You can leave anytime in Settings, and your logs stop counting from that day.";

export function TogetherTab({ userId }: { userId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [joined, setJoined] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const openSheet = () => { setOpen(true); trackTogether("together_consent_shown"); };

  useEffect(() => {
    let alive = true;
    const load = (auto: boolean) => loadTogether(userId).then((s) => {
      if (!alive) return;
      setJoined(s.consent);
      setLoaded(true);
      if (auto && !s.consent && !s.shownAt) {
        openSheet();
        markTogetherShown(userId);
      }
    });
    load(true);
    const sync = () => load(false);
    globalThis.addEventListener(TOGETHER_CHANGED, sync);
    return () => { alive = false; globalThis.removeEventListener(TOGETHER_CHANGED, sync); };
  }, [userId]);

  const join = async () => {
    setSaving(true);
    const ok = await setTogetherConsent(userId, true);
    setSaving(false);
    if (!ok) { toast.error("That didn't save. Try again?"); return; }
    trackTogether("together_consent_yes");
    setJoined(true);
    setOpen(false);
  };

  const notNow = () => { trackTogether("together_consent_not_now"); setOpen(false); };

  if (!loaded) return <div className="flex-1" />;

  return (
    <div className="flex-1 overflow-y-auto px-5 pt-8 pb-28">
      <div className="max-w-md mx-auto text-center flex flex-col items-center gap-4">
        <TogetherCirclesIcon className="h-10 w-10 text-primary" />
        <h1 className="font-heading text-[40px] font-semibold leading-tight text-foreground">Together</h1>
        {joined ? (
          <>
            <p className="text-base text-foreground">Thanks for being here.</p>
            <div className="w-full rounded-[22px] border border-border bg-card px-5 py-6 text-sm text-muted-foreground">
              We're just getting started. As more women join, you'll see what others feel here.
            </div>
          </>
        ) : (
          <>
            <p className="text-base text-muted-foreground">See what women like you are feeling, without sharing who you are.</p>
            <button type="button" onClick={openSheet}
              className="mt-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background">
              Count me in
            </button>
          </>
        )}
      </div>

      <Sheet open={open} onOpenChange={(o) => { if (!o) notNow(); }}>
        <SheetContent side="bottom" className="rounded-t-[28px] px-6 pb-10 pt-8">
          <div className="max-w-md mx-auto flex flex-col gap-4">
            <SheetTitle className="font-heading text-[34px] font-semibold text-foreground">Count me in</SheetTitle>
            <SheetDescription className="text-[15px] font-normal leading-relaxed text-foreground">{BODY}</SheetDescription>
            <button type="button" disabled={saving} onClick={join}
              className="mt-2 w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background disabled:opacity-60">
              Count me in
            </button>
            <button type="button" onClick={notNow} className="text-sm text-muted-foreground underline">Not now</button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
