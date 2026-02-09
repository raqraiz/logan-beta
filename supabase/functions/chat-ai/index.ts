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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    if (!lovableApiKey) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with the user's auth token to validate it
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Validate the user's JWT
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();

    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { userMessage } = body;

    if (!userMessage || typeof userMessage !== "string") {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Chat AI request from user:", user.id, "message:", userMessage.substring(0, 50));

    // Get participant data for context
    const { data: participant } = await supabase
      .from("participants")
      .select("*")
      .eq("email", user.email)
      .single();

    // Get recent chat history (last 20 messages for context)
    const { data: recentMessages } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Calculate cycle info
    const cycleInfo = participant?.last_period_start && participant?.cycle_length_days
      ? calculateCycleInfo(participant.last_period_start, participant.cycle_length_days)
      : null;

    // Build system prompt with user context
    const systemPrompt = buildSystemPrompt(participant, cycleInfo);

    // Format conversation history for AI
    const conversationHistory = (recentMessages || [])
      .reverse()
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }));

    // Add current message
    conversationHistory.push({ role: "user", content: userMessage });

    console.log("Calling Lovable AI with", conversationHistory.length, "messages");

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory
        ],
        temperature: 0.7,
        max_tokens: 300
      }),
    });

    if (!aiResponse.ok) {
      const errorStatus = aiResponse.status;
      console.error("AI gateway error:", errorStatus);
      
      if (errorStatus === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (errorStatus === 402) {
        return new Response(
          JSON.stringify({ error: "AI service unavailable. Please try again later." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to generate response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const assistantMessage = aiData.choices?.[0]?.message?.content || "I'm not sure how to respond to that. Could you try rephrasing?";

    console.log("AI response generated, length:", assistantMessage.length);

    // Save the assistant's response to the database
    const { error: insertError } = await supabase.from("chat_messages").insert({
      user_id: user.id,
      role: "assistant",
      content: assistantMessage,
      message_type: "text",
      metadata: cycleInfo ? {
        cycle_day: cycleInfo.cycleDay,
        cycle_phase: cycleInfo.phase
      } : {}
    });

    if (insertError) {
      console.error("Error saving assistant message:", insertError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: assistantMessage,
        cycleInfo: cycleInfo
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Chat AI error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Build personalized system prompt
function buildSystemPrompt(
  participant: any | null, 
  cycleInfo: { cycleDay: number; phase: string } | null
): string {
  const basePrompt = `You are Logan, a strategic, cycle-aware performance advisor for women. Your role is to provide personalized, actionable insights that help users optimize their energy, focus, and recovery based on where they are in their menstrual cycle.

VOICE & STYLE:
- Direct, warm, and grounded. Not overly enthusiastic or clinical.
- Use "you" not "we". Speak like a knowledgeable coach, not a friend.
- Keep responses concise: 2-3 sentences max unless more detail is clearly needed.
- Never use emojis, exclamation points, or em dashes.
- NEVER use markdown formatting like asterisks, bold, or bullet points. Write in plain, flowing sentences.
- End with a specific, actionable suggestion or question when relevant.

CORE KNOWLEDGE:
- Menstruation (Days 1-5): Low energy, inflammation peaks. Prioritize rest and light movement.
- Follicular (Days 6-13): Estrogen rises. Good for new projects, social energy, challenging work.
- Ovulation (Around Day 14): Peak social confidence and verbal fluency. Great for communication.
- Luteal (Days 15-28): Progesterone dominant. Lower stress tolerance, need more recovery time.`;

  if (!participant || !cycleInfo) {
    return basePrompt + "\n\nNote: User hasn't completed onboarding yet. Provide general guidance and encourage them to share their cycle details for personalized insights.";
  }

  const userContext = `

USER CONTEXT:
- Current cycle day: ${cycleInfo.cycleDay}
- Current phase: ${cycleInfo.phase}
- Cycle length: ${participant.cycle_length_days || 28} days
- Age: ${participant.age || "unknown"}
- Anchor symptom (most disruptive): ${participant.anchor_symptom || "not specified"}
- Typical symptoms: ${participant.typical_symptoms?.join(", ") || "not specified"}

Use this context to make your responses personally relevant. Reference their current phase and how it might affect their request. If they mention their anchor symptom, acknowledge it and provide phase-appropriate guidance.`;

  return basePrompt + userContext;
}

// Calculate cycle day and phase
function calculateCycleInfo(
  lastPeriodStart: string,
  cycleLengthDays: number
): { cycleDay: number; phase: string } {
  const today = new Date();
  const periodStart = new Date(lastPeriodStart);
  const diffTime = today.getTime() - periodStart.getTime();
  const daysSinceStart = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  const cycleDay = ((daysSinceStart % cycleLengthDays) + cycleLengthDays) % cycleLengthDays + 1;

  const menstruationEnd = 5;
  const ovulationDay = cycleLengthDays - 14;
  const ovulationStart = ovulationDay - 1;
  const ovulationEnd = ovulationDay + 2;

  let phase: string;

  if (cycleDay <= menstruationEnd) {
    phase = "Menstruation";
  } else if (cycleDay < ovulationStart) {
    phase = "Follicular";
  } else if (cycleDay <= ovulationEnd) {
    phase = "Ovulation";
  } else {
    phase = "Luteal";
  }

  return { cycleDay, phase };
}
