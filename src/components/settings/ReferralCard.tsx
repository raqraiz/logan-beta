import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, Share2, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ReferralCardProps {
  userId?: string;
}

export function ReferralCard({ userId }: ReferralCardProps) {
  const [code, setCode] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await supabase
          .from("profiles")
          .select("referral_code")
          .eq("id", userId)
          .maybeSingle();

        const refCode = (data as any)?.referral_code ?? null;
        if (!refCode) {
          console.warn("[ReferralCard] missing referral_code for user", userId);
        }

        const { data: joined, error: countError } = await supabase.rpc("get_referral_count");
        if (countError) {
          console.error("[ReferralCard] count fetch failed:", countError);
          throw countError;
        }

        if (cancelled) return;
        setCode(refCode);
        setCount(typeof joined === "number" ? joined : 0);
      } catch (e) {
        console.error("[ReferralCard] count fetch failed:", e);
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const link = code ? `https://asklogan.ai/?ref=${code}` : "";

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast({ title: "Copied!", description: "Your link is ready to share." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      toast({ title: "Copied!", description: "Code copied to clipboard." });
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  };

  const share = async () => {
    if (!link || !code) return;
    const shareText = `Been using this and it's honestly kind of scary how accurate it is. Try it → ${link}\n\n(If the link doesn't work, use code ${code} when you sign up)`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Logan — health & performance for women",
          text: shareText,
          url: link,
        });
      } catch {
        /* user cancelled */
      }
    } else {
      copy();
    }
  };

  return (
    <div className="border-t border-border/50 pt-4">
      <Label className="text-sm font-medium mb-2 block">Invite friends</Label>
      <p className="text-xs text-muted-foreground mb-3">
        Share your link and help Logan grow 🌱
      </p>

      <div className="mb-3 rounded-xl border border-primary/25 bg-primary/10 backdrop-blur-sm px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          {loading ? (
            <>
              <Skeleton className="h-5 w-40 mb-1.5" />
              <Skeleton className="h-3 w-28" />
            </>
          ) : error ? (
            <>
              <p className="text-base font-display font-semibold text-foreground leading-tight">
                Couldn't load your referral count
              </p>
              <p className="text-[11px] text-muted-foreground">
                Pull to refresh or try again in a moment.
              </p>
            </>
          ) : count === 0 ? (
            <>
              <p className="text-base font-display font-semibold text-foreground leading-tight">
                No one yet — share your link to get started
              </p>
              <p className="text-[11px] text-muted-foreground">
                Your first invite is the hardest one.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-display font-semibold text-foreground leading-tight">
                {count} friend{count === 1 ? "" : "s"} joined so far
              </p>
              <p className="text-[11px] text-muted-foreground">
                {count === 1 ? "Your first invite landed — nice." : "Thanks for spreading the word."}
              </p>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-10 w-full" />
      ) : !code ? (
        <p className="text-xs text-muted-foreground rounded-lg border border-border/50 px-3 py-2">
          Your referral link isn't ready yet. Try again in a moment — if it keeps
          happening, let us know.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <Input
              value={link}
              readOnly
              className="font-mono text-xs"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button variant="outline" size="icon" onClick={copy} aria-label="Copy link">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
            <Button variant="outline" size="icon" onClick={share} aria-label="Share link">
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
          <button
            type="button"
            onClick={copyCode}
            className="mt-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors text-left"
          >
            Or share this code: <span className="font-mono text-foreground">{code}</span>
            {codeCopied && <span className="ml-1 text-primary">Copied!</span>}
          </button>
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            Friends can enter it under "Have a referral code?" when they sign up.
          </p>
        </>
      )}
    </div>
  );
}
