import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_IMAGES = 6;
const PER_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const PER_PDF_MAX_BYTES = 20 * 1024 * 1024;

type Marker = {
  name: string;
  marker_key?: string;
  value_numeric?: number | null;
  value_text?: string | null;
  unit?: string | null;
  ref_low?: number | null;
  ref_high?: number | null;
  flag?: "low" | "normal" | "high" | "critical" | null;
  category?: string | null;
};

const SYSTEM_PROMPT = `You are a medical lab-report extractor. Read photos or screenshots of blood test results and return STRICT JSON ONLY (no prose, no markdown).

Schema:
{
  "taken_on": "YYYY-MM-DD" | null,
  "lab_name": "string" | null,
  "markers": [
    {
      "name": "Ferritin",
      "marker_key": "ferritin",
      "value_numeric": 28.4,
      "value_text": null,
      "unit": "ng/mL",
      "ref_low": 15,
      "ref_high": 150,
      "flag": "low" | "normal" | "high" | "critical" | null,
      "category": "iron" | "thyroid" | "hormones" | "metabolic" | "lipids" | "vitamins" | "cbc" | "kidney" | "liver" | "inflammation" | "other"
    }
  ]
}

Rules:
- marker_key is a normalized lowercase snake_case key (e.g. "vitamin_d_25oh", "tsh", "estradiol", "hba1c", "ldl", "hdl", "ferritin", "hemoglobin").
- Include reference range when visible. Use null when not present.
- Set flag based on the report's H/L markings if visible; otherwise compute from value vs ref range.
- If a value is qualitative (e.g. "Negative"), put it in value_text and leave value_numeric null.
- If you can't read the date, return null.
- Output JSON only.`;

async function callGemini(imageParts: { type: "image_url"; image_url: { url: string } }[]) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("Missing LOVABLE_API_KEY");

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all blood test markers visible across these images. Return JSON only." },
            ...imageParts,
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error("Gemini error", resp.status, txt);
    throw new Error(`AI extraction failed (${resp.status})`);
  }
  const json = await resp.json();
  const raw: string = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON returned from AI");
  return JSON.parse(match[0]) as { taken_on?: string | null; lab_name?: string | null; markers?: Marker[] };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const imagePaths: string[] = Array.isArray(body.image_paths)
      ? body.image_paths
          .filter((p: unknown) => typeof p === "string" && (p as string).startsWith(`${userId}/`))
          .slice(0, MAX_IMAGES)
      : [];

    if (!imagePaths.length) {
      return new Response(JSON.stringify({ error: "Add at least one image of your blood test." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Build image parts
    const imageParts: { type: "image_url"; image_url: { url: string } }[] = [];
    for (const p of imagePaths) {
      const { data: blob } = await admin.storage.from("history-imports").download(p);
      if (!blob) continue;
      if (blob.size > PER_IMAGE_MAX_BYTES) continue;
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const b64 = btoa(bin);
      const mime = blob.type || "image/png";
      imageParts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } });
    }
    if (!imageParts.length) {
      return new Response(JSON.stringify({ error: "Could not read those images." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let extracted: { taken_on?: string | null; lab_name?: string | null; markers?: Marker[] };
    try {
      extracted = await callGemini(imageParts);
    } catch (e) {
      console.error(e);
      return new Response(JSON.stringify({ error: "Logan couldn't read those lab results. Try clearer photos." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const markers = (extracted.markers ?? []).filter((m) => m && m.name);
    if (!markers.length) {
      return new Response(JSON.stringify({ error: "No markers detected. Try a clearer photo of the results table." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert panel
    const { data: panel, error: panelErr } = await admin
      .from("lab_panels")
      .insert({
        user_id: userId,
        taken_on: extracted.taken_on || null,
        lab_name: extracted.lab_name || null,
        source: "upload",
        storage_path: imagePaths[0],
      })
      .select()
      .single();
    if (panelErr || !panel) throw panelErr ?? new Error("Could not create panel");

    // Insert markers
    const rows = markers.slice(0, 200).map((m) => ({
      panel_id: panel.id,
      user_id: userId,
      name: String(m.name).slice(0, 200),
      marker_key: m.marker_key ? String(m.marker_key).toLowerCase().slice(0, 100) : null,
      value_numeric: typeof m.value_numeric === "number" && Number.isFinite(m.value_numeric) ? m.value_numeric : null,
      value_text: m.value_text ? String(m.value_text).slice(0, 200) : null,
      unit: m.unit ? String(m.unit).slice(0, 50) : null,
      ref_low: typeof m.ref_low === "number" && Number.isFinite(m.ref_low) ? m.ref_low : null,
      ref_high: typeof m.ref_high === "number" && Number.isFinite(m.ref_high) ? m.ref_high : null,
      flag: m.flag && ["low", "normal", "high", "critical"].includes(m.flag) ? m.flag : null,
      category: m.category ? String(m.category).slice(0, 50) : null,
    }));
    const { error: mErr } = await admin.from("lab_markers").insert(rows);
    if (mErr) throw mErr;

    // Build summary for recap
    const flagged = rows.filter((r) => r.flag === "low" || r.flag === "high" || r.flag === "critical");
    const flaggedSummary = flagged
      .slice(0, 6)
      .map((r) => `${r.name} ${r.flag}${r.value_numeric != null ? ` (${r.value_numeric}${r.unit ? " " + r.unit : ""})` : ""}`)
      .join(", ");
    const facts = [
      `${rows.length} markers extracted`,
      extracted.taken_on ? `dated ${extracted.taken_on}` : null,
      flaggedSummary ? `flagged: ${flaggedSummary}` : "all in range or unflagged",
    ].filter(Boolean).join(" · ");

    let recapText = `Got your blood test (${facts}). I'll factor this into your recommendations from here.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY) {
      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: "You are Logan, a knowledgeable, grounded friend guiding women's health. Reply in 2-4 short sentences. NEVER use bullets, lists, headers, or emojis. Warm but direct. Grace over guilt. Never give medical diagnoses; phrase as patterns and questions to bring to a clinician.",
              },
              {
                role: "user",
                content: `I just imported the user's blood test. Acknowledge what you saw and call out the most useful pattern (especially if anything is flagged low or high) without diagnosing. Facts: ${facts}.`,
              },
            ],
          }),
        });
        if (aiResp.ok) {
          const ai = await aiResp.json();
          const content = ai.choices?.[0]?.message?.content;
          if (content) recapText = content.trim();
        }
      } catch (e) {
        console.error("recap AI error", e);
      }
    }

    await admin.from("chat_messages").insert({
      user_id: userId,
      role: "assistant",
      content: recapText,
      message_type: "text",
      metadata: { source: "blood_test_import", panel_id: panel.id, marker_count: rows.length },
    });

    // Best-effort cleanup
    admin.storage.from("history-imports").remove(imagePaths).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        panel_id: panel.id,
        marker_count: rows.length,
        flagged_count: flagged.length,
        taken_on: extracted.taken_on ?? null,
        recap: recapText,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("import-blood-test error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
