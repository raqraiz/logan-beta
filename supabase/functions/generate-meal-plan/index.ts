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
    const lengthDays: LengthDays = [1, 3, 7].includes(body.lengthDays)
      ? body.lengthDays
      : 7;
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
    let revisionLengthDays: LengthDays | null = null;
    if (parentResourceId) {
      const { data: pr } = await userClient
        .from("user_resources")
        .select("*")
        .eq("id", parentResourceId)
        .maybeSingle();
      if (pr && pr.user_id === user.id) {
        parentResource = pr;
        parentPlan = pr.metadata?.preview ?? null;
        if ([1, 3, 7].includes(pr.metadata?.length_days)) {
          revisionLengthDays = pr.metadata.length_days as LengthDays;
        }
      }
    }
    // When revising, inherit length from the parent so the structure matches
    const effectiveLengthDays: LengthDays = revisionLengthDays ?? lengthDays;

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

    // Personalized title — e.g. "Raquella's 3-Day Luteal Menu"
    const firstName = participant?.full_name?.split(" ")?.[0]?.trim() || null;
    const startingPhase = lifeStage === "cycling"
      ? getPhaseForDay(startCycleDay, cycleLengthDays)
      : (lifeStage === "postpartum" ? "Postpartum" : lifeStage === "menopause" ? "Menopause" : "Cyclical");
    const lengthLabel = effectiveLengthDays === 1 ? "1-Day" : effectiveLengthDays === 3 ? "3-Day" : "1-Week";
    const possessive = firstName ? `${firstName}'${firstName.endsWith("s") ? "" : "s"} ` : "";
    const baseTitle = `${possessive}${lengthLabel} ${startingPhase} Menu`;
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
          length_days: effectiveLengthDays,
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
      ? `Reworking your meal plan with your tweaks — new version coming up.`
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
    const generationTask = generateAndUploadPdf({
      supabase,
      lovableApiKey,
      userId: user.id,
      resourceId: resource.id,
      participant,
      lengthDays: effectiveLengthDays,
      style,
      dietaryPrefs,
      startCycleDay,
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

// ---------- Background generation ----------
async function generateAndUploadPdf(args: {
  supabase: any;
  lovableApiKey: string;
  userId: string;
  resourceId: string;
  participant: any;
  lengthDays: LengthDays;
  style: Style;
  dietaryPrefs: any;
  startCycleDay: number;
  cycleLengthDays: number;
  lifeStage: string;
  title: string;
  parentPlan?: MealPlanData | null;
  excludeIngredients?: string[];
  feedbackText?: string;
}) {
  const {
    supabase, lovableApiKey, userId, resourceId, participant,
    lengthDays, style, dietaryPrefs, startCycleDay, cycleLengthDays,
    lifeStage, title,
    parentPlan = null, excludeIngredients = [], feedbackText = "",
  } = args;

  try {
    // Build day-by-day phase scaffold to give the AI exact targets
    const dayScaffold: { day_number: number; cycle_day: number; phase: string }[] = [];
    for (let i = 0; i < lengthDays; i++) {
      const cd = ((startCycleDay - 1 + i) % cycleLengthDays) + 1;
      const phase = lifeStage === "cycling" ? getPhaseForDay(cd, cycleLengthDays) : lifeStage;
      dayScaffold.push({ day_number: i + 1, cycle_day: cd, phase });
    }

    const numWeeks = Math.ceil(lengthDays / 7);
    const dietBits: string[] = [];
    if (dietaryPrefs.diet_type) dietBits.push(`Diet: ${dietaryPrefs.diet_type}`);
    if (dietaryPrefs.allergies?.length) dietBits.push(`Allergies: ${dietaryPrefs.allergies.join(", ")}`);
    if (dietaryPrefs.dislikes?.length) dietBits.push(`Dislikes (NEVER use): ${dietaryPrefs.dislikes.join(", ")}`);
    const focusList = (dietaryPrefs.focus_styles?.length ? dietaryPrefs.focus_styles : dietaryPrefs.cuisines) || [];
    if (focusList.length) dietBits.push(`Focus styles (weave these throughout): ${focusList.join(", ")}`);
    if (dietaryPrefs.includes?.length) dietBits.push(`Foods the user wants INCLUDED (use across multiple meals where natural): ${dietaryPrefs.includes.join(", ")}`);
    if (dietaryPrefs.macro_preset) dietBits.push(`Macro preset: ${dietaryPrefs.macro_preset.replace(/_/g, " ")} — bias every meal toward this profile.`);
    const mt = dietaryPrefs.macro_targets || {};
    const macroParts = [
      mt.calories ? `${mt.calories} kcal` : null,
      mt.protein ? `${mt.protein}g protein` : null,
      mt.carbs ? `${mt.carbs}g carbs` : null,
      mt.fat ? `${mt.fat}g fat` : null,
    ].filter(Boolean);
    if (macroParts.length) dietBits.push(`Daily macro targets (aim total day to land near these): ${macroParts.join(", ")}.`);
    if (dietaryPrefs.free_form) dietBits.push(`Additional user context (honor this): "${dietaryPrefs.free_form}"`);
    const dietContext = dietBits.length ? dietBits.join("\n") : "Omnivore, no restrictions";

    const isCycling = lifeStage === "cycling";

    const cyclingPrinciples = `Phase nutrition principles:
- Menstruation: iron-rich (lentils, beef, dark leafy greens), warming foods, vitamin C to aid iron absorption, anti-inflammatory (ginger, turmeric, omega-3s).
- Follicular: light fresh foods, fermented foods (yogurt, kimchi) for estrogen metabolism, leafy greens, sprouted grains, seeds (flax, pumpkin).
- Ovulation: cruciferous vegetables (broccoli, cauliflower) for healthy estrogen clearance, B vitamins, antioxidant-rich berries, fiber.
- Luteal: complex carbs (sweet potato, quinoa, oats) to support serotonin, magnesium-rich (dark chocolate, leafy greens, sunflower/sesame seeds), B6, calcium.`;

    const postpartumPrinciples = `Postpartum nutrition principles (this user is POSTPARTUM — they do NOT have a regular cycle right now, so do NOT reference cycle days, phases, ovulation, luteal, follicular, or menstruation anywhere in the meals, intros, or summaries):
- Recovery & repair: collagen-rich foods (bone broth, slow-cooked meats), iron (red meat, lentils, dark leafy greens) to rebuild blood stores.
- Hormonal recalibration: healthy fats (avocado, olive oil, nuts, seeds, oily fish) for steroid hormone production; cruciferous vegetables for estrogen metabolism.
- Energy & sleep deprivation: stable blood sugar via complex carbs + protein at every meal; magnesium (leafy greens, pumpkin seeds, dark chocolate) to support nervous system.
- Mood & nervous system: B-vitamins (eggs, whole grains, legumes), omega-3s (salmon, sardines, walnuts, flax) for mood regulation.
- Easy & one-handed: meals must be doable while caring for a baby — minimal prep, ideally 10-20 min, batch-friendly.
- Do NOT assume breastfeeding — only optimize for breastfeeding if the user explicitly mentioned it in their dietary notes.`;

    const menopausePrinciples = `Menopause nutrition principles (this user is in MENOPAUSE — they do NOT have a regular cycle, so do NOT reference cycle days, phases, ovulation, luteal, follicular, or menstruation anywhere):
- Hot flashes & sleep: phytoestrogen-rich foods (flax, soy, sesame), tryptophan-rich (turkey, oats, nuts) for evening meals.
- Bone health: calcium (dairy, leafy greens, sardines), vitamin D, magnesium, vitamin K (cruciferous, fermented foods).
- Cardiovascular & metabolic: high fiber, omega-3s, plenty of plants, lean protein at every meal to preserve muscle mass.
- Blood sugar & weight: complex carbs over refined, protein-forward meals, anti-inflammatory spices (turmeric, ginger).
- Cognitive support: berries, leafy greens, fatty fish, nuts.`;

    const principles = lifeStage === "postpartum" ? postpartumPrinciples : lifeStage === "menopause" ? menopausePrinciples : cyclingPrinciples;

    const buildIntent = isCycling
      ? `Build a ${lengthDays}-day meal plan that aligns each day's meals with the user's exact cycle phase.`
      : `Build a ${lengthDays}-day meal plan tailored to where this user is in their ${lifeStage} journey. All meals serve the same hormonal goals — there is no cycle phase variation.`;

    const mealQualifier = isCycling ? "Hormonally optimized for that day's phase" : `Aligned with ${lifeStage} nutritional needs`;

    const summaryGuidance = isCycling
      ? `For each WEEK, also produce a phase_summary (1-2 sentences explaining what hormonal goals this week's meals serve) and a grocery_list (15-25 items consolidated from that week's meals — no quantities, just ingredient names).`
      : `For each WEEK, also produce a phase_summary (1-2 sentences explaining what ${lifeStage} goals this week's meals serve — do NOT mention cycle phases) and a grocery_list (15-25 items consolidated from that week's meals — no quantities, just ingredient names).`;

    const introGuidance = isCycling
      ? `Write a 2-sentence intro that explains the plan's logic in Logan's voice (warm, grounded, no fluff, no emojis).`
      : `Write a 2-sentence intro that explains the plan's logic in Logan's voice (warm, grounded, no fluff, no emojis). Do NOT mention cycle phases, luteal, follicular, ovulation, or menstruation — frame it around ${lifeStage} recovery / transition.`;

    const systemPrompt = `You are Logan — a knowledgeable, grounded friend who builds meal plans backed by hormonal nutrition science.

${buildIntent} Every meal must be:
- Realistic and easy to prepare (15-30 min)
- Made with whole, accessible ingredients
- ${mealQualifier}

${principles}

User dietary context:
${dietContext}

Return ONE meal per slot per day — no "or" options. Be specific (e.g. "Smoked salmon avocado toast on rye" not "Toast"). Each meal name must be concise (under 80 chars).

For EVERY meal (breakfast, lunch, dinner, snack on every day), you MUST also return a "recipes" object containing:
- ingredients: 4-10 ingredient names (just names, no quantities, no measurements — these feed the per-meal shopping view)
- recipe: a 2-4 sentence plain-English recipe describing how to make it. Warm, casual, no numbered steps, no headings, no emojis.

${summaryGuidance}

${introGuidance}`;

    const revisionBlock: string[] = [];
    if (parentPlan?.days?.length) {
      const parentSummary = parentPlan.days.map(d =>
        `Day ${d.day_number} (${d.phase}${isCycling ? `, cycle day ${d.cycle_day}` : ""}): B="${d.breakfast}" | L="${d.lunch}" | D="${d.dinner}" | S="${d.snack}"`
      ).join("\n");
      revisionBlock.push(`This is a REVISION of an existing plan. Keep the same overall structure${isCycling ? ", phase logic" : ""} and any meals the user didn't complain about. Only change what's necessary to address the feedback below.\n\nPREVIOUS PLAN:\n${parentSummary}`);
    }
    if (excludeIngredients.length) {
      revisionBlock.push(`HARD EXCLUSIONS — these ingredients must NOT appear anywhere in the new plan, including grocery lists or meal names: ${excludeIngredients.join(", ")}.`);
    }
    if (feedbackText.trim()) {
      revisionBlock.push(`USER FEEDBACK to address:\n"${feedbackText.trim()}"`);
    }

    const userPrompt = isCycling
      ? `Build the ${lengthDays}-day plan starting on cycle day ${startCycleDay} of a ${cycleLengthDays}-day cycle. Day-to-phase mapping:\n${dayScaffold.map(d => `Day ${d.day_number}: cycle day ${d.cycle_day} (${d.phase})`).join("\n")}\n\n${revisionBlock.join("\n\n")}\n\nReturn structured JSON via the build_meal_plan tool.`
      : `Build a ${lengthDays}-day ${lifeStage} meal plan. Every day's "phase" field must be exactly "${lifeStage}" — there is no cycle phase variation. Do NOT mention cycle days, luteal, follicular, ovulation, or menstruation anywhere.\n\n${revisionBlock.join("\n\n")}\n\nReturn structured JSON via the build_meal_plan tool.`;

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
                name: "build_meal_plan",
                description: "Return the structured cyclical meal plan.",
                parameters: {
                  type: "object",
                  properties: {
                    intro: { type: "string" },
                    weeks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          week_number: { type: "number" },
                          phase_summary: { type: "string" },
                          grocery_list: {
                            type: "array",
                            items: { type: "string" },
                          },
                        },
                        required: ["week_number", "phase_summary", "grocery_list"],
                        additionalProperties: false,
                      },
                    },
                    days: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          day_number: { type: "number" },
                          cycle_day: { type: "number" },
                          phase: { type: "string" },
                          breakfast: { type: "string" },
                          lunch: { type: "string" },
                          dinner: { type: "string" },
                          snack: { type: "string" },
                          hormone_focus: { type: "string" },
                          recipes: {
                            type: "object",
                            description: "Per-meal ingredient lists and short recipes. Each meal must have 4-10 ingredients (just names, no quantities) and a 2-4 sentence recipe.",
                            properties: {
                              breakfast: {
                                type: "object",
                                properties: {
                                  ingredients: { type: "array", items: { type: "string" } },
                                  recipe: { type: "string" },
                                },
                                required: ["ingredients", "recipe"],
                                additionalProperties: false,
                              },
                              lunch: {
                                type: "object",
                                properties: {
                                  ingredients: { type: "array", items: { type: "string" } },
                                  recipe: { type: "string" },
                                },
                                required: ["ingredients", "recipe"],
                                additionalProperties: false,
                              },
                              dinner: {
                                type: "object",
                                properties: {
                                  ingredients: { type: "array", items: { type: "string" } },
                                  recipe: { type: "string" },
                                },
                                required: ["ingredients", "recipe"],
                                additionalProperties: false,
                              },
                              snack: {
                                type: "object",
                                properties: {
                                  ingredients: { type: "array", items: { type: "string" } },
                                  recipe: { type: "string" },
                                },
                                required: ["ingredients", "recipe"],
                                additionalProperties: false,
                              },
                            },
                            required: ["breakfast", "lunch", "dinner", "snack"],
                            additionalProperties: false,
                          },
                        },
                        required: [
                          "day_number", "cycle_day", "phase",
                          "breakfast", "lunch", "dinner", "snack", "hormone_focus", "recipes",
                        ],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["intro", "weeks", "days"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "build_meal_plan" },
          },
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
      throw new Error("AI did not return structured meal plan");
    }

    const planData: MealPlanData = JSON.parse(toolCall.function.arguments);
    if (!planData.days?.length || planData.days.length < lengthDays) {
      throw new Error("AI returned incomplete meal plan");
    }

    // ---------- Generate hero photos for each day (parallel, best-effort) ----------
    // We pick the dinner as the photographed meal — the most "shareable" plate.
    // If image gen fails for any day we just skip — the rest of the flow continues.
    const imagePaths = await generateDayHeroImages({
      supabase,
      lovableApiKey,
      userId,
      resourceId,
      days: planData.days,
    });
    // Attach image_path to each day in the plan data for the preview metadata
    const daysWithImages = planData.days.map((d, i) => ({
      ...d,
      image_path: imagePaths[i] ?? null,
    }));
    planData.days = daysWithImages as MealDay[];

    // Render PDF
    const pdfBytes = await renderMealPlanPdf({
      planData,
      title,
      style,
      lengthDays,
      participantName: participant?.full_name?.split(" ")?.[0] || null,
      numWeeks,
    });

    // Upload to storage
    const filePath = `${userId}/meal-plans/${resourceId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("resources")
      .upload(filePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Mark ready
    await supabase
      .from("user_resources")
      .update({
        status: "ready",
        pdf_path: filePath,
        metadata: {
          length_days: lengthDays,
          start_cycle_day: startCycleDay,
          cycle_length_days: cycleLengthDays,
          life_stage: lifeStage,
          dietary_prefs: dietaryPrefs,
          intro: planData.intro,
          num_days: planData.days.length,
          preview: {
            intro: planData.intro,
            days: planData.days,
            weeks: planData.weeks,
          },
        },
      })
      .eq("id", resourceId);

    console.log(`Meal plan ${resourceId} ready for user ${userId}`);
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


// ---------- Hero image generation ----------
// Generates one editorial-style food photo per day from the dinner description.
// Runs in parallel batches; any failures fall back to null so the plan still ships.
async function generateDayHeroImages(args: {
  supabase: any;
  lovableApiKey: string;
  userId: string;
  resourceId: string;
  days: MealDay[];
}): Promise<(string | null)[]> {
  const { supabase, lovableApiKey, userId, resourceId, days } = args;

  // Cap at 14 photos per generation to keep edge function within time budget.
  const MAX_IMAGES = 14;
  const targets = days.slice(0, MAX_IMAGES);

  const generateOne = async (day: MealDay, index: number): Promise<string | null> => {
    try {
      // Pick the most photogenic meal of the day — dinner usually wins, fall back to lunch
      const meal = day.dinner || day.lunch || day.breakfast;
      if (!meal) return null;

      const prompt = `Editorial overhead food photography of: ${meal}.
