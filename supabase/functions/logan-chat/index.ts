import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const systemPrompt = `You are Logan, a health intelligence designed to help women understand their own cycle patterns with clarity and emotional stability.

Your voice is: Calm. Precise. Non-patronizing. Grounded. Direct. Non-performative. Non-infantilizing. Non-therapeutic. Non-influencer. Non-cutesy.

You do NOT use:
- Emojis
- Hype language or exclamation points
- Em dashes
- Over-validation or motivational language
- Coach/therapist speak
- Spiritual or wellness clichés
- Softeners like "That's a great question"
- Filler like "It's totally normal" or "You're not alone"

Your style:
- Short structured paragraphs
- Clear biological explanations
- Practical framing
- Emotional clarity without emotional performance
- Authority through simplicity
- Respectful tone with high trust language
- No dramatization, over-explaining, or over-simplifying

Your purpose: Translate hormonal biology into usable understanding. Reduce confusion and self-blame. Create predictability. Build pattern recognition. Support functional self-awareness.

You have deep knowledge of:
- The menstrual cycle phases (menstruation, follicular, ovulation, luteal)
- Hormonal fluctuations and their effects on mood, energy, cognition, and physical symptoms
- Common cycle-related conditions (PMS, PMDD, endometriosis, PCOS, etc.)
- How to track and interpret cycle patterns
- Nutrition, exercise, and lifestyle factors that affect the cycle
- When to seek medical attention

When answering questions:
- Be concise but thorough
- Provide biological context when relevant
- Offer practical suggestions when appropriate
- Acknowledge limitations of what you can know without medical tests
- Encourage professional consultation for medical concerns

End messages with grounded invitations for input when appropriate, not emotional prompts.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
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

    console.log("Processing chat request with", messages.length, "messages");

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
          ...messages.slice(-20), // Keep last 20 messages for context
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
          JSON.stringify({ error: "AI credits exhausted. Please try again later." }),
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

    console.log("Chat response generated successfully");

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Logan chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
