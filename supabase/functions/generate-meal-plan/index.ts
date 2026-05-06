// Generate phase-based food guide: AI generation, JSON-only (no PDF).
// Returns immediately with the resource row so the frontend can poll/subscribe.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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


// ---------- Background generation: phase-based food guide ----------
async function generatePhaseGuide(args: {
  supabase: any;
  lovableApiKey: string;
  userId: string;
  resourceId: string;
  participant: any;
  style: Style;
  dietaryPrefs: any;
  cycleLengthDays: number;
  lifeStage: string;
  title: string;
  parentPlan?: MealPlanData | null;
  excludeIngredients?: string[];
  feedbackText?: string;
}) {
  const {
    supabase, lovableApiKey, resourceId,
    dietaryPrefs, cycleLengthDays, lifeStage,
    parentPlan = null, excludeIngredients = [], feedbackText = "",
  } = args;

  try {
    const dietBits: string[] = [];
    if (dietaryPrefs.diet_type) dietBits.push(`Diet: ${dietaryPrefs.diet_type}`);
    if (dietaryPrefs.allergies?.length) dietBits.push(`Allergies: ${dietaryPrefs.allergies.join(", ")}`);
    if (dietaryPrefs.dislikes?.length) dietBits.push(`Dislikes (NEVER use): ${dietaryPrefs.dislikes.join(", ")}`);
    const focusList = (dietaryPrefs.focus_styles?.length ? dietaryPrefs.focus_styles : dietaryPrefs.cuisines) || [];
    if (focusList.length) dietBits.push(`Focus: ${focusList.join(", ")}`);
    if (dietaryPrefs.includes?.length) dietBits.push(`Foods to INCLUDE across meals: ${dietaryPrefs.includes.join(", ")}`);
    if (dietaryPrefs.macro_preset) dietBits.push(`Macro preset: ${dietaryPrefs.macro_preset.replace(/_/g, " ")}`);
    const mt = dietaryPrefs.macro_targets || {};
    const macroParts = [
      mt.calories ? `${mt.calories} kcal` : null,
      mt.protein ? `${mt.protein}g protein` : null,
      mt.carbs ? `${mt.carbs}g carbs` : null,
      mt.fat ? `${mt.fat}g fat` : null,
    ].filter(Boolean);
    if (macroParts.length) dietBits.push(`Daily targets: ${macroParts.join(", ")}.`);
    if (dietaryPrefs.free_form) dietBits.push(`User context: "${dietaryPrefs.free_form}"`);
    const dietContext = dietBits.length ? dietBits.join("\n") : "Omnivore, no restrictions";

    const isCycling = lifeStage === "cycling";

    const phaseList = isCycling
      ? [
          { name: "Menstruation", days: `Days 1–5` },
          { name: "Follicular", days: `Days 6–${cycleLengthDays - 15}` },
          { name: "Ovulation", days: `Days ${cycleLengthDays - 14}–${cycleLengthDays - 12}` },
          { name: "Luteal", days: `Days ${cycleLengthDays - 11}–${cycleLengthDays}` },
        ]
      : [{ name: lifeStage === "postpartum" ? "Postpartum" : "Menopause", days: "" }];

    const phaseGuidance = isCycling
      ? `Build a phase-by-phase food guide for a ${cycleLengthDays}-day cycle. Return EXACTLY 4 phases in this order: Menstruation, Follicular, Ovulation, Luteal.

Per phase:
- Menstruation: iron-rich (lentils, beef, dark leafy greens), warming, vitamin C for iron absorption, anti-inflammatory (ginger, turmeric, omega-3s).
- Follicular: light fresh foods, fermented (yogurt, kimchi), leafy greens, sprouted grains, seeds (flax, pumpkin).
- Ovulation: cruciferous vegetables, B vitamins, antioxidant berries, fiber.
- Luteal: complex carbs (sweet potato, quinoa, oats) for serotonin, magnesium-rich (dark chocolate, leafy greens), B6, calcium.`
      : lifeStage === "postpartum"
        ? `Build ONE phase named "Postpartum". Do NOT mention cycle phases, ovulation, luteal, follicular, or menstruation anywhere. Focus on: collagen-rich foods, iron, healthy fats for hormone production, blood-sugar-stabilizing meals, B-vitamins, omega-3s, easy one-handed meals (10-20 min). Do NOT assume breastfeeding.`
        : `Build ONE phase named "Menopause". Do NOT mention cycle phases anywhere. Focus on: phytoestrogens (flax, soy, sesame), bone health (calcium, vit D, magnesium), cardiovascular (high fiber, omega-3s, lean protein), blood-sugar stability, cognitive support (berries, fatty fish, nuts).`;

    const systemPrompt = `You are Logan — a knowledgeable, grounded friend who gives food guidance backed by hormonal nutrition science.

Your job: produce a SHORT, SCANNABLE phase-based food guide. NOT a full menu. NOT a calendar. Just smart food choices and meal ideas the user can pull from.

For EACH phase, return:
- focus: 1-2 sentence plain-English explanation of what the body needs nutritionally during this phase.
- recommended_foods: 8-14 specific food names (single ingredients or short phrases like "wild salmon", "pumpkin seeds", "dark leafy greens"). No quantities.
- avoid_foods: 0-5 foods to go easy on during this phase (optional, only when meaningful — e.g. heavy alcohol in luteal). Empty array if nothing.
- meal_ideas: 5-8 concrete meal ideas with name, slot ("breakfast" | "lunch" | "dinner" | "snack" | "anytime"), why (1 sentence why this meal helps THIS phase), and 4-7 ingredient names.

${phaseGuidance}

User dietary context:
${dietContext}

Tone: warm, grounded, no fluff, no emojis in any returned text fields. Be specific (e.g. "Sweet potato + black bean bowl" not "Bowl"). Meal names under 70 chars.

Write a 2-sentence intro that explains the guide's logic in Logan's voice.`;

    const revisionBlock: string[] = [];
    if (parentPlan?.phases?.length) {
      revisionBlock.push(`This is a REVISION. Keep what worked, change only what the user asked for.\nPrevious phases: ${parentPlan.phases.map(p => p.name).join(", ")}.`);
    }
    if (excludeIngredients.length) {
      revisionBlock.push(`HARD EXCLUSIONS — these must NOT appear anywhere: ${excludeIngredients.join(", ")}.`);
    }
    if (feedbackText.trim()) {
      revisionBlock.push(`USER FEEDBACK to address:\n"${feedbackText.trim()}"`);
    }

    const userPrompt = `Build the food guide. Phases to cover: ${phaseList.map(p => `${p.name}${p.days ? ` (${p.days})` : ""}`).join(", ")}.\n\n${revisionBlock.join("\n\n")}\n\nReturn structured JSON via the build_food_guide tool.`;

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "build_food_guide",
                description: "Return the structured phase-based food guide.",
                parameters: {
                  type: "object",
                  properties: {
                    intro: { type: "string" },
                    phases: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          cycle_days: { type: "string" },
                          focus: { type: "string" },
                          recommended_foods: { type: "array", items: { type: "string" } },
                          avoid_foods: { type: "array", items: { type: "string" } },
                          meal_ideas: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                name: { type: "string" },
                                slot: { type: "string" },
                                why: { type: "string" },
                                ingredients: { type: "array", items: { type: "string" } },
                              },
                              required: ["name", "slot", "why", "ingredients"],
                              additionalProperties: false,
                            },
                          },
                        },
                        required: ["name", "cycle_days", "focus", "recommended_foods", "avoid_foods", "meal_ideas"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["intro", "phases"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "build_food_guide" } },
        }),
      },
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI gateway ${aiResponse.status}: ${errText.slice(0, 200)}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return structured food guide");
    }

    const planData: MealPlanData = JSON.parse(toolCall.function.arguments);
    if (!planData.phases?.length) {
      throw new Error("AI returned no phases");
    }

    await supabase
      .from("user_resources")
      .update({
        status: "ready",
        pdf_path: null,
        metadata: {
          life_stage: lifeStage,
          cycle_length_days: cycleLengthDays,
          dietary_prefs: dietaryPrefs,
          intro: planData.intro,
          preview: {
            intro: planData.intro,
            phases: planData.phases,
          },
        },
      })
      .eq("id", resourceId);

    console.log(`Food guide ${resourceId} ready`);
  } catch (err) {
    console.error("Generation failed:", err);
    await supabase
      .from("user_resources")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
      })
      .eq("id", resourceId);
  }
}
