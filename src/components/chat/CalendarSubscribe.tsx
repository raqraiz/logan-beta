import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Calendar, Copy, Check, ExternalLink, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
  const [showMobile, setShowMobile] = useState(false);

  const fetchOrCreateToken = async () => {
    if (!user) return;
    setLoading(true);
    try {
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
    const webcal = webcalUrl.replace("https://", "webcal://");
    window.open(webcal, "_blank");
  };

  const webcalLink = webcalUrl?.replace("https://", "webcal://") ?? "";

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
            {!showMobile ? (
              <>
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

                <Button
                  variant="ghost"
                  className="w-full gap-2 text-muted-foreground"
                  onClick={() => setShowMobile(true)}
                >
                  <Smartphone className="h-4 w-4" />
                  Add to phone calendar instead
                </Button>

                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium">Desktop instructions:</p>
                  <p><strong>Google Calendar:</strong> Left sidebar → "+" next to "Other calendars" → From URL → paste the link</p>
                  <p><strong>Apple Calendar:</strong> File → New Calendar Subscription → paste the link</p>
                  <p><strong>Outlook:</strong> Add calendar → Subscribe from web → paste the link</p>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-muted-foreground text-center">
                    Scan this QR code with your phone camera to subscribe:
                  </p>
                  <div className="bg-white p-3 rounded-lg">
                    <QRCodeSVG value={webcalLink} size={180} />
                  </div>
                </div>

                <div className="text-xs text-muted-foreground space-y-2">
                  <p className="font-medium">📱 Phone instructions:</p>
                  <p><strong>iPhone:</strong> Scan the QR code → it will open a "Subscribe to calendar?" prompt → tap Subscribe.</p>
                  <p><strong>Android:</strong> Copy the link below, open Google Calendar app → ☰ → Settings → Add account is not supported. Instead, go to <strong>calendar.google.com</strong> in Chrome → ☰ → "Other calendars" (+) → From URL → paste.</p>
                </div>

                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Subscription URL</p>
                  <p className="text-xs font-mono break-all text-foreground/80">{webcalUrl}</p>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={copyUrl} className="flex-1 gap-2">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy URL"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setShowMobile(false)}
                    className="text-muted-foreground"
                  >
                    Back
                  </Button>
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground text-center">
              ⚠️ Don't open this link in a browser — paste it inside your calendar app. It auto-refreshes every ~6 hours.
            </p>
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
