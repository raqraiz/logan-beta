import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getAnalyticsConsent, setAnalyticsConsent } from "@/lib/thirdPartyAnalytics";

export function PrivacySection() {
  const [on, setOn] = useState(() => getAnalyticsConsent() === "granted");
  useEffect(() => {
    const sync = () => setOn(getAnalyticsConsent() === "granted");
    globalThis.addEventListener("logan:analytics-consent", sync);
    return () => globalThis.removeEventListener("logan:analytics-consent", sync);
  }, []);
  return (
    <div className="border-t border-border/50 pt-4">
      <Label className="text-sm font-medium mb-2 block">Privacy</Label>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="analytics-consent" className="text-sm font-normal text-muted-foreground">
          Help improve Logan with anonymous usage analytics
        </Label>
        <Switch id="analytics-consent" checked={on} onCheckedChange={(v) => { setOn(v); setAnalyticsConsent(v ? "granted" : "denied"); }} />
      </div>
    </div>
  );
}
