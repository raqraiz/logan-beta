import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Download, FileText, Loader2, AlertCircle, RefreshCw, Eye } from "lucide-react";
import { MealPlanSetupDialog } from "./MealPlanSetupDialog";
import { MealPlanPreviewDialog } from "./MealPlanPreviewDialog";
import { cn } from "@/lib/utils";

/**
 * Card shown in chat when Logan offers a meal plan resource.
 * Tapping "Build it" opens the setup dialog.
 */
export function ResourceOfferCard({ userId, resourceType }: { userId: string; resourceType: string }) {
  const [open, setOpen] = useState(false);
  if (resourceType !== "meal_plan") return null;

  return (
    <>
      <div className="mt-3 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card/40 to-card/40 p-4 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-primary/80">
              Free during alpha
            </span>
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">Cyclical meal plan</h3>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Each meal aligned to your phase. Includes a grocery list. Downloadable PDF.
          </p>
          <Button onClick={() => setOpen(true)} variant="premium" size="sm" className="w-full">
            <Sparkles className="h-3.5 w-3.5" /> Build it
          </Button>
        </div>
      </div>
      <MealPlanSetupDialog open={open} onOpenChange={setOpen} userId={userId} />
    </>
  );
}

/**
 * Card showing a generated (or generating) resource. Subscribes to the row
 * via realtime so status flips automatically when the edge function finishes.
 */
export function ResourceCard({ resourceId, userId }: { resourceId: string; userId: string }) {
  const [resource, setResource] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("user_resources")
      .select("*")
      .eq("id", resourceId)
      .maybeSingle()
      .then(({ data }) => { if (active) setResource(data); });

    const channel = supabase
      .channel(`resource_${resourceId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "user_resources",
        filter: `id=eq.${resourceId}`,
      }, (payload) => { if (active) setResource(payload.new); })
      .subscribe();

    // Poll fallback every 4s while generating, in case realtime misses the update
    const interval = setInterval(async () => {
      if (!active) return;
      const { data } = await supabase
        .from("user_resources")
        .select("*")
        .eq("id", resourceId)
        .maybeSingle();
      if (data && active) setResource(data);
      if (data?.status !== "generating") clearInterval(interval);
    }, 4000);

    return () => {
      active = false;
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [resourceId]);

  const handleDownload = async () => {
    if (!resource?.pdf_path) return;
    setDownloading(true);
    try {
      const { data, error } = await supabase.storage
        .from("resources")
        .createSignedUrl(resource.pdf_path, 60 * 5);
      if (error || !data?.signedUrl) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  if (!resource) {
    return (
      <div className="mt-3 rounded-2xl border border-border/40 bg-card/40 p-4 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading resource…</span>
      </div>
    );
  }

  const isGenerating = resource.status === "generating";
  const isReady = resource.status === "ready";
  const isFailed = resource.status === "failed";

  return (
    <div className={cn(
      "mt-3 rounded-2xl border p-4 backdrop-blur-sm relative overflow-hidden",
      isReady ? "border-primary/40 bg-gradient-to-br from-primary/10 via-card/50 to-card/40" :
      isFailed ? "border-destructive/40 bg-destructive/5" :
      "border-border/40 bg-card/40",
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "shrink-0 w-12 h-14 rounded-md flex items-center justify-center",
          isReady ? "bg-primary/15" : "bg-muted/40",
        )}>
          <FileText className={cn("h-5 w-5", isReady ? "text-primary" : "text-muted-foreground")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
              Meal plan · {resource.style === "light" ? "Light" : "Dark"} PDF
            </span>
          </div>
          <h3 className="text-sm font-semibold text-foreground leading-tight">{resource.title}</h3>

          {isGenerating && (
            <div className="mt-2 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">
                Building your plan… this takes ~10–60 seconds.
              </span>
            </div>
          )}

          {isReady && (
            <Button
              onClick={handleDownload}
              disabled={downloading}
              variant="premium"
              size="sm"
              className="mt-3"
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download PDF
            </Button>
          )}

          {isFailed && (
            <div className="mt-2">
              <div className="flex items-start gap-1.5 text-xs text-destructive mb-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Couldn't build the plan. {resource.error_message ? `(${resource.error_message.slice(0, 60)})` : ""}</span>
              </div>
              <Button
                onClick={async () => {
                  await supabase.from("user_resources").delete().eq("id", resourceId);
                }}
                variant="outline"
                size="sm"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
