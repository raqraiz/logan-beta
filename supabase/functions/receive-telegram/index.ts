import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateQuestionResponse(
  supabase: any,
  participant: any,
  questionText: string
): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.error("LOVABLE_API_KEY not configured");
    return null;
  }

  // Get recent conversation history
  const { data: recentInsights } = await supabase
    .from("insights")
    .select("content, insight_type, sent_at")
    .eq("participant_id", participant.id)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(3);

  const { data: recentUpdates } = await supabase
    .from("cycle_updates")
    .select("update_type, description, category, created_at")
    .eq("participant_id", participant.id)
    .order("created_at", { ascending: false })
    .limit(5);

  // Calculate cycle day
  let cycleDay = null;
  if (participant.last_period_start) {
    const lastPeriod = new Date(participant.last_period_start);
    const today = new Date();
    const diffTime = today.getTime() - lastPeriod.getTime();
    cycleDay = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }

  const systemPrompt = `You are Logan, a health intelligence designed to help women understand their own cycle patterns with clarity and emotional stability.

CRITICAL CONSTRAINTS:
- Maximum 4 sentences total. No exceptions.
- NEVER use emojis. Not one.
- You are answering a direct question from the user.

Your voice is: Calm. Precise. Non-patronizing. Grounded. Direct.

You do NOT use:
- Emojis (STRICTLY FORBIDDEN)
- Exclamation points
- Em dashes
- Over-validation or motivational language
- Softeners or filler phrases

Your style:
- Maximum 4 sentences, then stop
- Clear and direct
- Practical framing
- Authority through simplicity

When answering questions:
1. Answer their specific question directly
2. Connect it to their cycle context if relevant
3. Keep it grounded in what's known about menstrual health
4. Don't over-explain or hedge excessively`;

  const conversationContext = recentInsights?.map((i: any) => 
    `[Insight sent]: ${i.content}`
  ).join("\n") || "";

  const recentActivity = recentUpdates?.map((u: any) =>
    `[${u.update_type}]: ${u.description}`
  ).join("\n") || "";

  const userPrompt = `Answer ${participant.full_name}'s question directly.

THEIR QUESTION:
"${questionText}"

PARTICIPANT CONTEXT:
- Name: ${participant.full_name}
- Cycle day: ${cycleDay ? `Day ${cycleDay}` : "unknown"}
- Cycle length: ${participant.cycle_length_days || 28} days
- Common symptoms: ${participant.typical_symptoms?.join(", ") || "none specified"}
- Goals: ${participant.goals?.join(", ") || "general wellness"}
- Anchor symptom: ${participant.anchor_symptom || "none specified"}

${conversationContext ? `RECENT INSIGHTS SENT:\n${conversationContext}` : ""}

${recentActivity ? `RECENT MESSAGES FROM THEM:\n${recentActivity}` : ""}

Answer their question clearly and concisely. Connect to their cycle context when relevant.`;

  console.log("Generating AI response to question:", questionText);

  try {
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
      console.error("AI gateway error:", response.status);
      return null;
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;
    
    if (content) {
      console.log("AI response generated successfully");
      return content;
    }
    return null;
  } catch (error) {
    console.error("Error generating AI response:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const update = await req.json();
    console.log("Received Telegram update:", JSON.stringify(update, null, 2));

    // Handle only messages (not edits, callbacks, etc.)
    const message = update.message;
    if (!message) {
      console.log("No message in update, skipping");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatId = message.chat.id.toString();
    const text = message.text || "";
    const firstName = message.from?.first_name || "";
    const lastName = message.from?.last_name || "";
    const username = message.from?.username || "";

    console.log(`Message from chat ${chatId}: "${text}"`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find participant by telegram_chat_id
    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .select("id, full_name, typical_symptoms, goals, anchor_symptom, cycle_regularity, last_period_start, cycle_length_days")
      .eq("telegram_chat_id", chatId)
      .single();

    if (participantError || !participant) {
      console.log(`No participant found for chat ID ${chatId}`);
      
      // Send welcome message for new users
      const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
      if (TELEGRAM_BOT_TOKEN) {
        const welcomeMessage = `Hi ${firstName}! 👋\n\nI'm Logan, your personal cycle companion. To get started, please sign up at our website and add your Telegram Chat ID: \`${chatId}\`\n\nOnce you're registered, I'll send you personalized insights about your cycle!`;
        
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: welcomeMessage,
            parse_mode: "Markdown",
          }),
        });
      }
      
      return new Response(JSON.stringify({ ok: true, status: "unregistered_user" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found participant: ${participant.full_name} (${participant.id})`);

    // Find the most recent sent insight for this participant
    const { data: recentInsight } = await supabase
      .from("insights")
      .select("id")
      .eq("participant_id", participant.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .single();

    // Analyze the message for cycle updates
    const lowerText = text.toLowerCase();
    let updateType: string | null = null;
    let category: string | null = null;

    // Check for questions FIRST (before other categorizations)
    const isQuestion = lowerText.includes("?") || 
      (lowerText.startsWith("what") || lowerText.startsWith("why") || lowerText.startsWith("how") || 
       lowerText.startsWith("when") || lowerText.startsWith("can you") || lowerText.startsWith("is it") ||
       lowerText.startsWith("do i") || lowerText.startsWith("should i") || lowerText.startsWith("will"));

    if (isQuestion) {
      updateType = "question";
      category = "inquiry";
    } else if (lowerText.includes("period") || lowerText.includes("started") || lowerText.includes("bleeding")) {
      updateType = "period_update";
      category = "menstruation";
      
      // If they mention their period started, update last_period_start
      if (lowerText.includes("started") || lowerText.includes("today") || lowerText.includes("just got")) {
        await supabase
          .from("participants")
          .update({ last_period_start: new Date().toISOString().split("T")[0] })
          .eq("id", participant.id);
        console.log("Updated last_period_start for participant");
      }
    } else if (lowerText.includes("cramp") || lowerText.includes("pain") || lowerText.includes("headache") || lowerText.includes("bloat")) {
      updateType = "symptom_update";
      category = "symptoms";
    } else if (lowerText.includes("mood") || lowerText.includes("feeling") || lowerText.includes("anxious") || lowerText.includes("happy") || lowerText.includes("sad")) {
      updateType = "mood_update";
      category = "emotional";
    } else if (lowerText.includes("thank") || lowerText.includes("helpful") || lowerText.includes("great") || lowerText.includes("love")) {
      updateType = "feedback";
      category = "positive";
    } else {
      updateType = "general";
      category = "other";
    }

    // Store the cycle update
    const { error: updateError } = await supabase
      .from("cycle_updates")
      .insert({
        participant_id: participant.id,
        update_type: updateType,
        description: text,
        category: category,
      });

    if (updateError) {
      console.error("Error storing cycle update:", updateError);
    } else {
      console.log(`Stored cycle update: ${updateType} (${category})`);
    }

    // If there's a recent insight, also store as feedback
    if (recentInsight) {
      const { error: feedbackError } = await supabase
        .from("feedback")
        .insert({
          insight_id: recentInsight.id,
          participant_id: participant.id,
          free_form_text: text,
          is_useful: category === "positive" ? true : null,
        });

      if (feedbackError) {
        console.error("Error storing feedback:", feedbackError);
      } else {
        console.log("Stored feedback for recent insight");
      }
    }

    // If it's a question, generate an AI response and queue for approval
    let generatedResponse: string | null = null;
    if (updateType === "question") {
      generatedResponse = await generateQuestionResponse(supabase, participant, text);
      
      if (generatedResponse) {
        // Store as pending insight for admin approval
        const { error: insightError } = await supabase
          .from("insights")
          .insert({
            participant_id: participant.id,
            content: generatedResponse,
            insight_type: "question_response",
            status: "pending",
            ai_prompt_used: `Question: ${text}`,
          });

        if (insightError) {
          console.error("Error storing pending insight:", insightError);
        } else {
          console.log("Stored AI response as pending insight for admin approval");
        }
      }
    }

    // Send acknowledgment
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (TELEGRAM_BOT_TOKEN) {
      let ackMessage = "Noted.";
      
      if (updateType === "period_update" && (lowerText.includes("started") || lowerText.includes("today"))) {
        ackMessage = "Cycle updated. I'll adjust your insights accordingly.";
      } else if (updateType === "symptom_update") {
        ackMessage = "Logged. This will inform your next insight.";
      } else if (updateType === "feedback" && category === "positive") {
        ackMessage = "Noted. Glad it landed.";
      } else if (updateType === "question") {
        ackMessage = "On it. As an alpha tester, your questions help shape Logan. A human will review my response before sending. Should be quick.";
      }
      
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: ackMessage,
        }),
      });
    }

    return new Response(
      JSON.stringify({ ok: true, participantId: participant.id, updateType, generatedResponse: !!generatedResponse }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Receive Telegram error:", error);
    // Always return 200 to Telegram to prevent retries
    return new Response(
      JSON.stringify({ ok: true, error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
