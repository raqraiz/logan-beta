import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are Logan, an intelligent menstrual cycle companion. You help women understand and work WITH their cycle, not against it.

Your role in this trial conversation:
- Answer questions about menstrual cycles, phases, hormones, and symptoms knowledgeably
- Explain how cycle awareness can help with training, work, mood, and energy management
- Be warm, supportive, and conversational
- Keep responses concise (2-3 sentences max for simple questions, up to 5 for complex ones)
- Use simple language, avoid medical jargon unless explaining a term
- Occasionally mention that you can provide personalized insights once the user creates an account

Key knowledge:
- Menstrual cycle phases: Menstrual (days 1-5), Follicular (days 6-13), Ovulation (days 14-17), Luteal (days 18-28)
- The luteal phase is the ~14 days after ovulation, before the next period. Progesterone rises, which can cause PMS symptoms like mood changes, bloating, fatigue, and cravings.
- Ovulation typically happens around day 14 of a 28-day cycle
- Energy and estrogen peak during late follicular/ovulation
- The luteal phase often brings lower energy, need for more rest and recovery

IMPORTANT RULES:
- Never provide medical advice or diagnoses
- Don't use exclamation points excessively
- Be encouraging but not over-the-top
- If asked something outside your scope, gently redirect to cycle-related topics`;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Messages array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format messages for the AI
    const formattedMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    ];

    // Call Lovable AI
    const response = await fetch("https://api.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: formattedMessages,
        max_tokens: 300,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || 
      "I'd love to help you understand your cycle better. Could you tell me more about what you'd like to know?";

    console.log("Trial chat response generated successfully");

    return new Response(
      JSON.stringify({ response: aiResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Trial chat error:", error);
    
    // Fallback response if AI fails
    return new Response(
      JSON.stringify({ 
        response: "Great question. I help women understand their menstrual cycle phases and how they affect energy, mood, and performance. Would you like to learn about a specific phase, or are you curious about how cycle awareness can help with something in your life?" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
