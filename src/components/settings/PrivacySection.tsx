import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getAnalyticsConsent, setAnalyticsConsent } from "@/lib/thirdPartyAnalytics";
import { loadTogether, setTogetherConsent, trackTogether, TOGETHER_CHANGED } from "@/lib/together";

export function PrivacySection() {
  const [on, setOn] = useState(() => getAnalyticsConsent() === "granted");
  const [userId, setUserId] = useState<string | null>(null);
  const [together, setTogether] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    const sync = () => setOn(getAnalyticsConsent() === "granted");
    globalThis.addEventListener("logan:analytics-consent", sync);
    return () => globalThis.removeEventListener("logan:analytics-consent", sync);
  }, []);

  useEffect(() => {
    let uid: string | null = null;
    const load = () => uid && loadTogether(uid).then((s) => setTogether(s.consent));
    supabase.auth.getUser().then(({ data: { user } }) => { uid = user?.id ?? null; setUserId(uid); load(); });
    globalThis.addEventListener(TOGETHER_CHANGED, load as any);
    return () => globalThis.removeEventListener(TOGETHER_CHANGED, load as any);
  }, []);

  const onTogether = async (v: boolean) => {
    if (!userId) return;
    if (!v) { setConfirmLeave(true); return; }
    const ok = await setTogetherConsent(userId, true);
    if (!ok) { toast.error("That didn't save. Try again?"); return; }
    trackTogether("together_consent_yes");
  };

  const leave = async () => {
    if (!userId) return;
    const ok = await setTogetherConsent(userId, false);
    if (!ok) { toast.error("That didn't save. Try again?"); return; }
    trackTogether("together_consent_left");
  };

  return (
    <div className="border-t border-border/50 pt-4">
      <Label className="text-sm font-medium mb-2 block">Privacy</Label>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="analytics-consent" className="text-sm font-normal text-muted-foreground">
          Help improve Logan with anonymous usage analytics
        </Label>
        <Switch id="analytics-consent" checked={on} onCheckedChange={(v) => { setOn(v); setAnalyticsConsent(v ? "granted" : "denied"); }} />
      </div>
      {userId && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <Label htmlFor="together-consent" className="text-sm font-normal text-muted-foreground">Count me in Together</Label>
          <Switch id="together-consent" checked={together} onCheckedChange={onTogether} />
        </div>
      )}
      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Together? Your logs will stop counting from today.</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={leave}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
