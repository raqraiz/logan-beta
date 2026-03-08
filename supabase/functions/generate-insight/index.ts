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

    // Check if we already sent (or are generating) a proactive insight today
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

    // Race-condition guard: insert a placeholder row first, then generate.
    // If another request already inserted a placeholder in the last 30 seconds, skip.
    const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
    const { data: recentPlaceholders } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "assistant")
      .gte("created_at", thirtySecondsAgo)
      .contains("metadata", { insight_type: "proactive" });

    if (recentPlaceholders && recentPlaceholders.length > 0) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "already_generating" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert a placeholder to claim the slot
    const { data: placeholder, error: placeholderError } = await supabase
      .from("chat_messages")
      .insert({
        user_id: user.id,
        role: "assistant",
        content: "...",
        message_type: "text",
        metadata: {
          insight_type: "proactive",
          placeholder: true,
          generated_at: new Date().toISOString(),
        }
      })
      .select("id")
      .single();

    if (placeholderError || !placeholder) {
      console.error("Failed to insert placeholder:", placeholderError);
      return new Response(
        JSON.stringify({ error: "Failed to reserve insight slot" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const placeholderId = placeholder.id;

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

    // Check if user is in late luteal (last 3 days of cycle) — ask about period
    const isLateLuteal = cycleInfo.phase === "Luteal" && cycleInfo.daysUntilNextPhase <= 3;
    // Also check if user is "overdue" — cycle day > cycle length
    const isOverdue = cycleInfo.cycleDay > (participant.cycle_length_days || 28);

    if (isLateLuteal || isOverdue) {
      const dayLabel = isOverdue
        ? `Day ${cycleInfo.cycleDay} — that's ${cycleInfo.cycleDay - (participant.cycle_length_days || 28)} days past your expected cycle length`
        : `Day ${cycleInfo.cycleDay}, wrapping up **luteal**`;

      const checkinContent = `${dayLabel}. Your period could arrive any time now.\n\nHas it started yet? If so, I'll reset your cycle so everything stays accurate — your insights, your phase, all of it.`;

      await supabase.from("chat_messages").update({
        content: checkinContent,
        metadata: {
          has_cycle_visual: true,
          visual_type: "cycle_circle",
          cycle_day: cycleInfo.cycleDay,
          cycle_phase: cycleInfo.phase,
          cycle_length_days: participant.cycle_length_days || 28,
          insight_type: "proactive",
          period_checkin: true,
          generated_at: new Date().toISOString(),
          conversation_starters: ["Yes, it started today", "Started yesterday", "Not yet"]
        }
      }).eq("id", placeholderId);
    } else {
      // Generate regular AI insight
      const prompt = buildInsightPrompt(
        profile?.full_name || "there",
        cycleInfo,
        participant,
        recentMessages || []
      );

      const { insight, question, conversationStarters } = await generateAIInsight(lovableApiKey, prompt);

      // Update the placeholder with the real insight
      await supabase.from("chat_messages").update({
        content: insight,
        metadata: {
          has_cycle_visual: true,
          visual_type: "cycle_circle",
          cycle_day: cycleInfo.cycleDay,
          cycle_phase: cycleInfo.phase,
          cycle_length_days: participant.cycle_length_days || 28,
          insight_type: "proactive",
          generated_at: new Date().toISOString(),
          engagement_question: question,
          conversation_starters: conversationStarters
        }
      }).eq("id", placeholderId);
    }

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

  return `You are Logan, a strategic, performance-focused cycle awareness coach. Write a proactive check-in for ${userName.split(" ")[0]}.

Current cycle state:
- Day ${cycleInfo.cycleDay}, Phase: ${cycleInfo.phase}
- Days until next phase: ${cycleInfo.daysUntilNextPhase}

User profile:
- Anchor symptom: ${anchorSymptom || "not specified"}
- Common symptoms: ${symptoms.join(", ") || "not specified"}

Recent conversation context:
${recentMessages.map(m => `${m.role}: ${m.content.slice(0, 100)}`).join("\n") || "No recent messages"}

Rules — follow these exactly:
1. The "intro" should be exactly 2 sentences:
   - First sentence: where they are today (bold the phase name)
   - Second sentence: one specific, tactical tip or prediction relevant to their anchor symptom or phase
2. The "question" should be 1 sentence: a "psychic" question — predict a specific sensation or experience they're likely having right now based on their exact cycle position, and ask about it
3. No emojis, no exclamation points, no em dashes
4. No greetings like "Hi" or "Hey"
5. No bullet points or lists — just flowing sentences
6. Use **bold** sparingly for the phase name only

Example intro: "Day 18, deep in **luteal**. Progesterone is climbing so your focus window is shrinking — front-load your hardest task before noon."
Example question: "Are you noticing that afternoon brain fog creeping in earlier than usual?"

IMPORTANT: Respond in this exact JSON format:
{
  "intro": "Your 2-sentence intro here",
  "question": "Your psychic question here",
  "starters": ["Short reply 1", "Short reply 2", "Short reply 3"]
}

The "starters" should be 3 natural conversation replies the user might want to send back (3-6 words each). They should be relevant responses to the question you asked.`;
}

async function generateAIInsight(apiKey: string, prompt: string): Promise<{ insight: string; question: string; conversationStarters: string[] }> {
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
      insight: parsed.intro || "How are you feeling today?",
      question: parsed.question || "",
      conversationStarters: parsed.starters || ["I'm doing well", "Not great today", "Tell me more"]
    };
  } catch (e) {
    console.error("Failed to parse AI response as JSON:", content);
    return {
      insight: content || "How are you feeling today?",
      question: "",
      conversationStarters: ["I'm doing well", "Not great today", "Tell me more"]
    };
  }
}