Beautifully plated on a ceramic plate, on a warm wooden table with soft natural daylight from the side.
Shallow depth of field, fresh colorful whole-food ingredients visible, rustic minimal styling, magazine cookbook aesthetic.
No text, no logos, no people, no hands, no cutlery branding. Photorealistic, ultra detailed, soft shadows.`;

      const resp = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            messages: [{ role: "user", content: prompt }],
            modalities: ["image", "text"],
          }),
        },
      );

      if (!resp.ok) {
        console.warn(`Image gen failed for day ${day.day_number}: ${resp.status}`);
        return null;
      }

      const data = await resp.json();
      const dataUrl: string | undefined =
        data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!dataUrl?.startsWith("data:image/")) return null;

      // Strip the data URL prefix and decode
      const commaIdx = dataUrl.indexOf(",");
      const b64 = dataUrl.slice(commaIdx + 1);
      const mimeMatch = dataUrl.slice(0, commaIdx).match(/data:(image\/[a-zA-Z0-9.+-]+)/);
      const contentType = mimeMatch?.[1] ?? "image/png";
      const ext = contentType.split("/")[1]?.split("+")[0] ?? "png";

      const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const path = `${userId}/meal-plans/${resourceId}/day-${day.day_number}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("resources")
        .upload(path, binary, { contentType, upsert: true });
      if (upErr) {
        console.warn(`Image upload failed for day ${day.day_number}: ${upErr.message}`);
        return null;
      }
      return path;
    } catch (err) {
      console.warn(`Image step crashed for day ${day.day_number}:`, err);
      return null;
    }
  };

  // Run in batches of 4 to balance speed vs gateway concurrency
  const BATCH = 4;
  const results: (string | null)[] = new Array(targets.length).fill(null);
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      slice.map((d, j) => generateOne(d, i + j)),
    );
    settled.forEach((r, j) => {
      results[i + j] = r.status === "fulfilled" ? r.value : null;
    });
  }

  // Pad with nulls for any days beyond the cap
  while (results.length < days.length) results.push(null);
  return results;
}

