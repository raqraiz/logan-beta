import { useState } from "react";
import { Coins, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface CreditBalanceProps {
  credits: { free: number; paid: number; total: number; hoursUntilReset?: number } | null;
  onCreditsUpdated: () => void;
}

// Set to true when ready to accept payments
const PAYMENTS_ENABLED = false;

const PLANS = [
  { key: "monthly_250", label: "250 credits/mo", price: "$19/mo" },
  { key: "monthly_600", label: "600 credits/mo", price: "$29/mo" },
];
const BOOSTERS = [
  { key: "booster_50", label: "50 credits", price: "$4" },
  { key: "booster_150", label: "150 credits", price: "$10" },
];

export const CreditBalance = ({ credits, onCreditsUpdated: _onCreditsUpdated }: CreditBalanceProps) => {
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null);

  const handlePurchase = async (priceKey: string) => {
    setIsPurchasing(priceKey);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceKey },
      });
      if (error) throw error;
      if (data?.url) {
        const a = document.createElement("a");
        a.href = data.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (error) {
      toast({ title: "Failed to start checkout", variant: "destructive" });
    } finally {
      setIsPurchasing(null);
    }
  };

  if (!credits) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-accent/50 hover:bg-accent transition-colors cursor-pointer">
          <Coins className="w-3.5 h-3.5 text-primary" />
          <span className={credits.total <= 2 ? "text-destructive" : "text-foreground"}>
            {credits.total}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-4">
          <div>
            <h4 className="font-semibold text-sm mb-1">Credits</h4>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Daily free</span>
              <span>{credits.free}/5{credits.hoursUntilReset ? ` · resets in ${credits.hoursUntilReset}h` : ""}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Purchased</span>
              <span>{credits.paid}</span>
            </div>
          </div>

          {PAYMENTS_ENABLED && (
            <>
              <div className="border-t border-border pt-3 space-y-2">
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
                      {isPurchasing === pack.key ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        pack.price
                      )}
                    </span>
                  </Button>
                ))}
              </div>

              <div className="border-t border-border pt-3 space-y-2">
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
                      {isPurchasing === pack.key ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        pack.price
                      )}
                    </span>
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
