import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, FileText, Loader2, AlertCircle, RefreshCw, Eye } from "lucide-react";
import { MealPlanSetupDialog } from "./MealPlanSetupDialog";
import { MealPlanPreviewDialog } from "./MealPlanPreviewDialog";
import { cn } from "@/lib/utils";

type ResourceMetadata = {
  preview?: {
    mode?: "ideas" | "mix";
    intro?: string;
    phase?: string;
    cycle_day?: number | null;
    life_stage?: string;
    [key: string]: unknown;
  } | null;
  mode?: "ideas" | "mix";
  dietary_prefs?: Record<string, unknown>;
};

type MealPlanResource = {
  id: string;
  title: string | null;
  status: string | null;
  pdf_path: string | null;
  style: string | null;
  metadata: ResourceMetadata | null;
  error_message: string | null;
};

const asMealPlanResource = (value: unknown) => value as MealPlanResource;

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
            Each meal aligned to your phase. Includes a grocery list and preview.
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
  const [resource, setResource] = useState<MealPlanResource | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [reaction, setReaction] = useState<"up" | "down" | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("user_resources")
      .select("*")
      .eq("id", resourceId)
      .maybeSingle()
      .then(({ data }) => { if (active && data) setResource(asMealPlanResource(data)); });

    // Load this user's last reaction for this resource (if any)
    supabase
      .from("resource_feedback")
      .select("reaction")
      .eq("resource_id", resourceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (active && data?.reaction) setReaction(data.reaction as "up" | "down"); });

    const channel = supabase
      .channel(`resource_${resourceId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "user_resources",
        filter: `id=eq.${resourceId}`,
      }, (payload) => { if (active) setResource(asMealPlanResource(payload.new)); })
      .subscribe();

    // Poll fallback every 4s while generating, in case realtime misses the update
    const interval = setInterval(async () => {
      if (!active) return;
      const { data } = await supabase
        .from("user_resources")
        .select("*")
        .eq("id", resourceId)
        .maybeSingle();
      if (data && active) setResource(asMealPlanResource(data));
      if (data?.status !== "generating") clearInterval(interval);
    }, 4000);

    return () => {
      active = false;
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [resourceId]);

  const handlePreview = () => {
    setPreviewOpen(true);
  };

  const handleReact = async (next: "up" | "down") => {
    setReaction(next);
    try {
      await supabase.from("resource_feedback").insert({
        user_id: userId,
        resource_id: resourceId,
        reaction: next,
      });
    } catch (err) {
      console.error("Reaction failed:", err);
    }
  };

  const handleRefine = async ({
    excludeIngredients,
    feedbackText,
  }: { excludeIngredients: string[]; feedbackText: string }) => {
    if (!resource) return;
    setRefining(true);
    try {
      await supabase.from("resource_feedback").insert({
        user_id: userId,
        resource_id: resourceId,
        reaction: reaction ?? "down",
        comment: feedbackText || null,
        excluded_ingredients: excludeIngredients,
      });

      await supabase.functions.invoke("generate-meal-plan", {
        body: {
          parentResourceId: resourceId,
          mode: resource.metadata?.mode ?? resource.metadata?.preview?.mode ?? "ideas",
          excludeIngredients,
          feedbackText,
          dietaryPrefs: resource.metadata?.dietary_prefs ?? {},
        },
      });
    } catch (err) {
      console.error("Refine failed:", err);
    } finally {
      setRefining(false);
    }
  };

  const handleSwapSuggest = async ({
    dayNumber, slot, unavailable, note,
  }: { dayNumber: number; slot: "breakfast" | "lunch" | "dinner" | "snack"; unavailable: string[]; note: string }) => {
    const { data, error } = await supabase.functions.invoke("swap-meal", {
      body: {
        resourceId,
        dayNumber,
        slot,
        unavailableIngredients: unavailable,
        note,
      },
    });
    if (error) {
      console.error("swap-meal suggest error:", error);
      return [];
    }
    return (data?.options ?? []) as Array<{ name: string; ingredients: string[]; recipe: string }>;
  };

  const handleSwapApply = async ({
    dayNumber, slot, option,
  }: { dayNumber: number; slot: "breakfast" | "lunch" | "dinner" | "snack"; option: { name: string; ingredients: string[]; recipe: string } }) => {
    const { data, error } = await supabase.functions.invoke("swap-meal", {
      body: {
        resourceId,
        dayNumber,
        slot,
        apply: true,
        chosenOption: option,
      },
    });
    if (error) {
      console.error("swap-meal apply error:", error);
      throw error;
    }
    // Optimistically update local state with the returned preview
    if (data?.preview) {
      setResource(prev => prev ? {
        ...prev,
        metadata: { ...(prev.metadata ?? {}), preview: data.preview },
      } : prev);
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
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={handlePreview}
                variant="premium"
                size="sm"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview plan
              </Button>
            </div>
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
      <MealPlanPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={resource.title}
        preview={resource.metadata?.preview ?? null}
        previewUrl={previewUrl}
        previewLoading={previewLoading}
        onReact={handleReact}
        onRefine={handleRefine}
        onSwapSuggest={handleSwapSuggest}
        onSwapApply={handleSwapApply}
        onEditPlan={() => setEditOpen(true)}
        refining={refining}
        initialReaction={reaction}
      />
      <MealPlanSetupDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        userId={userId}
        editMode
        initialValues={{
          mode: resource.metadata?.mode ?? resource.metadata?.preview?.mode ?? "ideas",
          dietaryPrefs: (resource.metadata?.dietary_prefs ?? null) as any,
        }}
      />
    </div>
  );
}