// ---------- PDF rendering ----------
async function renderMealPlanPdf(args: {
  planData: MealPlanData;
  title: string;
  style: Style;
  lengthDays: LengthDays;
  participantName: string | null;
  numWeeks: number;
}): Promise<Uint8Array> {
  const { planData, title, style, lengthDays, participantName, numWeeks } = args;
  const isDark = style === "dark";

  const bg: [number, number, number] = isDark ? [0.04, 0.07, 0.10] : [1, 1, 1];
  const surface: [number, number, number] = isDark ? [0.08, 0.12, 0.16] : [0.97, 0.97, 0.96];
  const fg: [number, number, number] = isDark ? [0.96, 0.97, 0.98] : [0.10, 0.12, 0.15];
  const muted: [number, number, number] = isDark ? [0.62, 0.66, 0.72] : [0.42, 0.45, 0.50];
  const accent: [number, number, number] = [0.082, 0.722, 0.549]; // teal #15B88C
  const divider: [number, number, number] = isDark ? [0.16, 0.20, 0.25] : [0.88, 0.88, 0.86];

  const pdfDoc = await PDFDocument.create();
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const pageW = 612; // US Letter
  const pageH = 792;
  const margin = 48;
  const contentW = pageW - margin * 2;

  // ---- Cover page ----
  const cover = pdfDoc.addPage([pageW, pageH]);
  cover.drawRectangle({
    x: 0, y: 0, width: pageW, height: pageH,
    color: rgb(bg[0], bg[1], bg[2]),
  });

  // Accent gradient bar (faked with stacked rectangles)
  for (let i = 0; i < 6; i++) {
    cover.drawRectangle({
      x: 0, y: pageH - 6 - i, width: pageW, height: 1,
      color: rgb(accent[0], accent[1], accent[2]),
      opacity: 1 - i * 0.15,
    });
  }

  // Brand
  cover.drawText("LOGAN", {
    x: margin, y: pageH - 90,
    size: 14, font: helvBold,
    color: rgb(accent[0], accent[1], accent[2]),
  });
  cover.drawText("Cycle-synced nutrition", {
    x: margin, y: pageH - 108,
    size: 10, font: helv,
    color: rgb(muted[0], muted[1], muted[2]),
  });

  // Title block (vertically centered-ish)
  const titleY = pageH / 2 + 80;
  drawWrappedText(cover, title, {
    x: margin, y: titleY, width: contentW,
    size: 36, lineHeight: 42, font: helvBold,
    color: fg,
  });

  if (participantName) {
    cover.drawText(`Built for ${participantName}`, {
      x: margin, y: titleY - 70,
      size: 13, font: helvOblique,
      color: rgb(muted[0], muted[1], muted[2]),
    });
  }

  // Intro
  drawWrappedText(cover, planData.intro, {
    x: margin, y: titleY - 110, width: contentW,
    size: 12, lineHeight: 18, font: helv,
    color: fg,
  });

  // Phase legend
  const legendY = 180;
  cover.drawText("Phases in this plan", {
    x: margin, y: legendY + 28,
    size: 10, font: helvBold,
    color: rgb(muted[0], muted[1], muted[2]),
  });
  const phasesUsed = Array.from(new Set(planData.days.map(d => d.phase)));
  let lx = margin;
  for (const ph of phasesUsed) {
    const c = phaseColor(ph, style);
    cover.drawCircle({
      x: lx + 5, y: legendY + 5, size: 5,
      color: rgb(c[0], c[1], c[2]),
    });
    cover.drawText(ph, {
      x: lx + 14, y: legendY + 1,
      size: 10, font: helv, color: rgb(fg[0], fg[1], fg[2]),
    });
    lx += helv.widthOfTextAtSize(ph, 10) + 36;
  }

  // Footer
  cover.drawText("Generated by asklogan.ai", {
    x: margin, y: 36,
    size: 9, font: helv,
    color: rgb(muted[0], muted[1], muted[2]),
  });
  cover.drawText(new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  }), {
    x: pageW - margin - 90, y: 36,
    size: 9, font: helv,
    color: rgb(muted[0], muted[1], muted[2]),
  });

  // ---- Daily pages: group days into weekly chunks (one page per week) ----
  const daysPerPage = 7;
  for (let w = 0; w < numWeeks; w++) {
    const weekDays = planData.days.slice(w * daysPerPage, (w + 1) * daysPerPage);
    if (weekDays.length === 0) break;
    const weekBlock = planData.weeks.find(wk => wk.week_number === w + 1);
    drawWeekPage({
      pdfDoc, pageW, pageH, margin,
      bg, surface, fg, muted, accent, divider,
      helv, helvBold, helvOblique,
      style, weekDays, weekBlock,
      weekIndex: w + 1, totalWeeks: numWeeks,
      planTitle: title,
    });
  }

  // ---- Grocery list pages (one per week) ----
  for (const wk of planData.weeks) {
    drawGroceryPage({
      pdfDoc, pageW, pageH, margin,
      bg, surface, fg, muted, accent, divider,
      helv, helvBold,
      week: wk, totalWeeks: numWeeks, planTitle: title,
    });
  }

  return await pdfDoc.save();
}

