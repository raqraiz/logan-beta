import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { differenceInDays } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type CyclePhase = "Menstruation" | "Follicular" | "Ovulation" | "Luteal";

interface CycleInfo {
  day: number;
  phase: CyclePhase;
  daysUntilNextPhase: number;
  nextPhase: CyclePhase;
}

function getCycleInfo(lastPeriodStart: string | null, cycleLengthDays: number | null): CycleInfo | null {
  if (!lastPeriodStart || !cycleLengthDays) return null;

  const today = new Date();
  const periodStart = new Date(lastPeriodStart);
  const daysSinceStart = differenceInDays(today, periodStart);
  
  // Calculate current day in cycle (1-indexed, wrapping around)
  const currentDay = ((daysSinceStart % cycleLengthDays) + cycleLengthDays) % cycleLengthDays + 1;

  // Phase boundaries - same logic as CycleCircle.tsx
  const menstruationEnd = 5;
  const ovulationDay = cycleLengthDays - 14;
  const ovulationStart = ovulationDay - 1;
  const ovulationEnd = ovulationDay + 2;
  const lutealStart = ovulationEnd + 1;

  let phase: CyclePhase;
  let daysUntilNextPhase: number;
  let nextPhase: CyclePhase;

  if (currentDay <= menstruationEnd) {
    phase = "Menstruation";
    daysUntilNextPhase = menstruationEnd - currentDay + 1;
    nextPhase = "Follicular";
  } else if (currentDay < ovulationStart) {
    phase = "Follicular";
    daysUntilNextPhase = ovulationStart - currentDay;
    nextPhase = "Ovulation";
  } else if (currentDay <= ovulationEnd) {
    phase = "Ovulation";
    daysUntilNextPhase = ovulationEnd - currentDay + 1;
    nextPhase = "Luteal";
  } else {
    phase = "Luteal";
    daysUntilNextPhase = cycleLengthDays - currentDay + 1;
    nextPhase = "Menstruation";
  }

  return { day: currentDay, phase, daysUntilNextPhase, nextPhase };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { participantId, insightType } = await req.json();

    if (!participantId) {
      return new Response(
        JSON.stringify({ error: "participantId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get participant data
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .select("*")
      .eq("id", participantId)
      .single();

    if (participantError || !participant) {
      console.error("Participant not found:", participantError);
      return new Response(
        JSON.stringify({ error: "Participant not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate current cycle phase using the SAME logic as the UI
    const cycleInfo = getCycleInfo(participant.last_period_start, participant.cycle_length_days);

    // Get recent cycle updates for context
    const { data: recentUpdates } = await supabase
      .from("cycle_updates")
      .select("*")
      .eq("participant_id", participantId)
      .order("created_at", { ascending: false })
      .limit(5);

    // Get recent feedback for personalization
    const { data: recentFeedback } = await supabase
      .from("feedback")
      .select("*")
      .eq("participant_id", participantId)
      .order("created_at", { ascending: false })
      .limit(3);

    // Build insight type specific instructions
    const insightTypeInstructions = {
      awareness: "Educate them about what's happening in their body during this specific phase. Explain the biology in accessible terms. Help them understand WHY they might feel certain ways.",
      pattern: "Share a personal observation about their data. Use phrases like 'We noticed...' or 'Looking at your cycle...' to show you're paying attention to THEIR specific patterns.",
      validation: "Normalize their experience. Acknowledge that what they're feeling is real and valid. Provide emotional support without toxic positivity.",
      action: "Give ONE specific, actionable recommendation based on their current phase and patterns. Be concrete - not 'try to rest' but 'consider a 20-minute walk after lunch'.",
    };

    const systemPrompt = `You are Logan, a warm, empathetic, and knowledgeable women's health companion. You provide personalized insights about menstrual cycles with a tone that is supportive, encouraging, and non-clinical.

Guidelines:
- Be warm and conversational, like a caring friend
- Use emojis sparingly but meaningfully (1-2 per message)
- Keep messages concise but impactful (under 200 words)
- CRITICAL: Base ALL phase references on the EXACT phase data provided - do not calculate or guess phases
- Acknowledge the unique experience of each person
- Include actionable tips when appropriate
- End with an invitation to share feedback or updates`;

    const cycleContext = cycleInfo 
      ? `CURRENT CYCLE STATUS (use this exactly, do not calculate):
- Current cycle day: ${cycleInfo.day} of ${participant.cycle_length_days}
- Current phase: ${cycleInfo.phase}
- Days until next phase (${cycleInfo.nextPhase}): ${cycleInfo.daysUntilNextPhase}`
      : "Cycle data not available - focus on general wellness";

    const userPrompt = `Generate a "${insightType}" insight for ${participant.full_name}.

${cycleContext}

Their profile:
- Age: ${participant.age || "not specified"}
- Cycle regularity: ${participant.cycle_regularity || "regular"}
- Common symptoms: ${participant.typical_symptoms?.join(", ") || "none specified"}
- Goals: ${participant.goals?.join(", ") || "general wellness"}
- Anchor symptom: ${participant.anchor_symptom || "none specified"}

${recentUpdates?.length ? `Recent updates they've shared:
${recentUpdates.map(u => `- ${u.description} (${u.category})`).join("\n")}` : ""}

${recentFeedback?.length ? `Recent feedback patterns:
${recentFeedback.map(f => `- ${f.is_useful ? "Found useful" : "Not useful"}, emotion: ${f.emotion || "not shared"}`).join("\n")}` : ""}

Insight type guidance: ${insightTypeInstructions[insightType as keyof typeof insightTypeInstructions] || insightTypeInstructions.awareness}

IMPORTANT: When referring to their cycle phase, use EXACTLY "${cycleInfo?.phase || 'their current'}" phase. Do not say "late luteal", "early follicular", etc. unless the day number clearly indicates it.`;

    console.log("Generating insight for participant:", participant.full_name);

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
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add more credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    console.log("Insight generated successfully");

    return new Response(
      JSON.stringify({ content, prompt: userPrompt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate insight error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
