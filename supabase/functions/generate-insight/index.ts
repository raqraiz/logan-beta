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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate user
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if onboarding is complete
    const { data: messages } = await supabase
      .from("chat_messages")
      .select("metadata")
      .eq("user_id", user.id)
      .not("metadata", "is", null);

    const onboardingComplete = messages?.some(
      (m: any) => m.metadata?.onboarding_complete === true
    );

    if (!onboardingComplete) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "onboarding_incomplete" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if we already sent a proactive insight today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: recentInsights } = await supabase
      .from("chat_messages")
      .select("id, created_at, metadata")
      .eq("user_id", user.id)
      .eq("role", "assistant")
      .gte("created_at", todayStart.toISOString());

    const alreadySentToday = recentInsights?.some(
      (m: any) => m.metadata?.insight_type === "proactive"
    );

    if (alreadySentToday) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "already_sent_today" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get participant data
    const { data: participant } = await supabase
      .from("participants")
      .select("*")
      .eq("email", user.email)
      .single();

    if (!participant) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_participant" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate cycle info
    const cycleInfo = calculateCycleInfo(
      participant.last_period_start,
      participant.cycle_length_days
    );

    if (!cycleInfo) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_cycle_data" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    // Get recent conversation context
    const { data: recentMessages } = await supabase
      .from("chat_messages")
      .select("content, role")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    // Generate AI insight
    const prompt = buildInsightPrompt(
      profile?.full_name || "there",
      cycleInfo,
      participant,
      recentMessages || []
    );

    const { insight, conversationStarters } = await generateAIInsight(lovableApiKey, prompt);

    // Insert the insight as a chat message
    await supabase.from("chat_messages").insert({
      user_id: user.id,
      role: "assistant",
      content: insight,
      message_type: "text",
      metadata: {
        has_cycle_visual: true,
        cycle_day: cycleInfo.cycleDay,
        cycle_phase: cycleInfo.phase,
        cycle_length_days: participant.cycle_length_days || 28,
        insight_type: "proactive",
        generated_at: new Date().toISOString(),
        conversation_starters: conversationStarters
      }
    });

    return new Response(
      JSON.stringify({ success: true, generated: true }),
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

function calculateCycleInfo(
  lastPeriodStart: string | null,
  cycleLengthDays: number | null
): { cycleDay: number; phase: string; daysUntilNextPhase: number } | null {
  if (!lastPeriodStart || !cycleLengthDays) return null;

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
  let daysUntilNextPhase: number;

  if (cycleDay <= menstruationEnd) {
    phase = "Menstruation";
    daysUntilNextPhase = menstruationEnd - cycleDay + 1;
  } else if (cycleDay < ovulationStart) {
    phase = "Follicular";
    daysUntilNextPhase = ovulationStart - cycleDay;
  } else if (cycleDay <= ovulationEnd) {
    phase = "Ovulation";
    daysUntilNextPhase = ovulationEnd - cycleDay + 1;
  } else {
    phase = "Luteal";
    daysUntilNextPhase = cycleLengthDays - cycleDay + 1;
  }

  return { cycleDay, phase, daysUntilNextPhase };
}

function buildInsightPrompt(
  userName: string,
  cycleInfo: { cycleDay: number; phase: string; daysUntilNextPhase: number },
  participant: Record<string, any>,
  recentMessages: { content: string; role: string }[]
): string {
  const anchorSymptom = participant.anchor_symptom;
  const symptoms = participant.typical_symptoms || [];

  return `You are Logan, a strategic, performance-focused cycle awareness coach. Write a proactive check-in message for ${userName.split(" ")[0]}.

Current cycle state:
- Day ${cycleInfo.cycleDay} of their cycle
- Phase: ${cycleInfo.phase}
- Days until next phase: ${cycleInfo.daysUntilNextPhase}

User profile:
- Anchor symptom (most disruptive): ${anchorSymptom || "not specified"}
- Common symptoms: ${symptoms.join(", ") || "not specified"}

Recent conversation context:
${recentMessages.map(m => `${m.role}: ${m.content.slice(0, 100)}`).join("\n") || "No recent messages"}

Guidelines for the insight:
1. Use markdown formatting: **bold** for key points, bullet points for tips
2. Structure it as:
   - One short sentence about where they are today (bold the phase name)
   - 2-3 bullet points: what to expect, one action item, and optionally their anchor symptom
3. Be specific and tactical, not generic wellness advice
4. Use a warm but direct tone - you're a coach, not a friend
5. Do NOT include greetings like "Hi" or "Hey" - get straight to the insight
6. Do NOT use emojis or exclamation points

Example format:
"Day 18, deep in **luteal**. Progesterone is peaking.

- **Energy**: expect a dip this afternoon — schedule lighter work after 2pm
- **Watch for**: your brain fog tends to spike around now
- **Try this**: 10-minute walk after lunch to reset focus"

IMPORTANT: Respond in this exact JSON format:
{
  "insight": "Your markdown-formatted insight here",
  "starters": ["Short reply 1", "Short reply 2", "Short reply 3"]
}

The "starters" should be 3 natural conversation replies the user might want to send back (3-6 words each).`;
}

async function generateAIInsight(apiKey: string, prompt: string): Promise<{ insight: string; conversationStarters: string[] }> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You are Logan, a cycle-aware performance coach. Be concise, tactical, and helpful. Always respond in valid JSON format." },
        { role: "user", content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  try {
    const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleanContent);
    return {
      insight: parsed.insight || "How are you feeling today?",
      conversationStarters: parsed.starters || ["I'm doing well", "Not great today", "Tell me more"]
    };
  } catch (e) {
    console.error("Failed to parse AI response as JSON:", content);
    return {
      insight: content || "How are you feeling today?",
      conversationStarters: ["I'm doing well", "Not great today", "Tell me more"]
    };
  }
}