function drawWeekPage(opts: any) {
  const {
    pdfDoc, pageW, pageH, margin,
    bg, surface, fg, muted, accent, divider,
    helv, helvBold, helvOblique,
    style, weekDays, weekBlock,
    weekIndex, totalWeeks, planTitle,
  } = opts;

  const page = pdfDoc.addPage([pageW, pageH]);
  page.drawRectangle({
    x: 0, y: 0, width: pageW, height: pageH,
    color: rgb(bg[0], bg[1], bg[2]),
  });

  // Header
  page.drawText(planTitle.toUpperCase(), {
    x: margin, y: pageH - 48,
    size: 9, font: helvBold,
    color: rgb(accent[0], accent[1], accent[2]),
  });
  const weekLabel = totalWeeks > 1 ? `Week ${weekIndex} of ${totalWeeks}` : "Your week";
  page.drawText(weekLabel, {
    x: margin, y: pageH - 72,
    size: 22, font: helvBold,
    color: rgb(fg[0], fg[1], fg[2]),
  });

  if (weekBlock?.phase_summary) {
    drawWrappedText(page, weekBlock.phase_summary, {
      x: margin, y: pageH - 96, width: pageW - margin * 2,
      size: 10, lineHeight: 14, font: helvOblique,
      color: muted,
    });
  }

  // Day cards
  const cardTop = pageH - 140;
  const cardH = (cardTop - 60) / Math.max(weekDays.length, 1);
  const cardSpacing = 6;
  const actualCardH = cardH - cardSpacing;

  for (let i = 0; i < weekDays.length; i++) {
    const d = weekDays[i];
    const yTop = cardTop - i * cardH;
    const yBottom = yTop - actualCardH;
    const c = phaseColor(d.phase, style);

    // Card background
    page.drawRectangle({
      x: margin, y: yBottom,
      width: pageW - margin * 2, height: actualCardH,
      color: rgb(surface[0], surface[1], surface[2]),
    });
    // Phase accent bar
    page.drawRectangle({
      x: margin, y: yBottom,
      width: 3, height: actualCardH,
      color: rgb(c[0], c[1], c[2]),
    });

    // Day header
    page.drawText(`Day ${d.day_number}`, {
      x: margin + 14, y: yTop - 16,
      size: 11, font: helvBold,
      color: rgb(fg[0], fg[1], fg[2]),
    });
    page.drawText(`${d.phase} · cycle day ${d.cycle_day}`, {
      x: margin + 14 + 50, y: yTop - 16,
      size: 9, font: helv,
      color: rgb(c[0], c[1], c[2]),
    });

    // 4 meals in 2x2 grid
    const meals = [
      ["Breakfast", d.breakfast],
      ["Lunch", d.lunch],
      ["Dinner", d.dinner],
      ["Snack", d.snack],
    ];
    const colW = (pageW - margin * 2 - 28) / 2;
    const rowH = (actualCardH - 28) / 2;
    for (let m = 0; m < 4; m++) {
      const col = m % 2;
      const row = Math.floor(m / 2);
      const mx = margin + 14 + col * colW;
      const my = yTop - 30 - row * rowH;
      page.drawText(meals[m][0].toUpperCase(), {
        x: mx, y: my,
        size: 7, font: helvBold,
        color: rgb(muted[0], muted[1], muted[2]),
      });
      drawWrappedText(page, meals[m][1], {
        x: mx, y: my - 11, width: colW - 8,
        size: 9, lineHeight: 11, font: helv,
        color: fg, maxLines: 2,
      });
    }
  }

  // Footer
  page.drawRectangle({
    x: margin, y: 48, width: pageW - margin * 2, height: 0.5,
    color: rgb(divider[0], divider[1], divider[2]),
  });
  page.drawText("LOGAN · asklogan.ai", {
    x: margin, y: 32,
    size: 8, font: helv,
    color: rgb(muted[0], muted[1], muted[2]),
  });
  page.drawText(`${weekIndex} / ${totalWeeks}`, {
    x: pageW - margin - 30, y: 32,
    size: 8, font: helv,
    color: rgb(muted[0], muted[1], muted[2]),
  });
}

