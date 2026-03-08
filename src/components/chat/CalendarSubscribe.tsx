import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Calendar, Copy, Check, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";

export const CalendarSubscribe = () => {
  const { user } = useAuth();
  const [webcalUrl, setWebcalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchOrCreateToken = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Check for existing token
      const { data: existing } = await supabase
        .from("calendar_tokens")
        .select("token")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (existing?.token) {
        buildUrl(existing.token);
        return;
      }

      // Create new token
      const { data: created, error } = await supabase
        .from("calendar_tokens")
        .insert({ user_id: user.id })
        .select("token")
        .single();

      if (error) throw error;
      if (created?.token) buildUrl(created.token);
    } catch (err) {
      console.error("Calendar token error:", err);
      toast({
        title: "Error",
        description: "Could not generate calendar link. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const buildUrl = (token: string) => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectId}.supabase.co/functions/v1/calendar-feed?token=${token}`;
    setWebcalUrl(url);
  };

  const copyUrl = async () => {
    if (!webcalUrl) return;
    await navigator.clipboard.writeText(webcalUrl);
    setCopied(true);
    toast({ title: "Copied!", description: "Paste this URL into your calendar app." });
    setTimeout(() => setCopied(false), 2000);
  };

  const openWebcal = () => {
    if (!webcalUrl) return;
    // Replace https with webcal for native calendar app opening
    const webcal = webcalUrl.replace("https://", "webcal://");
    window.open(webcal, "_blank");
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          title="Sync to Calendar"
          onClick={fetchOrCreateToken}
        >
          <Calendar className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Sync Cycle Phases to Calendar
          </DialogTitle>
          <DialogDescription>
            Subscribe to see your cycle phases automatically update in your calendar app.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : webcalUrl ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1 font-medium">Your subscription URL</p>
              <p className="text-xs font-mono break-all text-foreground/80">{webcalUrl}</p>
            </div>

            <div className="flex gap-2">
              <Button onClick={openWebcal} className="flex-1 gap-2">
                <ExternalLink className="h-4 w-4" />
                Open in Calendar
              </Button>
              <Button variant="outline" onClick={copyUrl} className="gap-2">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Google Calendar:</strong> Settings → Add calendar → From URL → paste the link</p>
              <p><strong>Apple Calendar:</strong> File → New Calendar Subscription → paste the link</p>
              <p>Your calendar will auto-refresh every ~6 hours with updated cycle data.</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-sm text-muted-foreground">
            Generating your calendar link...
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
