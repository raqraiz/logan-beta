import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Time windows in Israel time (UTC+2/+3)
const TIME_WINDOWS: Record<string, { start: number; end: number }> = {
  morning: { start: 7, end: 10 },   // 7-10 AM
  afternoon: { start: 12, end: 15 }, // 12-3 PM
  evening: { start: 19, end: 22 },   // 7-10 PM
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting scheduled insight check...");

    // Get current hour in Israel timezone
    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
    const currentHour = israelTime.getHours();
    const currentDay = israelTime.toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Jerusalem" }).toLowerCase();
    
    console.log(`Current time: ${currentHour}:00, Day: ${currentDay}`);

    // Find users who should receive notifications now
    const { data: preferences, error: prefsError } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("is_enabled", true);

    if (prefsError) {
      console.error("Error fetching preferences:", prefsError);
      throw prefsError;
    }

    console.log(`Found ${preferences?.length || 0} active notification preferences`);

    const usersToNotify: string[] = [];

    for (const pref of preferences || []) {
      // For daily frequency, skip day check; otherwise check if today is in their preferred days
      const isDaily = pref.frequency === "daily";
      if (!isDaily && !pref.preferred_days?.includes(currentDay)) {
        continue;
      }

      // Check if current hour is in their preferred time window
      const timeWindow = TIME_WINDOWS[pref.preferred_time] || TIME_WINDOWS.evening;
      if (currentHour < timeWindow.start || currentHour >= timeWindow.end) {
        continue;
      }

      // Check if we already sent a notification today
      if (pref.last_notification_at) {
        const lastNotif = new Date(pref.last_notification_at);
        const lastNotifDay = lastNotif.toLocaleDateString("en-US", { timeZone: "Asia/Jerusalem" });
        const todayStr = israelTime.toLocaleDateString("en-US", { timeZone: "Asia/Jerusalem" });
        
        if (lastNotifDay === todayStr) {
          console.log(`User ${pref.user_id} already notified today, skipping`);
          continue;
        }
      }

      usersToNotify.push(pref.user_id);
    }

    console.log(`${usersToNotify.length} users to notify`);

    // Generate and send insights for each user
    for (const userId of usersToNotify) {
      try {
        await sendInsightToUser(supabase, lovableApiKey, userId, twilioAccountSid, twilioAuthToken);
        
        // Update last notification time
        await supabase
          .from("notification_preferences")
          .update({ last_notification_at: new Date().toISOString() })
          .eq("user_id", userId);
          
        console.log(`Successfully sent insight to user ${userId}`);
      } catch (error) {
        console.error(`Failed to send insight to user ${userId}:`, error);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        usersNotified: usersToNotify.length,
        currentTime: `${currentHour}:00`,
        currentDay
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Scheduled insight error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function sendInsightToUser(
  supabase: ReturnType<typeof createClient>,
  lovableApiKey: string,
  userId: string,
  twilioAccountSid: string,
  twilioAuthToken: string
) {
  // Get user's participant data
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .single();

  const { data: participant } = await supabase
    .from("participants")
    .select("*")
    .eq("email", profile?.email)
    .single();

  if (!participant) {
    console.log(`No participant found for user ${userId}`);
    return;
  }

  // Calculate cycle info
  const cycleInfo = calculateCycleInfo(
    participant.last_period_start,
    participant.cycle_length_days
  );

  if (!cycleInfo) {
    console.log(`Could not calculate cycle info for user ${userId}`);
    return;
  }

  // Get recent conversation context
  const { data: recentMessages } = await supabase
    .from("chat_messages")
    .select("content, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  // Generate AI insight with conversation starters
  const prompt = buildInsightPrompt(
    profile?.full_name || "there",
    cycleInfo,
    participant,
    recentMessages || []
  );

  const { insight, conversationStarters } = await generateAIInsight(lovableApiKey, prompt);

  // Insert the insight as a chat message
  await supabase.from("chat_messages").insert({
    user_id: userId,
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

  // Send SMS if user has a phone number
  const phoneNumber = profile?.phone || participant.whatsapp_number;
  if (phoneNumber && phoneNumber !== "web-user" && !phoneNumber.includes("@")) {
    await sendSMS(
      twilioAccountSid,
      twilioAuthToken,
      phoneNumber,
      `${insight}\n\nOpen Logan to continue: https://logan-alpha-pilot.lovable.app`
    );
    console.log(`SMS sent to ${phoneNumber}`);
  }
}

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
1. Keep it SHORT (2-3 sentences max)
2. Be specific about what the phase means for their energy, focus, or mood today
3. If relevant, mention their anchor symptom and whether to watch for it
4. Include one practical suggestion they can act on today
5. Avoid generic wellness advice - be tactical and specific
6. Use a warm but direct tone - you're a coach, not a friend
7. Do NOT include greetings like "Hi" or "Hey" - get straight to the insight
8. Do NOT use emojis, exclamation points, or em dashes

IMPORTANT: Respond in this exact JSON format:
{
  "insight": "Your 2-3 sentence insight here",
  "starters": ["Short reply 1", "Short reply 2", "Short reply 3"]
}

The "starters" should be 3 natural conversation replies the user might want to send back (3-6 words each). Examples:
- "Actually feeling pretty good today"
- "Yeah, my energy is low"
- "What should I eat?"
- "Tell me more about that"
- "How can I prepare?"`;
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
  
  // Parse JSON response
  try {
    // Clean potential markdown code blocks
    const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleanContent);
    return {
      insight: parsed.insight || "How are you feeling today?",
      conversationStarters: parsed.starters || ["I'm doing well", "Not great today", "Tell me more"]
    };
  } catch (e) {
    console.error("Failed to parse AI response as JSON:", content);
    // Fallback: use the content as insight with default starters
    return {
      insight: content || "How are you feeling today?",
      conversationStarters: ["I'm doing well", "Not great today", "Tell me more"]
    };
  }
}

async function sendSMS(
  accountSid: string,
  authToken: string,
  to: string,
  body: string
): Promise<void> {
  // Get Twilio phone numbers - we need to find one or use a messaging service
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  
  const params = new URLSearchParams();
  params.append("To", to);
  params.append("From", Deno.env.get("TWILIO_PHONE_NUMBER") || "");
  params.append("Body", body);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Twilio SMS error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log("SMS sent, SID:", result.sid);
}
