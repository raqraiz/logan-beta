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
    const { feedbackId } = await req.json();

    if (!feedbackId) {
      return new Response(
        JSON.stringify({ error: "feedbackId is required" }),
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get feedback with related data
    const { data: feedback, error: feedbackError } = await supabase
      .from("feedback")
      .select(`
        *,
        participants(full_name, typical_symptoms, goals, anchor_symptom, cycle_regularity, last_period_start, cycle_length_days),
        insights(content, insight_type)
      `)
      .eq("id", feedbackId)
      .single();

    if (feedbackError || !feedback) {
      console.error("Feedback not found:", feedbackError);
      return new Response(
        JSON.stringify({ error: "Feedback not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get recent conversation history for context
    const { data: recentFeedback } = await supabase
      .from("feedback")
      .select("*, insights(content)")
      .eq("participant_id", feedback.participant_id)
      .order("created_at", { ascending: false })
      .limit(5);

    const participant = feedback.participants;
    const originalInsight = feedback.insights;

    const systemPrompt = `You are Logan, a health intelligence that transforms cycle tracking into strategic decision support for women.

WHAT LOGAN IS:
- Intelligent performance guidance, not passive tracking
- Proactive, hyper-personalized insights you can act on
- Direction, not just awareness. Strategy, not just data.
- Helps users plan smarter around their cycle: when to push, when to protect, when to rest, when to communicate differently

CRITICAL CONSTRAINTS:
- Maximum 3 sentences total. No exceptions.
- NEVER use emojis. Not one.
- This is a REPLY to their feedback, so acknowledge what they shared.

Your voice is: Strategic. Precise. Non-patronizing. Grounded. Direct. Like a smart friend who happens to know a lot about biology.

You do NOT use:
- Emojis (STRICTLY FORBIDDEN)
- Exclamation points
- Em dashes
- Over-validation or motivational language
- Softeners, clinical jargon, or filler phrases

Your style:
- Maximum 3 sentences, then stop
- Focus on practical, actionable framing
- Speak to energy, focus, training, work, relationships, recovery
- Authority through simplicity

REPLY GUIDELINES:
1. Acknowledge their feedback authentically (not just "thanks for sharing")
2. If they shared something specific, respond to THAT specifically with strategic context
3. End with a forward-looking insight about what's coming or what to adjust
4. Be warm but not effusive, like a trusted advisor`;

    const conversationContext = recentFeedback?.map(f => {
      let entry = `Original insight: ${f.insights?.content || 'N/A'}`;
      if (f.free_form_text) entry += `\nUser response: ${f.free_form_text}`;
      if (f.emotion) entry += ` (felt: ${f.emotion})`;
      if (f.admin_reply) entry += `\nLogan reply: ${f.admin_reply}`;
      return entry;
    }).join("\n\n---\n\n") || "";

    const userPrompt = `Generate a reply to ${participant?.full_name || "this participant"}'s feedback.

ORIGINAL INSIGHT SENT:
"${originalInsight?.content || 'N/A'}"

THEIR FEEDBACK:
- Emoji reaction: ${feedback.emoji_reaction || "none"}
- Found useful: ${feedback.is_useful === null ? "not answered" : feedback.is_useful ? "yes" : "no"}
- Emotion: ${feedback.emotion || "not shared"}
- Action taken: ${feedback.action_taken === null ? "not answered" : feedback.action_taken ? "yes" : "no"}
- Improvement suggestion: ${feedback.improvement_suggestion || "none"}
- Free-form response: ${feedback.free_form_text || "none"}

${participant ? `PARTICIPANT CONTEXT:
- Common symptoms: ${participant.typical_symptoms?.join(", ") || "none specified"}
- Goals: ${participant.goals?.join(", ") || "general wellness"}
- Anchor symptom: ${participant.anchor_symptom || "none specified"}` : ""}

${conversationContext ? `RECENT CONVERSATION HISTORY:\n${conversationContext}` : ""}

Write a thoughtful reply that acknowledges their specific feedback and maintains the conversational thread.`;

    console.log("Generating reply for feedback:", feedbackId);

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

    console.log("Reply generated successfully");

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Generate reply error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
