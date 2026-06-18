import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeRequest {
  imageBase64?: string; // data URL or raw base64
  imageMimeType?: string;
  description?: string;
  portionNote?: string;
}

interface MealResult {
  name: string;
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: "low" | "medium" | "high";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: AnalyzeRequest = await req.json();
    const { imageBase64, imageMimeType, description, portionNote } = body;
    if (!imageBase64 && !description) {
      return new Response(JSON.stringify({ error: "Provide an image or description" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are a nutrition estimation assistant. Analyze the meal and return ONLY valid JSON in this exact shape (no markdown, no commentary):
{
  "name": "short dish name",
  "description": "one-line plain English of what's in the meal and approximate portion",
  "calories": integer kcal,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "confidence": "low" | "medium" | "high"
}
Rules:
- Estimate realistic single-serving values for an adult woman unless portion clearly differs.
- If unsure of portion, assume a typical serving and mark confidence "low" or "medium".
- Macros should roughly reconcile with calories (4/4/9 kcal per g).
- Be specific in name (e.g. "Grilled chicken Caesar salad" not "Salad").`;

    const userParts: any[] = [];
    if (description) userParts.push({ type: "text", text: `User description: ${description}` });
    if (portionNote) userParts.push({ type: "text", text: `Portion note: ${portionNote}` });
    if (imageBase64) {
      const url = imageBase64.startsWith("data:")
        ? imageBase64
        : `data:${imageMimeType || "image/jpeg"};base64,${imageBase64}`;
      userParts.push({ type: "image_url", image_url: { url } });
    }
    if (userParts.length === 0) userParts.push({ type: "text", text: "Analyze this meal." });

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userParts },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (res.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI error", detail: text }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    let parsed: MealResult;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Could not parse model output");
      parsed = JSON.parse(match[0]);
    }

    const safe: MealResult = {
      name: String(parsed.name || "Meal").slice(0, 120),
      description: String(parsed.description || "").slice(0, 500),
      calories: Math.max(0, Math.round(Number(parsed.calories) || 0)),
      protein_g: Math.max(0, Number(parsed.protein_g) || 0),
      carbs_g: Math.max(0, Number(parsed.carbs_g) || 0),
      fat_g: Math.max(0, Number(parsed.fat_g) || 0),
      confidence: (["low", "medium", "high"].includes(parsed.confidence) ? parsed.confidence : "medium") as MealResult["confidence"],
    };

    return new Response(JSON.stringify(safe), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-meal error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
