import { useEffect, useState } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trackTogether } from "@/lib/together";

export function InvitePage({ userId, onBack }: { userId?: string; onBack: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      trackTogether("invite_copied");
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  const share = async () => {
    if (!link) return;
    const text = `I've been using Logan to understand my body. Try it: ${link}`;
    if (navigator.share) {
      try { await navigator.share({ text }); trackTogether("invite_shared"); } catch { /* cancelled */ }
    } else {
      await copy();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-5 pt-8 pb-28">
      <div className="mx-auto max-w-md text-left">
        <Button variant="outline" size="icon" onClick={onBack} aria-label="Back to Together" className="h-11 w-11 rounded-full text-foreground shadow-none"><ArrowLeft /></Button>
        <h1 className="mt-6 font-heading text-[40px] font-semibold leading-tight text-foreground">
          Grow the <span className="landing-brand-text">circle</span>
        </h1>
        <p className="mt-3 text-base leading-relaxed text-foreground">
          Every woman who joins makes "Is this just me?" a little clearer for all of us.
        </p>

        <section className="mt-6 rounded-[22px] bg-card p-5">
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

        {count > 0 && <p className="mt-4 text-[15px] font-semibold text-foreground">{count} {count === 1 ? "friend" : "friends"} joined with your link</p>}

        <Button onClick={share} disabled={!code} className="mt-6 h-12 w-full rounded-full bg-foreground text-base font-semibold text-background hover:bg-foreground/90">
          Share your link
        </Button>
      </div>
    </div>
  );
}
