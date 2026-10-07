import { useEffect, useState } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trackTogether } from "@/lib/together";

const BRAND_GRADIENT = "linear-gradient(90deg, #FF2E92 0%, #A22BE8 50%, #2BD4D9 100%)";

export function InvitePage({ userId, onBack }: { userId?: string; onBack: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => { trackTogether("invite_opened"); }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("referral_code").eq("id", userId).maybeSingle();
      const { data: authData } = await supabase.auth.getUser();
      const isPreview = !!authData?.user?.id && authData.user.id !== userId;
      const { data: joined } = isPreview
        ? await supabase.rpc("get_referral_count", { _user_id: userId } as any)
        : await supabase.rpc("get_referral_count");
      if (cancelled) return;
      setCode((data as any)?.referral_code ?? null);
      setCount(typeof joined === "number" ? joined : 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const link = code ? `https://asklogan.ai/?ref=${code}` : "";
  const shareText = `I've been using Logan to understand my body. Try it: ${link}`;

  const copy = async () => {
    if (!link) return false;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      trackTogether("invite_copied");
      setTimeout(() => setCopied(false), 2000);
      return true;
    } catch { return false; }
  };

  const share = async () => {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
        trackTogether("invite_shared");
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return; // she cancelled
      }
    }
    const ok = await copy();
    if (ok) {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-5 pt-8 pb-28">
      <div className="mx-auto max-w-md text-left">
        <Button variant="outline" size="icon" onClick={onBack} aria-label="Back to Together" className="h-11 w-11 rounded-full text-foreground shadow-none"><ArrowLeft /></Button>
        <h1 className="mt-6 font-heading text-[40px] font-semibold leading-tight text-foreground">
          Grow the circle
        </h1>
        <p className="mt-3 text-base leading-relaxed text-foreground">
          Every woman who joins makes “Is this just me?” a little clearer for all of us.
        </p>

        <section className="mt-6 rounded-[22px] bg-card p-5">
          {loading ? <Skeleton className="h-[72px] w-full" /> : count > 0 ? (
            <div className="flex items-center gap-4">
              <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full p-[3px]" style={{ background: BRAND_GRADIENT }} aria-hidden="true">
                <div className="flex h-full w-full items-center justify-center rounded-full bg-card">
                  <span className="text-[32px] font-bold text-foreground">{count}</span>
                </div>
              </div>
              <div>
                <p className="text-[15px] font-medium text-foreground">{count === 1 ? "friend" : "friends"} joined with your link</p>
                <p className="mt-1 text-sm text-[#6E675F] dark:text-muted-foreground">Thank you for growing the circle.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="h-[72px] w-[72px] shrink-0 rounded-full border border-border" aria-hidden="true" />
              <p className="text-[15px] font-medium text-foreground">Your first friend will show up here.</p>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-[22px] bg-card p-5">
          <p className="text-[13px] font-semibold text-muted-foreground">Your link</p>
          {loading ? <Skeleton className="mt-3 h-10 w-full" /> : !code ? (
            <p className="mt-3 text-sm text-muted-foreground">Your link isn't ready yet. Try again in a moment.</p>
          ) : <>
            <div className="mt-3 flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">{link.replace("https://", "")}</p>
              <button type="button" onClick={copy} className="flex h-11 shrink-0 items-center" aria-live="polite">
                <span className="flex h-9 items-center rounded-full border border-border bg-background px-3.5 text-[13px] font-semibold text-foreground">
                  {copied ? "✓ Copied" : "Copy"}
                </span>
              </button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Or share your code: <span className="font-semibold text-foreground">{code}</span></p>
          </>}
        </section>

        <p className="mt-4 flex items-start gap-2 text-sm leading-snug text-[#6E675F] dark:text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Only your link is shared. Nothing about your health, your cycle or what you've told me.
        </p>

        <Button onClick={share} disabled={!code} className="mt-6 h-12 w-full rounded-full bg-foreground text-base font-semibold text-background hover:bg-foreground/90" aria-live="polite">
          {shareCopied ? "✓ Link copied" : "Share your link"}
        </Button>
        <Button asChild variant="outline" disabled={!code} className="mt-3 h-12 w-full rounded-full text-base font-semibold">
          <a href={code ? `https://wa.me/?text=${encodeURIComponent(shareText)}` : undefined} target="_blank" rel="noopener noreferrer">
            Send on WhatsApp
          </a>
        </Button>
      </div>
    </div>
  );
}
