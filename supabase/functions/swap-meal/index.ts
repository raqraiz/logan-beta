// Generate alternative meal options for a single slot in a meal plan.
// Used when an ingredient isn't locally available (e.g. no sweet potato in Colombia).
// Returns 3 alternative meal options matching the same phase/hormonal goals.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MealOption {
  name: string;
  ingredients: string[];
  recipe: string;
}

// Expand a free-text diet_type into explicit HARD rules so kosher/halal/vegan/etc.
// are treated as real constraints, not labels.
function expandDietRules(dietType: string): string | null {
  const t = dietType.toLowerCase();
  const lines: string[] = [];
  if (/\bkosher\b/.test(t)) {
    lines.push(
      "KOSHER RULES (strict, NEVER violate): no pork or pork products (bacon, ham, prosciutto, lard); no shellfish or crustaceans (shrimp, prawns, lobster, crab, scallops, mussels, oysters, clams, squid, octopus); no catfish, eel, shark, or other non-finned/non-scaled fish; do NOT combine meat or poultry with dairy in the same meal (no cheeseburgers, no chicken parmesan, no creamy chicken pasta, no butter on steak); eggs and pareve (neutral) ingredients are fine."
    );
  }
  if (/\bhalal\b/.test(t)) {
    lines.push("HALAL RULES (strict, NEVER violate): no pork or pork products, no alcohol or alcohol-based ingredients, no non-halal gelatin.");
  }
  if (/\bvegan\b/.test(t)) {
    lines.push("VEGAN RULES (strict, NEVER violate): no meat, poultry, fish, shellfish, dairy, eggs, honey, gelatin, or any animal-derived ingredient.");
  } else if (/\bvegetarian\b/.test(t)) {
    lines.push("VEGETARIAN RULES (strict, NEVER violate): no meat, poultry, fish, or shellfish. Dairy and eggs are allowed.");
  }
  if (/\bpescatarian\b/.test(t)) {
    lines.push("PESCATARIAN RULES (strict, NEVER violate): no meat or poultry. Fish, shellfish, dairy, and eggs are allowed.");
  }
  if (/\bgluten[- ]?free\b/.test(t)) {
    lines.push("GLUTEN-FREE RULES (strict, NEVER violate): no wheat, barley, rye, spelt, regular soy sauce, seitan, or any gluten-containing grain.");
  }
  if (/\bdairy[- ]?free\b/.test(t)) {
    lines.push("DAIRY-FREE RULES (strict, NEVER violate): no milk, cheese, butter, yogurt, cream, ghee, or whey.");
  }
  return lines.length ? lines.join("\n") : null;
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

    const body = await req.json();
    const resourceId: string = String(body.resourceId || "");
    const dayNumber: number = Number(body.dayNumber);
    const slot: string = String(body.slot || "");
    const unavailable: string[] = Array.isArray(body.unavailableIngredients)
      ? body.unavailableIngredients.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 15)
      : [];
    const note: string = typeof body.note === "string" ? body.note.slice(0, 300) : "";
    const apply: boolean = body.apply === true;
    const chosenIndex: number = Number.isFinite(body.chosenIndex) ? Number(body.chosenIndex) : -1;
    const chosenOption: MealOption | null = body.chosenOption && typeof body.chosenOption === "object"
      ? body.chosenOption as MealOption : null;

    if (!resourceId || !["breakfast", "lunch", "dinner", "snack"].includes(slot) || !Number.isFinite(dayNumber)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load resource (RLS ensures ownership)
    const { data: resource } = await userClient
      .from("user_resources")
      .select("*")
      .eq("id", resourceId)
      .maybeSingle();

    if (!resource || resource.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Resource not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const preview = resource.metadata?.preview;
    const day = preview?.days?.find((d: any) => d.day_number === dayNumber);
    if (!day) {
      return new Response(JSON.stringify({ error: "Day not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ───────────────── APPLY MODE — replace the chosen meal in the plan ─────────────────
    if (apply && chosenOption) {
      const newPreview = JSON.parse(JSON.stringify(preview));
      const targetDay = newPreview.days.find((d: any) => d.day_number === dayNumber);
      if (targetDay) {
        targetDay[slot] = chosenOption.name;
        targetDay.recipes = targetDay.recipes || {};
        targetDay.recipes[slot] = {
          ingredients: chosenOption.ingredients ?? [],
          recipe: chosenOption.recipe ?? "",
        };

        // If swapping dinner (the hero photo source), regenerate the day's hero image.
        if (slot === "dinner") {
          const newImagePath = await generateMealHeroImage({
            supabase,
            lovableApiKey,
            userId: user.id,
            resourceId,
            dayNumber,
            mealName: chosenOption.name,
          });
          if (newImagePath) {
            targetDay.image_path = newImagePath;
          }
        }
      }

      const newMetadata = {
        ...(resource.metadata || {}),
        preview: newPreview,
      };

      await supabase
        .from("user_resources")
        .update({ metadata: newMetadata })
        .eq("id", resourceId);

      return new Response(JSON.stringify({ success: true, preview: newPreview }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ───────────────── SUGGEST MODE — generate 3 alternatives ─────────────────
    const lifeStage = resource.metadata?.life_stage || "cycling";
    const isCycling = lifeStage === "cycling";
    const phase = day.phase;
    const currentMeal = day[slot];
    const currentIngredients: string[] = day.recipes?.[slot]?.ingredients || [];

    const dietaryPrefs = resource.metadata?.dietary_prefs || {};
    const dietBits: string[] = [];
    if (dietaryPrefs.diet_type) {
      dietBits.push(`Diet: ${dietaryPrefs.diet_type}`);
      const rules = expandDietRules(dietaryPrefs.diet_type);
      if (rules) dietBits.push(rules);
    }
    if (dietaryPrefs.allergies?.length) dietBits.push(`Allergies (NEVER use): ${dietaryPrefs.allergies.join(", ")}`);
    if (dietaryPrefs.dislikes?.length) dietBits.push(`Dislikes (NEVER use): ${dietaryPrefs.dislikes.join(", ")}`);
    if (dietaryPrefs.cuisines?.length) dietBits.push(`Cuisine preferences: ${dietaryPrefs.cuisines.join(", ")}`);
    const dietContext = dietBits.length ? dietBits.join("\n") : "Omnivore, no restrictions";

    const phaseGuidance = isCycling
      ? `This meal is for the ${phase} phase. Keep the same hormonal goals as the original.`
      : `This meal is for someone in their ${lifeStage} journey. Keep the same nutritional goals as the original.`;

    const systemPrompt = `You are Logan — a knowledgeable, grounded presence who builds meal plans backed by hormonal nutrition science. Logan has no gender — never use "she/he/her/him" for yourself.

The user wants to swap ONE meal for a different option. Generate 3 distinct alternative ${slot} options.

${phaseGuidance}

Each alternative must:
- Be realistic and easy to prepare (15-30 min)
- Match the same nutritional intent as the original meal
- Be meaningfully DIFFERENT from the original (different protein, cuisine, or main ingredient — not a minor tweak)
- ${unavailable.length ? "AVOID every unavailable ingredient (and obvious close substitutes)" : "Offer variety vs. the original — don't just rename it"}
- Use whole, accessible ingredients
- Be specific (e.g. "Smoked salmon avocado toast on rye" not "Toast"). Each name under 80 chars.

For each option, return:
- name: the meal name (concise, under 80 chars)
- ingredients: 4-10 ingredient names (just names, no quantities)
- recipe: 2-4 sentences, warm casual voice, no numbered steps, no headings, no emojis

User dietary context:
${dietContext}

Return STRICT JSON only, no prose, no markdown:
{
  "options": [
    { "name": "...", "ingredients": ["..."], "recipe": "..." },
    { "name": "...", "ingredients": ["..."], "recipe": "..." },
    { "name": "...", "ingredients": ["..."], "recipe": "..." }
  ]
}`;

    const unavailableLine = unavailable.length
      ? `Ingredients to avoid: ${unavailable.join(", ")}`
      : "No specific ingredients to avoid — the user just wants different options.";

    const userPrompt = `Original ${slot}: "${currentMeal}"
Original ingredients: ${currentIngredients.join(", ") || "(unknown)"}

${unavailableLine}

${note ? `Extra note from user: "${note}"` : ""}

Generate 3 alternative ${slot} options.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResponse.json();
    const content: string = aiJson.choices?.[0]?.message?.content || "";

    // Hardened JSON extraction
    const stripped = content.replace(/```json\n?|\n?```/g, "").replace(/^\s*json\s*/i, "").trim();
    const firstBrace = stripped.indexOf("{");
    const lastBrace = stripped.lastIndexOf("}");
    const jsonSlice = firstBrace !== -1 && lastBrace > firstBrace
      ? stripped.slice(firstBrace, lastBrace + 1)
      : stripped;

    let parsed: any = {};
    try {
      parsed = JSON.parse(jsonSlice);
    } catch (e) {
      console.error("Parse failed:", e, content.slice(0, 300));
      return new Response(JSON.stringify({ error: "Couldn't parse alternatives" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const options: MealOption[] = (parsed.options || []).slice(0, 3).map((o: any) => ({
      name: String(o.name || "").slice(0, 120),
      ingredients: Array.isArray(o.ingredients) ? o.ingredients.map((x: any) => String(x)).slice(0, 12) : [],
      recipe: String(o.recipe || ""),
    })).filter((o: MealOption) => o.name);

    return new Response(JSON.stringify({ options }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("swap-meal error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ---------- Hero image regeneration ----------
// Mirrors the generation logic in generate-meal-plan/index.ts so a swapped
// dinner gets a fresh editorial photo matching the new dish.
async function generateMealHeroImage(args: {
  supabase: any;
  lovableApiKey: string;
  userId: string;
  resourceId: string;
  dayNumber: number;
  mealName: string;
}): Promise<string | null> {
  const { supabase, lovableApiKey, userId, resourceId, dayNumber, mealName } = args;
  try {
    const prompt = `Editorial overhead food photography of: ${mealName}.
Beautifully plated on a ceramic plate, on a warm wooden table with soft natural daylight from the side.
Shallow depth of field, fresh colorful whole-food ingredients visible, rustic minimal styling, magazine cookbook aesthetic.
No text, no logos, no people, no hands, no cutlery branding. Photorealistic, ultra detailed, soft shadows.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
    });
    if (!resp.ok) {
      console.warn(`Swap image gen failed for day ${dayNumber}: ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    const dataUrl: string | undefined =
      data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl?.startsWith("data:image/")) return null;

    const commaIdx = dataUrl.indexOf(",");
    const b64 = dataUrl.slice(commaIdx + 1);
    const mimeMatch = dataUrl.slice(0, commaIdx).match(/data:(image\/[a-zA-Z0-9.+-]+)/);
    const contentType = mimeMatch?.[1] ?? "image/png";
    const ext = contentType.split("/")[1]?.split("+")[0] ?? "png";

    const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    // Add a timestamp to bust any cached signed URLs from the previous image
    const path = `${userId}/meal-plans/${resourceId}/day-${dayNumber}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("resources")
      .upload(path, binary, { contentType, upsert: true });
    if (upErr) {
      console.warn(`Swap image upload failed for day ${dayNumber}: ${upErr.message}`);
      return null;
    }
    return path;
  } catch (err) {
    console.warn(`Swap image step crashed for day ${dayNumber}:`, err);
    return null;
  }
}