function drawGroceryPage(opts: any) {
  const {
    pdfDoc, pageW, pageH, margin,
    bg, surface, fg, muted, accent, divider,
    helv, helvBold,
    week, totalWeeks, planTitle,
  } = opts;

  const page = pdfDoc.addPage([pageW, pageH]);
  page.drawRectangle({
    x: 0, y: 0, width: pageW, height: pageH,
    color: rgb(bg[0], bg[1], bg[2]),
  });

  page.drawText(planTitle.toUpperCase(), {
    x: margin, y: pageH - 48,
    size: 9, font: helvBold,
    color: rgb(accent[0], accent[1], accent[2]),
  });
  const heading = totalWeeks > 1
    ? `Grocery list — Week ${week.week_number}`
    : "Grocery list";
  page.drawText(heading, {
    x: margin, y: pageH - 72,
    size: 22, font: helvBold,
    color: rgb(fg[0], fg[1], fg[2]),
  });

  // 2 columns of items with checkboxes
  const items = week.grocery_list || [];
  const cols = 2;
  const colW = (pageW - margin * 2 - 24) / cols;
  const itemsPerCol = Math.ceil(items.length / cols);
  const rowH = 22;
  const startY = pageH - 110;

  for (let i = 0; i < items.length; i++) {
    const col = Math.floor(i / itemsPerCol);
    const row = i % itemsPerCol;
    const x = margin + col * (colW + 24);
    const y = startY - row * rowH;
    // Checkbox
    page.drawRectangle({
      x, y: y - 2, width: 9, height: 9,
      borderColor: rgb(muted[0], muted[1], muted[2]),
      borderWidth: 0.7,
    });
    drawWrappedText(page, items[i], {
      x: x + 16, y: y + 5, width: colW - 16,
      size: 10, lineHeight: 12, font: helv,
      color: fg, maxLines: 1,
    });
  }

  page.drawRectangle({
    x: margin, y: 48, width: pageW - margin * 2, height: 0.5,
    color: rgb(divider[0], divider[1], divider[2]),
  });
  page.drawText("LOGAN · asklogan.ai", {
    x: margin, y: 32,
    size: 8, font: helv,
    color: rgb(muted[0], muted[1], muted[2]),
  });
}

