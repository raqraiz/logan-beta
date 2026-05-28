// Generate phase-aware meal ideas or anchor meals + flexible swaps.
// Lightweight: no PDF, no hero images, gemini-2.5-flash-lite.
// Always tailored to the user's current cycle phase / life stage at generation time.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Mode = "ideas" | "mix";

interface RecommendedCategory {
  category: string;
  foods: string[];
}
interface MealIdea {
  name: string;
  why: string;
}
interface AnchorMeal {
  slot: "breakfast" | "lunch" | "dinner";
  name: string;
  why: string;
  ingredients: string[];
}
interface FlexibleSwap {
  name: string;
  why: string;
}

interface PreviewData {
  mode: Mode;
  intro: string;
  phase: string;
  cycle_day?: number | null;
  life_stage: string;
  recommended_foods?: RecommendedCategory[];
  meal_ideas?: MealIdea[];
  anchor_meals?: AnchorMeal[];
  flexible_swaps?: FlexibleSwap[];
}

// ---------- Cycle helpers ----------
function getPhaseForDay(cycleDay: number, cycleLengthDays: number): string {
  const ovDay = cycleLengthDays - 14;
  const ovStart = ovDay - 1;
  const ovEnd = ovDay + 2;
  if (cycleDay <= 5) return "Menstruation";
  if (cycleDay < ovStart) return "Follicular";
  if (cycleDay <= ovEnd) return "Ovulation";
  return "Luteal";
}

