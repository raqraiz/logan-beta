// Suggests a set of categorical options for a user-defined tracker.
// Used by AddTrackerDialog when the user picks "Choose one" type.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface Body {
  name?: string;
  description?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body: Body = await req.json().catch(() => ({}));
    const name = (body.name || "").trim().slice(0, 80);
    const description = (body.description || "").trim().slice(0, 200);
    if (!name) {
      return new Response(JSON.stringify({ error: "name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "missing key" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sys = `You suggest 3-6 short categorical options a woman might pick when logging "${name}" daily to correlate with her menstrual cycle. Return ONLY a JSON object {"options": ["…","…"]}. Each option <= 18 chars. Mutually exclusive. Cover the meaningful range. Examples:
- "Cervical fluid" -> Dry, Sticky, Creamy, Egg-white, Watery, Spotting
- "Cervix position" -> Low, Mid, High
- "Mood" -> Low, Flat, Steady, Bright, Elated
- "Sleep" -> Awful, Restless, Okay, Solid, Deep
Do not add commentary.`;

    const userPrompt = description ? `${name}: ${description}` : name;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: "ai failed", detail: t.slice(0, 200) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { options?: unknown } = {};
    try { parsed = JSON.parse(raw); } catch { /* ignore */ }
    const options = Array.isArray(parsed.options)
      ? parsed.options.map((o) => String(o).trim().slice(0, 24)).filter(Boolean).slice(0, 6)
      : [];

    return new Response(JSON.stringify({ options }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
