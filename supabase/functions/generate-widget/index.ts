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
    const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId : null;

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

    let userEmail = userData.user.email;
    if (targetUserId && targetUserId !== userData.user.id) {
      const { data: role } = await supabaseService
        .from("user_roles")
        .select("id")
        .eq("user_id", userData.user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!role) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: targetProfile } = await supabaseService
        .from("profiles")
        .select("email")
        .eq("id", targetUserId)
        .maybeSingle();
      userEmail = targetProfile?.email || userEmail;
    }
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
      if (participant?.last_period_start && lifeStage !== "postpartum" && lifeStage !== "menopause" && lifeStage !== "irregular") {
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

    // Detect stale cycling (period overdue by > 14 days past expected length) — don't pretend to know a phase.
    let isStaleCycle = false;
    if (lifeStage === "cycling" && cycleLengthDays > 0) {
      // Recompute true days-since-start (unclamped) to detect overdue
      // Note: cycleDay above is clamped to 60 — we already know overdue if cycleDay >= cycleLengthDays + 14 OR if clamped at 60.
      if (cycleDay >= Math.min(60, cycleLengthDays + 14)) isStaleCycle = true;
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let stageContext: string;
    if (lifeStage === "postpartum") {
      const wk = postpartumWeeks ?? 0;
      stageContext = `The user is postpartum, currently ${wk} week${wk === 1 ? "" : "s"} since birth. They are NOT cycling. Do NOT mention any menstrual cycle phase (follicular, luteal, ovulation, menstruation). Frame guidance around postpartum recovery, healing, energy rebuild, sleep, and capacity at this specific week.`;
    } else if (lifeStage === "menopause") {
      stageContext = `The user is in menopause. They are NOT cycling. Do NOT mention any menstrual cycle phase. Frame guidance around menopause: hormonal shifts, energy, sleep, strength, and long-term health.`;
    } else if (lifeStage === "irregular") {
      stageContext = `The user is on hormonal birth control or has an irregular cycle. They are NOT naturally cycling — their hormones are externally regulated (or unpredictable). Do NOT mention any menstrual cycle phase (follicular, luteal, ovulation, menstruation), do NOT reference a cycle day number, and do NOT invent estrogen/progesterone-rising language. Frame guidance around steady-state levers: sleep, protein, strength training, stress, hydration, and micronutrients.`;
    } else if (isStaleCycle) {
      stageContext = `The user's tracked period is overdue (more than two weeks past their expected cycle length of ${cycleLengthDays} days). We do NOT know what phase they are in right now. Do NOT name a phase or day number. Frame guidance around general well-being and suggest they update their last period date when it starts.`;
    } else if (postpartumActive) {
      stageContext = `The user is cycling (Day ${cycleDay} of ${cycleLengthDays}, ${phase} phase) AND still recovering postpartum (${postpartumWeeks ?? 0} weeks since birth). Blend both contexts.`;
    } else {
      stageContext = `The user is on Day ${cycleDay} of ${cycleLengthDays} in their ${phase} phase.`;
    }

    const systemPrompt = `You are Logan, a life-stage-aware wellness assistant. ${stageContext}

Generate a single short, actionable insight (1-2 sentences max) based on the user's custom widget description below. Make it specific to their current state. Be warm but direct. No emojis. No fluff.`;

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
