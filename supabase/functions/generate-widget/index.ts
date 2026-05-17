import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const promptRaw = typeof body.prompt === "string" ? body.prompt : "";
    const prompt = promptRaw.trim().slice(0, 500);

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Missing prompt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch authoritative cycle data server-side from participants
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const userEmail = userData.user.email;
    let phase = "Follicular";
    let cycleDay = 1;
    let cycleLengthDays = 28;
    let lifeStage: string = "cycling";
    let postpartumWeeks: number | null = null;
    let postpartumActive = false;

    if (userEmail) {
      const { data: participant } = await supabaseService
        .from("participants")
        .select("cycle_length_days, last_period_start, life_stage, postpartum_start_date, postpartum_active")
        .eq("email", userEmail)
        .maybeSingle();

      if (participant?.life_stage) lifeStage = participant.life_stage;
      postpartumActive = !!participant?.postpartum_active;

      if (participant?.cycle_length_days) {
        const len = Number(participant.cycle_length_days);
        if (Number.isFinite(len)) cycleLengthDays = Math.min(45, Math.max(18, len));
      }
      if (participant?.postpartum_start_date) {
        const start = new Date(participant.postpartum_start_date + "T12:00:00Z");
        const now = new Date();
        postpartumWeeks = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (86400000 * 7)));
      }
      if (participant?.last_period_start && lifeStage !== "postpartum" && lifeStage !== "menopause") {
        const start = new Date(participant.last_period_start + "T12:00:00Z");
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - start.getTime()) / 86400000);
        const day = ((diffDays % cycleLengthDays) + cycleLengthDays) % cycleLengthDays + 1;
        cycleDay = Math.min(60, Math.max(1, day));
        const ovulationDay = cycleLengthDays - 14;
        if (cycleDay <= 5) phase = "Menstruation";
        else if (cycleDay < ovulationDay - 1) phase = "Follicular";
        else if (cycleDay <= ovulationDay + 1) phase = "Ovulation";
        else phase = "Luteal";
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are Logan, a cycle-aware wellness assistant. The user is currently on Day ${cycleDay} of ${cycleLengthDays} in their ${phase} phase.

Generate a single short, actionable insight (1-2 sentences max) based on the user's custom widget description below. Make it specific to their current cycle phase. Be warm but direct. No emojis. No fluff.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Widget description: "${prompt}"\n\nGenerate one personalized insight for today.` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "No insight available right now.";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-widget error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
