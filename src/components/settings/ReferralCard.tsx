import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check, Share2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ReferralCardProps {
  userId?: string;
}

export function ReferralCard({ userId }: ReferralCardProps) {
  const [code, setCode] = useState<string | null>(null);
  const [count, setCount] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("referral_code")
        .eq("id", userId)
        .maybeSingle();
      setCode((data as any)?.referral_code ?? null);

      const { count: c } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("referred_by", userId);
      setCount(c ?? 0);
    })();
  }, [userId]);

  const link = code ? `${window.location.origin}/?ref=${code}` : "";

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast({ title: "Link copied", description: "Share it anywhere." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  };

  const share = async () => {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Logan — health & performance for women",
          text: "I've been using Logan. Thought you'd like it too.",
          url: link,
        });
      } catch { /* user cancelled */ }
    } else {
      copy();
    }
  };

  return (
    <div className="border-t border-border/50 pt-4">
      <Label className="text-sm font-medium mb-2 block">Invite friends</Label>
      <p className="text-xs text-muted-foreground mb-3">
        Share your personal link. We'll credit you when someone signs up through it.
        {count > 0 && <span className="ml-1 text-foreground font-medium">{count} signup{count === 1 ? "" : "s"} so far.</span>}
      </p>
      <div className="flex gap-2">
        <Input value={link} readOnly className="font-mono text-xs" onClick={(e) => (e.target as HTMLInputElement).select()} />
        <Button variant="outline" size="icon" onClick={copy} disabled={!link} aria-label="Copy link">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </Button>
        <Button variant="outline" size="icon" onClick={share} disabled={!link} aria-label="Share link">
          <Share2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
