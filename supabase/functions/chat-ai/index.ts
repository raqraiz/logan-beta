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
    let { data: participant } = await supabase
      .from("participants")
      .select("*")
      .eq("email", user.email)
      .single();

    // --- Period confirmation detection ---
    // Check if user is responding to a period check-in
    const periodConfirmPatterns = [
      /yes.*(started|period|got it|began|came)/i,
      /^yes$/i,
      /started (today|yesterday|this morning|last night)/i,
      /period (started|came|arrived|began)/i,
      /it started/i,
      /got my period/i,
      /started yesterday/i,
    ];
    const isPeriodConfirmation = periodConfirmPatterns.some(p => p.test(userMessage));

    if (isPeriodConfirmation && participant) {
      // Parse when it started — default to today
      let periodStartDate = new Date();
      if (/yesterday/i.test(userMessage)) {
        periodStartDate.setDate(periodStartDate.getDate() - 1);
      }
      const formattedDate = periodStartDate.toISOString().split("T")[0];

      // Record previous cycle length if we have a previous period start
      let previousCycleLength: number | null = null;
      if (participant.last_period_start) {
        const prevStart = new Date(participant.last_period_start);
        const newStart = new Date(formattedDate);
        const diffDays = Math.round((newStart.getTime() - prevStart.getTime()) / (1000 * 60 * 60 * 24));
        // Only record if it's a plausible cycle length (15-60 days)
        if (diffDays >= 15 && diffDays <= 60) {
          previousCycleLength = diffDays;
          const { error: historyError } = await supabase
            .from("cycle_history")
            .insert({
              participant_id: participant.id,
              cycle_start_date: participant.last_period_start,
              cycle_end_date: formattedDate,
              cycle_length_days: diffDays,
            });
          if (historyError) {
            console.error("Error saving cycle history:", historyError);
          } else {
            console.log("Recorded cycle length:", diffDays, "days");
          }
        }
      }

      // Update participant's last_period_start
      const { error: updateError } = await supabase
        .from("participants")
        .update({ last_period_start: formattedDate })
        .eq("id", participant.id);

      if (updateError) {
        console.error("Error updating period start:", updateError);
      } else {
        console.log("Updated last_period_start to:", formattedDate);
        const { data: refreshed } = await supabase
          .from("participants")
          .select("*")
          .eq("id", participant.id)
          .single();
        if (refreshed) participant = refreshed;
      }

      // Fetch cycle history for average calculation
      const { data: cycleHistoryRows } = await supabase
        .from("cycle_history")
        .select("cycle_length_days")
        .eq("participant_id", participant.id)
        .order("cycle_start_date", { ascending: false })
        .limit(12);

      const cycleHistory = cycleHistoryRows || [];
      const avgCycleLength = cycleHistory.length > 0
        ? Math.round(cycleHistory.reduce((sum, r) => sum + r.cycle_length_days, 0) / cycleHistory.length)
        : null;

      // Calculate new cycle info
      const newCycleInfo = calculateCycleInfo(formattedDate, participant.cycle_length_days || 28, participant.timezone || "UTC");

      // Build confirmation message with cycle history stats
      let confirmationMessage = `Noted — logging **Day 1** as ${periodStartDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Your cycle is reset.\n\n- **Phase**: ${newCycleInfo.phase}\n- **Energy**: low — prioritize rest and light movement\n- **Watch for**: your anchor symptom (${participant.anchor_symptom || "not set"}) usually eases by day 3-4`;

      if (previousCycleLength) {
        confirmationMessage += `\n\n**This cycle was ${previousCycleLength} days.**`;
      }
      if (avgCycleLength && cycleHistory.length >= 2) {
        confirmationMessage += `\nYour **average cycle length** over ${cycleHistory.length} cycles: **${avgCycleLength} days**.`;
        const shortest = Math.min(...cycleHistory.map(r => r.cycle_length_days));
        const longest = Math.max(...cycleHistory.map(r => r.cycle_length_days));
        if (shortest !== longest) {
          confirmationMessage += ` (range: ${shortest}–${longest} days)`;
        }
      }

      confirmationMessage += `\n\nTake it easy today.`;

      // Save the assistant's response
      await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: confirmationMessage,
        message_type: "text",
        metadata: {
          cycle_day: newCycleInfo.cycleDay,
          cycle_phase: newCycleInfo.phase,
          has_cycle_visual: true,
          visual_type: "cycle_circle",
          cycle_length_days: participant.cycle_length_days || 28,
          period_update: true,
          new_period_start: formattedDate,
          previous_cycle_length: previousCycleLength,
          average_cycle_length: avgCycleLength,
          cycles_tracked: cycleHistory.length,
        }
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: confirmationMessage,
          cycleInfo: newCycleInfo,
          periodUpdated: true,
          previousCycleLength,
          averageCycleLength: avgCycleLength,
          cyclesTracked: cycleHistory.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // --- End period confirmation ---

    // Get recent chat history (last 20 messages for context)
    const { data: recentMessages } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Fetch cycle history for context
    let cycleHistoryContext = "";
    if (participant) {
      const { data: historyRows } = await supabase
        .from("cycle_history")
        .select("cycle_length_days, cycle_start_date")
        .eq("participant_id", participant.id)
        .order("cycle_start_date", { ascending: false })
        .limit(12);

      if (historyRows && historyRows.length > 0) {
        const avg = Math.round(historyRows.reduce((s, r) => s + r.cycle_length_days, 0) / historyRows.length);
        const shortest = Math.min(...historyRows.map(r => r.cycle_length_days));
        const longest = Math.max(...historyRows.map(r => r.cycle_length_days));
        const recent = historyRows.slice(0, 3).map(r => `${r.cycle_length_days}d`).join(", ");
        cycleHistoryContext = `\n- Cycles tracked: ${historyRows.length}\n- Average cycle length: ${avg} days (range: ${shortest}–${longest})\n- Recent cycles: ${recent}`;
      }
    }

    // Calculate cycle info
    const cycleInfo = participant?.last_period_start && participant?.cycle_length_days
      ? calculateCycleInfo(participant.last_period_start, participant.cycle_length_days, participant.timezone || "UTC")
      : null;

    // Build system prompt with user context
    const systemPrompt = buildSystemPrompt(participant, cycleInfo, cycleHistoryContext);

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
        max_tokens: 500
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
  cycleInfo: { cycleDay: number; phase: string } | null,
  cycleHistoryContext: string = ""
): string {
  const basePrompt = `You are Logan, a strategic, cycle-aware performance advisor for women. Your role is to provide personalized, actionable insights that help users optimize their energy, focus, and recovery based on where they are in their menstrual cycle.

VOICE & STYLE:
- Direct, warm, and grounded. Not overly enthusiastic or clinical.
- Use "you" not "we". Speak like a knowledgeable coach, not a friend.
- Keep responses concise: aim for scannable, not wall-of-text.
- Never use emojis or exclamation points.
- USE markdown formatting to make responses visual and easy to scan:
  - Use **bold** for key terms and takeaways
  - Use bullet points for lists of tips or symptoms
  - Use short paragraphs (1-2 sentences max each)
- Structure responses so the most important info comes first.
- End with a specific, actionable suggestion or question when relevant.

RESPONSE FORMAT EXAMPLES:

For "what should I expect this week":
"You're in **late follicular** right now. Energy is building.

- **Focus**: sharp — good window for complex work
- **Energy**: climbing — push harder in workouts
- **Watch for**: slight dip after ovulation in ~3 days

One thing to try: front-load your hardest task to tomorrow."

For general questions, keep it to 2-3 short paragraphs with bold key points.

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
- Typical symptoms: ${participant.typical_symptoms?.join(", ") || "not specified"}${cycleHistoryContext}

Use this context to make your responses personally relevant. Reference their current phase and how it might affect their request. If they mention their anchor symptom, acknowledge it and provide phase-appropriate guidance. When users ask about their cycle length or patterns, use the cycle history data to provide specific insights.`;

  return basePrompt + userContext;
}

// Calculate cycle day and phase
// NOTE: Date-only strings (YYYY-MM-DD) are parsed as UTC midnight which can cause
// off-by-one day errors for users in UTC+ timezones. We parse them as noon UTC
// to ensure the date is always interpreted as the intended calendar day.
function calculateCycleInfo(
  lastPeriodStart: string,
  cycleLengthDays: number,
  timezone: string = "UTC"
): { cycleDay: number; phase: string } {
  // Parse date-only string safely: treat YYYY-MM-DD as noon UTC to avoid timezone shift
  let periodStart: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(lastPeriodStart)) {
    const [year, month, day] = lastPeriodStart.split("-").map(Number);
    periodStart = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // noon UTC
  } else {
    periodStart = new Date(lastPeriodStart);
  }

  // Get today's date in the user's timezone for accurate day calculation
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const today = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0)); // noon UTC same calendar day

  const diffTime = today.getTime() - periodStart.getTime();
  const daysSinceStart = Math.round(diffTime / (1000 * 60 * 60 * 24));

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