// ---------- Text wrapping helper ----------
function drawWrappedText(
  page: PDFPage,
  text: string,
  opts: {
    x: number; y: number; width: number;
    size: number; lineHeight: number;
    font: PDFFont;
    color: [number, number, number];
    maxLines?: number;
  },
) {
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    const widthAt = opts.font.widthOfTextAtSize(test, opts.size);
    if (widthAt > opts.width && line) {
      lines.push(line);
      line = w;
      if (opts.maxLines && lines.length >= opts.maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && (!opts.maxLines || lines.length < opts.maxLines)) lines.push(line);
  if (opts.maxLines && lines.length === opts.maxLines) {
    const last = lines[lines.length - 1];
    const ellipsis = opts.font.widthOfTextAtSize(last + "…", opts.size) > opts.width
      ? last.replace(/\s+\S+$/, "") + "…"
      : last + (words.length > lines.flatMap(l => l.split(/\s+/)).length ? "…" : "");
    lines[lines.length - 1] = ellipsis;
  }
  for (let i = 0; i < lines.length; i++) {
    page.drawText(lines[i], {
      x: opts.x, y: opts.y - i * opts.lineHeight,
      size: opts.size, font: opts.font,
      color: rgb(opts.color[0], opts.color[1], opts.color[2]),
    });
  }
}