function getCycleDay(lastPeriodStart: string, cycleLengthDays: number, timezone = "UTC"): number {
  let start: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(lastPeriodStart)) {
    const [year, month, day] = lastPeriodStart.split("-").map(Number);
    start = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  } else {
    start = new Date(lastPeriodStart);
  }

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const today = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0));
  const diff = Math.round((today.getTime() - start.getTime()) / 86400000);
  if (diff >= 0) return diff + 1;
  return (((diff % cycleLengthDays) + cycleLengthDays) % cycleLengthDays) + 1;
}

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
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const mode: Mode = body.mode === "mix" ? "mix" : "ideas";
    const dietaryPrefs = body.dietaryPrefs || {};
    const cycleContext = body.cycleContext && typeof body.cycleContext === "object" ? body.cycleContext : null;

    // Refinement context
    const parentResourceId: string | null = typeof body.parentResourceId === "string" ? body.parentResourceId : null;
    const excludeIngredients: string[] = Array.isArray(body.excludeIngredients)
      ? body.excludeIngredients.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 30)
      : [];
    const feedbackText: string = typeof body.feedbackText === "string" ? body.feedbackText.slice(0, 500) : "";

    if (excludeIngredients.length) {
      dietaryPrefs.dislikes = Array.from(new Set([
        ...(dietaryPrefs.dislikes ?? []),
        ...excludeIngredients,
      ]));
    }

    // Persist dietary prefs for re-use
    if (
      dietaryPrefs.diet_type ||
      (dietaryPrefs.allergies?.length ?? 0) > 0 ||
      (dietaryPrefs.dislikes?.length ?? 0) > 0 ||
      (dietaryPrefs.cuisines?.length ?? 0) > 0 ||
      (dietaryPrefs.includes?.length ?? 0) > 0
    ) {
      const includesNote = dietaryPrefs.includes?.length
        ? `includes: ${dietaryPrefs.includes.join(", ")}` : null;
      await supabase.from("user_dietary_prefs").upsert({
        user_id: user.id,
        diet_type: dietaryPrefs.diet_type ?? null,
        allergies: dietaryPrefs.allergies ?? [],
        dislikes: dietaryPrefs.dislikes ?? [],
        cuisines: dietaryPrefs.cuisines ?? [],
        notes: includesNote,
      }, { onConflict: "user_id" });
    }

    // Pull participant for current cycle/life-stage context (live, not stored)
    const { data: participant } = await supabase
      .from("participants")
      .select("*")
      .eq("email", user.email)
      .single();

    const contextCycleDay = Number(cycleContext?.cycleDay);
    const contextCycleLength = Number(cycleContext?.cycleLengthDays);
    const contextPhase = typeof cycleContext?.phase === "string" ? cycleContext.phase : null;
    const contextLastPeriodStart = typeof cycleContext?.lastPeriodStart === "string" ? cycleContext.lastPeriodStart : null;
    const contextTimezone = typeof cycleContext?.timezone === "string" ? cycleContext.timezone : null;
    const cycleLengthDays = Number.isFinite(contextCycleLength) && contextCycleLength > 0
      ? contextCycleLength
      : participant?.cycle_length_days || 28;
    const lastPeriodStart = contextLastPeriodStart || participant?.last_period_start || new Date().toISOString().split("T")[0];
    const cycleDay = Number.isFinite(contextCycleDay) && contextCycleDay >= 1 && contextCycleDay <= 60
      ? contextCycleDay
      : getCycleDay(lastPeriodStart, cycleLengthDays, contextTimezone || participant?.timezone || "UTC");
    const lifeStage = participant?.life_stage || "cycling";

    let ppWindow: string | null = null;
    if (lifeStage === "postpartum" && participant?.postpartum_start_date) {
      const days = Math.floor((Date.now() - new Date(participant.postpartum_start_date + "T12:00:00Z").getTime()) / 86400000);
      if (days < 14) ppWindow = "Acute recovery (0-2 weeks)";
      else if (days < 42) ppWindow = "Early recovery (2-6 weeks)";
      else if (days < 84) ppWindow = "Tissue closing (6-12 weeks)";
      else if (days < 180) ppWindow = "Rebuilding (3-6 months)";
      else if (days < 365) ppWindow = "Reclaiming capacity (6-12 months)";
      else ppWindow = "Extended postpartum (12+ months)";
    }

    const phase = lifeStage === "cycling"
      ? (contextPhase || getPhaseForDay(cycleDay, cycleLengthDays))
      : lifeStage === "postpartum"
        ? (ppWindow ? `Postpartum · ${ppWindow}` : "Postpartum")
        : lifeStage === "menopause" ? "Menopause" : "Cyclical";

    const firstName = participant?.full_name?.split(" ")?.[0]?.trim() || null;
    const possessive = firstName ? `${firstName}'${firstName.endsWith("s") ? "" : "s"} ` : "";
    const modeLabel = mode === "ideas" ? "Ideas" : "Mix";
    const phaseLabel = lifeStage === "cycling" ? `${phase} · Day ${cycleDay}` : phase;
    const baseTitle = `${possessive}${phaseLabel} ${modeLabel}`;
    const title = parentResourceId ? `${baseTitle} (revised)` : baseTitle;

    // Insert resource row
    const { data: resource, error: insertError } = await supabase
      .from("user_resources")
      .insert({
        user_id: user.id,
        type: "meal_plan",
        title,
        status: "generating",
        style: "dark",
        metadata: {
          mode,
          phase,
          cycle_day: lifeStage === "cycling" ? cycleDay : null,
          life_stage: lifeStage,
          dietary_prefs: dietaryPrefs,
          ...(parentResourceId ? { parent_resource_id: parentResourceId } : {}),
        },
      })
      .select()
      .single();

    if (insertError || !resource) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create resource" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Anchor in chat
    const chatBlurb = parentResourceId
      ? `Reworking your menu with your tweaks — give me a few seconds.`
      : `Putting together your ${title.toLowerCase()} — back in a few seconds.`;
    await supabase.from("chat_messages").insert({
      user_id: user.id,
      role: "assistant",
      content: chatBlurb,
      message_type: "resource",
      metadata: { resource_id: resource.id, resource_type: "meal_plan" },
    });

    // Background generation
    const task = generatePreview({
      supabase, lovableApiKey, resourceId: resource.id,
      mode, dietaryPrefs, phase, cycleDay, lifeStage, ppWindow, feedbackText, excludeIngredients,
    });
    // @ts-ignore
    EdgeRuntime?.waitUntil?.(task) ?? task.catch(console.error);

    return new Response(JSON.stringify({ success: true, resource }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-meal-plan error:", error);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ---------- Background generation ----------
async function generatePreview(args: {
  supabase: any;
  lovableApiKey: string;
  resourceId: string;
  mode: Mode;
  dietaryPrefs: any;
  phase: string;
  cycleDay: number;
  lifeStage: string;
  ppWindow: string | null;
  feedbackText: string;
  excludeIngredients: string[];
}) {
  const {
    supabase, lovableApiKey, resourceId, mode, dietaryPrefs,
    phase, cycleDay, lifeStage, ppWindow, feedbackText, excludeIngredients,
  } = args;

  try {
    const dietBits: string[] = [];
    if (dietaryPrefs.diet_type) dietBits.push(`Diet: ${dietaryPrefs.diet_type}`);
    if (dietaryPrefs.allergies?.length) dietBits.push(`Allergies (NEVER use): ${dietaryPrefs.allergies.join(", ")}`);
    if (dietaryPrefs.dislikes?.length) dietBits.push(`Dislikes (NEVER use): ${dietaryPrefs.dislikes.join(", ")}`);
    const focusList = (dietaryPrefs.focus_styles?.length ? dietaryPrefs.focus_styles : dietaryPrefs.cuisines) || [];
    if (focusList.length) dietBits.push(`Focus styles: ${focusList.join(", ")}`);
    if (dietaryPrefs.includes?.length) dietBits.push(`Foods to include where natural: ${dietaryPrefs.includes.join(", ")}`);
    if (dietaryPrefs.macro_preset) dietBits.push(`Macro preset: ${String(dietaryPrefs.macro_preset).replace(/_/g, " ")}`);
    if (dietaryPrefs.free_form) dietBits.push(`Extra context: "${dietaryPrefs.free_form}"`);
    const dietContext = dietBits.length ? dietBits.join("\n") : "Omnivore, no restrictions.";

    const isCycling = lifeStage === "cycling";
    const phaseHeader = isCycling
      ? `User is on cycle day ${cycleDay} — ${phase} phase.`
      : lifeStage === "postpartum"
        ? `User is postpartum${ppWindow ? ` — ${ppWindow}` : ""}. Do NOT reference cycle phases.`
        : lifeStage === "menopause"
          ? `User is in menopause — no regular cycle. Do NOT reference cycle phases, ovulation, luteal, follicular, or menstruation.`
          : `User stage: ${lifeStage}.`;

    const phasePrinciples = isCycling ? ({
      Menstruation: "Iron-rich (lentils, beef, dark leafy greens), warming foods, vitamin C to aid iron absorption, anti-inflammatory (ginger, turmeric, omega-3).",
      Follicular: "Light fresh foods, fermented foods for estrogen metabolism, leafy greens, sprouted grains, seeds (flax, pumpkin).",
      Ovulation: "Cruciferous vegetables for healthy estrogen clearance, B vitamins, antioxidant-rich berries, fiber.",
      Luteal: "Complex carbs (sweet potato, quinoa, oats) for serotonin, magnesium-rich foods (dark chocolate, leafy greens, sunflower/sesame), B6, calcium.",
    } as Record<string, string>)[phase] || ""
      : lifeStage === "postpartum"
        ? "Protein + healthy fat at every meal, iron + vitamin C together, warm/easy-to-digest foods, aggressive hydration. Do not assume breastfeeding."
        : lifeStage === "menopause"
          ? "Phytoestrogens (flax, soy, sesame), bone support (calcium, vit D, magnesium, K2), high fiber, omega-3, lean protein at every meal, anti-inflammatory spices."
          : "Whole foods, balanced macros, anti-inflammatory.";

    const modeInstruction = mode === "ideas"
      ? `Return TWO things:
1. recommended_foods — exactly 3 categories (e.g. "Power foods", "Hydration & teas", "Easy snacks") tuned to the user's CURRENT phase/stage. 5-8 specific food names per category.
2. meal_ideas — 8 untimed meal ideas (no breakfast/lunch/dinner labels). Each: name (under 60 chars) + why (1 sentence on the hormonal/stage benefit).`
      : `Return TWO things:
1. anchor_meals — 3 structured meals for TODAY (breakfast, lunch, dinner). Each: name (under 60 chars) + why (1 sentence) + 4-8 ingredient names (no quantities).
2. flexible_swaps — 6 lighter "if you don't feel like cooking" alternatives. Each: name (under 50 chars) + why (1 sentence).`;

    const refinementBlock: string[] = [];
    if (excludeIngredients.length) {
      refinementBlock.push(`HARD EXCLUSIONS — these ingredients must NOT appear anywhere: ${excludeIngredients.join(", ")}.`);
    }
    if (feedbackText.trim()) {
      refinementBlock.push(`USER FEEDBACK to address:\n"${feedbackText.trim()}"`);
    }

    const systemPrompt = `You are Logan — a knowledgeable, grounded friend who gives food guidance backed by hormonal nutrition science. Warm, casual, no fluff, no emojis, no medical jargon.

${phaseHeader}

Phase/stage nutrition focus:
${phasePrinciples}

User dietary context:
${dietContext}

${modeInstruction}

Always be specific (e.g. "Smoked salmon avocado toast on rye" not "Toast"). Tailor every suggestion to the phase/stage above — this is NOT a generic template.`;

    const userPrompt = `Generate the ${mode === "ideas" ? "ideas pack" : "mix pack"} for today.

${refinementBlock.join("\n\n")}

Also write a 1-2 sentence intro in Logan's voice that names the user's current phase/stage and what these picks are designed to do.

Return structured JSON via the build_menu tool.`;

    const toolParameters = mode === "ideas"
      ? {
          type: "object",
          properties: {
            intro: { type: "string" },
            recommended_foods: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string" },
                  foods: { type: "array", items: { type: "string" } },
                },
                required: ["category", "foods"],
                additionalProperties: false,
              },
            },
            meal_ideas: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  why: { type: "string" },
                },
                required: ["name", "why"],
                additionalProperties: false,
              },
            },
          },
          required: ["intro", "recommended_foods", "meal_ideas"],
          additionalProperties: false,
        }
      : {
          type: "object",
          properties: {
            intro: { type: "string" },
            anchor_meals: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  slot: { type: "string", enum: ["breakfast", "lunch", "dinner"] },
                  name: { type: "string" },
                  why: { type: "string" },
                  ingredients: { type: "array", items: { type: "string" } },
                },
                required: ["slot", "name", "why", "ingredients"],
                additionalProperties: false,
              },
            },
            flexible_swaps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  why: { type: "string" },
                },
                required: ["name", "why"],
                additionalProperties: false,
              },
            },
          },
          required: ["intro", "anchor_meals", "flexible_swaps"],
          additionalProperties: false,
        };

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "build_menu",
            description: "Return the structured menu pack.",
            parameters: toolParameters,
          },
        }],
        tool_choice: { type: "function", function: { name: "build_menu" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI gateway ${aiResponse.status}: ${errText.slice(0, 200)}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("AI did not return structured menu");

    const planData = JSON.parse(toolCall.function.arguments);

    const preview: PreviewData = {
      mode,
      intro: planData.intro,
      phase,
      cycle_day: lifeStage === "cycling" ? cycleDay : null,
      life_stage: lifeStage,
      ...(mode === "ideas"
        ? {
            recommended_foods: planData.recommended_foods ?? [],
            meal_ideas: planData.meal_ideas ?? [],
          }
        : {
            anchor_meals: planData.anchor_meals ?? [],
            flexible_swaps: planData.flexible_swaps ?? [],
          }),
    };

    await supabase
      .from("user_resources")
      .update({
        status: "ready",
        metadata: {
          mode,
          phase,
          cycle_day: lifeStage === "cycling" ? cycleDay : null,
          life_stage: lifeStage,
          dietary_prefs: dietaryPrefs,
          intro: preview.intro,
          preview,
        },
      })
      .eq("id", resourceId);

    console.log(`Menu ${resourceId} ready (mode=${mode})`);
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
