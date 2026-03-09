import { Coins, Plus, Gift, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";

interface OutOfCreditsProps {
  hoursUntilReset?: number;
  onCreditsUpdated: () => void;
}

const PLANS = [
  { key: "monthly_250", label: "250/mo", price: "$19/mo", section: "plans" },
  { key: "monthly_600", label: "600/mo", price: "$29/mo", section: "plans" },
];
const BOOSTERS = [
  { key: "booster_50", label: "50 credits", price: "$4", section: "boosters" },
  { key: "booster_150", label: "150 credits", price: "$10", section: "boosters" },
];

export const OutOfCredits = ({ hoursUntilReset, onCreditsUpdated }: OutOfCreditsProps) => {
  const [promoCode, setPromoCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null);

  const handlePurchase = async (priceKey: string) => {
    setIsPurchasing(priceKey);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceKey },
      });
      if (error) throw error;
      if (data?.url) {
        const w = window.open(data.url, "_blank");
        if (!w) window.location.href = data.url;
      }
    } catch {
      toast({ title: "Failed to start checkout", variant: "destructive" });
    } finally {
      setIsPurchasing(null);
    }
  };

  const handleRedeemPromo = async () => {
    if (!promoCode.trim()) return;
    setIsRedeeming(true);
    try {
      const { data, error } = await supabase.functions.invoke("redeem-promo", {
        body: { code: promoCode },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: data.error, variant: "destructive" });
      } else {
        toast({ title: `${data.creditsAdded} credits added` });
        setPromoCode("");
        onCreditsUpdated();
      }
    } catch {
      toast({ title: "Failed to redeem code", variant: "destructive" });
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 max-w-sm mx-auto text-center space-y-4">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
        <Coins className="w-6 h-6 text-primary" />
      </div>
      <div>
        <h3 className="font-semibold text-foreground">Out of credits</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Your 5 daily free credits renew{hoursUntilReset ? ` in ${hoursUntilReset}h` : " every 24 hours"}.
          <br />Get more to keep chatting now.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Monthly plans</p>
        {PLANS.map((pack) => (
          <Button
            key={pack.key}
            variant="outline"
            size="sm"
            className="w-full justify-between"
            onClick={() => handlePurchase(pack.key)}
            disabled={!!isPurchasing}
          >
            <span className="flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              {pack.label}
            </span>
            <span className="text-muted-foreground">
              {isPurchasing === pack.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : pack.price}
            </span>
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Boosters</p>
        {BOOSTERS.map((pack) => (
          <Button
            key={pack.key}
            variant="outline"
            size="sm"
            className="w-full justify-between"
            onClick={() => handlePurchase(pack.key)}
            disabled={!!isPurchasing}
          >
            <span className="flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              {pack.label}
            </span>
            <span className="text-muted-foreground">
              {isPurchasing === pack.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : pack.price}
            </span>
          </Button>
        ))}
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-xs text-muted-foreground mb-2 flex items-center justify-center gap-1">
          <Gift className="w-3.5 h-3.5" />
          Have a promo code?
        </p>
        <div className="flex gap-2">
          <Input
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="Enter code"
            className="h-8 text-sm"
            onKeyDown={(e) => e.key === "Enter" && handleRedeemPromo()}
          />
          <Button size="sm" className="h-8" onClick={handleRedeemPromo} disabled={!promoCode.trim() || isRedeeming}>
            {isRedeeming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  );
};
