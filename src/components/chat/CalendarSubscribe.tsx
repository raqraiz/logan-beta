import { useState, useMemo } from "react";
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

function detectPlatform() {
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid || /Mobile/i.test(ua);
  return { isIOS, isAndroid, isMobile };
}

export const CalendarSubscribe = () => {
  const { user } = useAuth();
  const [webcalUrl, setWebcalUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const platform = useMemo(() => detectPlatform(), []);

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
    window.location.href = webcal;
  };

  const openGoogleCalendarSubscribe = () => {
    if (!webcalUrl) return;
    const encoded = encodeURIComponent(webcalUrl);
    window.open(`https://calendar.google.com/calendar/r/settings/addbyurl?url=${encoded}`, "_blank");
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
            {/* === MOBILE: iPhone === */}
            {platform.isMobile && platform.isIOS && (
              <>
                <Button onClick={openWebcal} className="w-full gap-2">
                  <Calendar className="h-4 w-4" />
                  Subscribe in Apple Calendar
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Tap the button above. You'll see a "Subscribe to calendar?" prompt — tap Subscribe.
                  Your cycle phases will appear automatically and refresh every 6 hours.
                </p>
              </>
            )}

            {/* === MOBILE: Android === */}
            {platform.isMobile && platform.isAndroid && (
              <>
                <Button onClick={openGoogleCalendarSubscribe} className="w-full gap-2">
                  <Calendar className="h-4 w-4" />
                  Add to Google Calendar
                </Button>

                <div className="text-xs text-muted-foreground space-y-2">
                  <p className="font-medium">If the button above doesn't work:</p>
                  <ol className="list-decimal ml-4 space-y-1">
                    <li>Copy the link below</li>
                    <li>Open <strong>calendar.google.com</strong> in Chrome (not the app)</li>
                    <li>Tap ☰ → "Other calendars" → <strong>From URL</strong></li>
                    <li>Paste the link and tap "Add calendar"</li>
                  </ol>
                </div>

                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Subscription URL</p>
                  <p className="text-xs font-mono break-all text-foreground/80">{webcalUrl}</p>
                </div>

                <Button variant="outline" onClick={copyUrl} className="w-full gap-2">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy URL"}
                </Button>
              </>
            )}

            {/* === MOBILE: other/unknown === */}
            {platform.isMobile && !platform.isIOS && !platform.isAndroid && (
              <>
                <Button onClick={openWebcal} className="w-full gap-2">
                  <Calendar className="h-4 w-4" />
                  Open in Calendar
                </Button>
                <Button variant="outline" onClick={copyUrl} className="w-full gap-2">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy URL"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  If the button doesn't work, copy the URL and paste it into your calendar app's "subscribe by URL" option.
                </p>
              </>
            )}

            {/* === DESKTOP === */}
            {!platform.isMobile && (
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

                {/* QR code for scanning from phone */}
                <div className="flex flex-col items-center gap-3 pt-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Smartphone className="h-4 w-4" />
                    <span>Or scan with your phone:</span>
                  </div>
                  <div className="bg-white p-3 rounded-lg">
                    <QRCodeSVG value={webcalLink} size={160} />
                  </div>
                  <p className="text-xs text-muted-foreground text-center max-w-[280px]">
                    <strong>iPhone:</strong> Scan → tap Subscribe.
                    <br />
                    <strong>Android:</strong> Scan → copy link → open calendar.google.com → Other calendars → From URL.
                  </p>
                </div>

                <div className="text-xs text-muted-foreground space-y-1 pt-1">
                  <p className="font-medium">Desktop apps:</p>
                  <p><strong>Google Calendar:</strong> "+" next to "Other calendars" → From URL → paste</p>
                  <p><strong>Apple Calendar:</strong> File → New Calendar Subscription → paste</p>
                  <p><strong>Outlook:</strong> Add calendar → Subscribe from web → paste</p>
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground text-center">
              Your phases auto-refresh every ~6 hours. Don't open the link in a browser — use a calendar app.
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
