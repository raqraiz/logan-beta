import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

const POLICY_VERSION = "July 2026";

export const PolicyUpdateSender = () => {
  const [eligible, setEligible] = useState<number | null>(null);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [totalSent, setTotalSent] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: sess }, dryRun] = await Promise.all([
        supabase.auth.getSession(),
        supabase.functions.invoke("send-policy-update", { body: { dryRun: true } }),
      ]);
      if (dryRun.data && typeof dryRun.data.eligible === "number") {
        setEligible(dryRun.data.eligible);
      }
      const { data: rows } = await supabase
        .from("policy_notifications")
        .select("email_sent_at")
        .eq("policy_version", POLICY_VERSION)
        .order("email_sent_at", { ascending: false });
      setTotalSent(rows?.length ?? 0);
      setLastSentAt(rows?.[0]?.email_sent_at ?? null);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _ = sess;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSend = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-policy-update", {});
      if (error) throw error;
      toast({
        title: "Policy update email sent",
        description: `${data?.sent ?? 0} emails sent · ${data?.errors?.length ?? 0} errors`,
      });
      await load();
    } catch (e: any) {
      toast({
        title: "Failed to send",
        description: e.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const alreadyAllSent = eligible === 0 && totalSent > 0;

  return (
    <Card className="p-4 border-border">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex gap-3">
          <div className="mt-0.5 rounded-full p-2 bg-primary/10 text-primary">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Privacy policy update ({POLICY_VERSION})</h3>
            <p className="text-xs text-muted-foreground max-w-xl mt-1">
              One-time notification to all active users about the updated privacy
              policy. Each recipient is logged for a legal paper trail and will only
              receive this email once.
            </p>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span>
                Eligible now:{" "}
                <span className="font-semibold text-foreground">
                  {loading ? "…" : eligible ?? "—"}
                </span>
              </span>
              <span>
                Already sent:{" "}
                <span className="font-semibold text-foreground">{totalSent}</span>
              </span>
              {lastSentAt && (
                <span>
                  Last sent:{" "}
                  <span className="font-semibold text-foreground">
                    {format(new Date(lastSentAt), "MMM d, yyyy p")}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              disabled={loading || sending || !eligible || alreadyAllSent}
              className="whitespace-nowrap"
            >
              {sending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {alreadyAllSent
                ? `Sent ${lastSentAt ? format(new Date(lastSentAt), "MMM d, yyyy") : ""}`
                : "Send policy update email"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Send policy update email?</AlertDialogTitle>
              <AlertDialogDescription>
                This will send an email to {eligible ?? 0} users. Each recipient is
                logged and will not receive it again. Are you sure?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleSend}>
                Yes, send to {eligible ?? 0}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  );
};
