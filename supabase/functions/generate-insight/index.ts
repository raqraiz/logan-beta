import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const systemPrompt = `You are Logan, a warm, empathetic, and knowledgeable women's health companion. You provide personalized insights about menstrual cycles with a tone that is supportive, encouraging, and non-clinical.

Guidelines:
- Be warm and conversational, like a caring friend
- Use emojis sparingly but meaningfully (1-2 per message)
- Keep messages concise but impactful (under 200 words)
- Base insights on the participant's specific data
- Acknowledge the unique experience of each person
- If giving predictions, explain your reasoning gently
- Include actionable tips when appropriate
- End with an invitation to share feedback or updates`;

    const userPrompt = `Generate a ${insightType || "recommendation"} for ${participant.full_name}.

Their profile:
- Age: ${participant.age || "not specified"}
- Cycle length: ${participant.cycle_length_days || 28} days
- Regularity: ${participant.cycle_regularity || "regular"}
- Last period start: ${participant.last_period_start || "not tracked"}
- Common symptoms: ${participant.typical_symptoms?.join(", ") || "none specified"}
- Goals: ${participant.goals?.join(", ") || "general wellness"}

${recentUpdates?.length ? `Recent updates they've shared:
${recentUpdates.map(u => `- ${u.description} (${u.category})`).join("\n")}` : ""}

${recentFeedback?.length ? `Recent feedback patterns:
${recentFeedback.map(f => `- ${f.is_useful ? "Found useful" : "Not useful"}, emotion: ${f.emotion || "not shared"}`).join("\n")}` : ""}

Create a personalized ${insightType === "prediction" ? "cycle prediction" : insightType === "check_in" ? "wellness check-in" : "health recommendation"} that feels tailored specifically to them. Remember to be warm, concise, and actionable.`;

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
