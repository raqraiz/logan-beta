// Generate cyclical meal plan resource: AI generation + branded PDF + storage upload.
// Returns immediately with the resource row so the frontend can poll/subscribe.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
} from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Style = "dark" | "light";

interface MealIdea {
  name: string;
  slot: string;          // breakfast | lunch | dinner | snack | anytime
  why: string;
  ingredients: string[];
}

interface PhaseGuide {
  name: string;            // Menstruation | Follicular | Ovulation | Luteal | Postpartum | Menopause
  cycle_days: string;      // e.g. "Days 1-5" or "" for non-cycling
  focus: string;
  recommended_foods: string[];
  avoid_foods: string[];
  meal_ideas: MealIdea[];
}

interface MealPlanData {
  intro: string;
  phases: PhaseGuide[];
}

// ---------- Cycle helpers (mirrors chat-ai logic) ----------
const PHASE_HEX = {
  Menstruation: { dark: [0.878, 0.322, 0.384], light: [0.878, 0.322, 0.384] },
  Follicular:   { dark: [0.239, 0.749, 0.541], light: [0.239, 0.749, 0.541] },
  Ovulation:    { dark: [0.910, 0.659, 0.188], light: [0.910, 0.659, 0.188] },
  Luteal:       { dark: [0.608, 0.427, 0.843], light: [0.608, 0.427, 0.843] },
} as const;

function phaseColor(phase: string, style: Style): [number, number, number] {
  const c = (PHASE_HEX as any)[phase]?.[style] ?? [0.082, 0.722, 0.549];
  return [c[0], c[1], c[2]];
}

function getPhaseForDay(cycleDay: number, cycleLengthDays: number): string {
  const ovDay = cycleLengthDays - 14;
  if (cycleDay <= 5) return "Menstruation";
  if (cycleDay < ovDay - 1) return "Follicular";
  if (cycleDay <= ovDay + 1) return "Ovulation";
  return "Luteal";
}

function getCycleDay(lastPeriodStart: string, cycleLengthDays: number): number {
  const start = new Date(lastPeriodStart + "T12:00:00Z");
  const now = new Date();
  const diff = Math.floor(
    (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  const day = (diff % cycleLengthDays) + 1;
  return day < 1 ? day + cycleLengthDays : day;
}

// ---------- Main handler ----------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const style: Style = body.style === "light" ? "light" : "dark";
    const dietaryPrefs = body.dietaryPrefs || {};

    // Optional revision context — when refining an existing plan
    const parentResourceId: string | null = typeof body.parentResourceId === "string" ? body.parentResourceId : null;
    const excludeIngredients: string[] = Array.isArray(body.excludeIngredients)
      ? body.excludeIngredients.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 30)
      : [];
    const feedbackText: string = typeof body.feedbackText === "string"
      ? body.feedbackText.slice(0, 500)
      : "";

    // Load parent plan for revision (ownership enforced by user-scoped client + RLS)
    let parentPlan: MealPlanData | null = null;
    let parentResource: any = null;
    if (parentResourceId) {
      const { data: pr } = await userClient
        .from("user_resources")
        .select("*")
        .eq("id", parentResourceId)
        .maybeSingle();
      if (pr && pr.user_id === user.id) {
        parentResource = pr;
        parentPlan = pr.metadata?.preview ?? null;
      }
    }

    // Permanently skip excluded ingredients going forward
    if (excludeIngredients.length) {
      dietaryPrefs.dislikes = Array.from(new Set([
        ...(dietaryPrefs.dislikes ?? []),
        ...excludeIngredients,
      ]));
    }

    // Save dietary prefs for re-use
    if (
      dietaryPrefs.diet_type ||
      (dietaryPrefs.allergies?.length ?? 0) > 0 ||
      (dietaryPrefs.dislikes?.length ?? 0) > 0 ||
      (dietaryPrefs.cuisines?.length ?? 0) > 0 ||
      (dietaryPrefs.includes?.length ?? 0) > 0
    ) {
      const includesNote = dietaryPrefs.includes?.length
        ? `includes: ${dietaryPrefs.includes.join(", ")}`
        : null;
      await supabase.from("user_dietary_prefs").upsert(
        {
          user_id: user.id,
          diet_type: dietaryPrefs.diet_type ?? null,
          allergies: dietaryPrefs.allergies ?? [],
          dislikes: dietaryPrefs.dislikes ?? [],
          cuisines: dietaryPrefs.cuisines ?? [],
          notes: includesNote,
        },
        { onConflict: "user_id" },
      );
    }

    // Pull participant for cycle context
    const { data: participant } = await supabase
      .from("participants")
      .select("*")
      .eq("email", user.email)
      .single();

    const cycleLengthDays = participant?.cycle_length_days || 28;
    const lastPeriodStart =
      participant?.last_period_start ||
      new Date().toISOString().split("T")[0];
    const startCycleDay = getCycleDay(lastPeriodStart, cycleLengthDays);
    const lifeStage = participant?.life_stage || "cycling";

    // Personalized title — phase-based guide
    const firstName = participant?.full_name?.split(" ")?.[0]?.trim() || null;
    const guideKind = lifeStage === "postpartum"
      ? "Postpartum Food Guide"
      : lifeStage === "menopause"
        ? "Menopause Food Guide"
        : "Cycle Food Guide";
    const possessive = firstName ? `${firstName}'${firstName.endsWith("s") ? "" : "s"} ` : "";
    const baseTitle = `${possessive}${guideKind}`;
    const title = parentResource ? `${baseTitle} (revised)` : baseTitle;

    // Insert resource row immediately (status: generating)
    const { data: resource, error: insertError } = await supabase
      .from("user_resources")
      .insert({
        user_id: user.id,
        type: "meal_plan",
        title,
        status: "generating",
        style,
        metadata: {
          start_cycle_day: startCycleDay,
          cycle_length_days: cycleLengthDays,
          life_stage: lifeStage,
          dietary_prefs: dietaryPrefs,
          ...(parentResource ? {
            parent_resource_id: parentResource.id,
            revision_excludes: excludeIngredients,
            revision_feedback: feedbackText,
          } : {}),
        },
      })
      .select()
      .single();

    if (insertError || !resource) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create resource" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Drop a chat message that anchors the ResourceCard inline in the chat.
    const chatBlurb = parentResource
      ? `Reworking your food guide with your tweaks — new version coming up.`
      : `Building your ${title.toLowerCase()} now — I'll drop it here when it's ready.`;
    await supabase.from("chat_messages").insert({
      user_id: user.id,
      role: "assistant",
      content: chatBlurb,
      message_type: "resource",
      metadata: {
        resource_id: resource.id,
        resource_type: "meal_plan",
      },
    });

    // Kick off generation in the background (don't block the response)
    const generationTask = generatePhaseGuide({
      supabase,
      lovableApiKey,
      userId: user.id,
      resourceId: resource.id,
      participant,
      style,
      dietaryPrefs,
      cycleLengthDays,
      lifeStage,
      title,
      parentPlan,
      excludeIngredients,
      feedbackText,
    });

    // @ts-ignore: Deno background task
    EdgeRuntime?.waitUntil?.(generationTask) ?? generationTask.catch(console.error);

    return new Response(JSON.stringify({ success: true, resource }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-meal-plan error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

