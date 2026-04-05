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

    // Race-condition guard
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

    // Calculate cycle info using participant's timezone
    const cycleInfo = calculateCycleInfo(
      participant.last_period_start,
      participant.cycle_length_days,
      participant.timezone || "UTC"
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
      .neq("message_type", "checkin")
      .order("created_at", { ascending: false })
      .limit(5);

    // Get recent check-in responses for personalization
    const { data: checkinMessages } = await supabase
      .from("chat_messages")
      .select("content, metadata, created_at")
      .eq("user_id", user.id)
      .eq("message_type", "checkin")
      .order("created_at", { ascending: false })
      .limit(12);

    // Check if user is in late luteal — ask about period
    const isLateLuteal = cycleInfo.phase === "Luteal" && cycleInfo.daysUntilNextPhase <= 3;
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
          last_period_start: participant.last_period_start,
          timezone: participant.timezone || "UTC",
          insight_type: "proactive",
          period_checkin: true,
          generated_at: new Date().toISOString(),
          conversation_starters: ["Yes, it started today", "Started yesterday", "Not yet"]
        }
      }).eq("id", placeholderId);
    } else {
      // Generate AI insight
      const prompt = buildInsightPrompt(
        profile?.full_name || "there",
        cycleInfo,
        participant,
        recentMessages || [],
        checkinMessages || []
      );

      const { insight, question, conversationStarters, cheatSheet } = await generateAIInsight(lovableApiKey, prompt);

      await supabase.from("chat_messages").update({
        content: insight,
        metadata: {
          has_cycle_visual: true,
          visual_type: "cycle_circle",
          cycle_day: cycleInfo.cycleDay,
          cycle_phase: cycleInfo.phase,
          cycle_length_days: participant.cycle_length_days || 28,
          last_period_start: participant.last_period_start,
          timezone: participant.timezone || "UTC",
          insight_type: "proactive",
          generated_at: new Date().toISOString(),
          engagement_question: question,
          conversation_starters: conversationStarters,
          cheat_sheet: cheatSheet,
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
  cycleLengthDays: number | null,
  timezone: string = "UTC"
): { cycleDay: number; phase: string; daysUntilNextPhase: number } | null {
  if (!lastPeriodStart || !cycleLengthDays) return null;

  // Parse date-only string safely: treat YYYY-MM-DD as noon UTC to avoid timezone shift
  let periodStart: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(lastPeriodStart)) {
    const [year, month, day] = lastPeriodStart.split("-").map(Number);
    periodStart = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  } else {
    periodStart = new Date(lastPeriodStart);
  }

  // Get today's date in the user's timezone for accurate day calculation
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone }); // YYYY-MM-DD
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const today = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0));

  const diffTime = today.getTime() - periodStart.getTime();
  const daysSinceStart = Math.round(diffTime / (1000 * 60 * 60 * 24));
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
  recentMessages: { content: string; role: string }[],
  checkinMessages: { content: string; metadata: any; created_at: string }[]
): string {
  const anchorSymptom = participant.anchor_symptom;
  const symptoms = participant.typical_symptoms || [];
  const topics = participant.goals || [];
  const age = participant.age || null;
  const firstName = userName.split(" ")[0];
  const cycleLengthDays = participant.cycle_length_days || 28;

  // Phase strengths — what's going well
  const phaseStrengths: Record<string, string> = {
    "Menstruation": "Deep intuition and reflection. The body is resetting — a powerful time for clarity on what matters most.",
    "Follicular": "Rising energy, sharpened focus, creativity surging. This is a peak performance window — confidence, mental clarity, and motivation are naturally high.",
    "Ovulation": "Communication skills peak, social energy is magnetic, verbal fluency and confidence are at their highest.",
    "Luteal": "Detail-oriented thinking, nesting instincts, strong ability to finish and refine projects. Early luteal still carries good energy.",
  };

  const strengthContext = phaseStrengths[cycleInfo.phase] || "";

  // Anchor-specific phase context with food connection
  // During Follicular & Ovulation: SUPPRESS symptom context — these are peak phases
  let anchorContext = "";
  if (anchorSymptom && (cycleInfo.phase === "Luteal" || cycleInfo.phase === "Menstruation")) {
    const foodMap: Record<string, Record<string, string>> = {
      "Luteal": {
        "muffled hearing": "Inner ear inflammation tends to peak now. Omega-3s (salmon, sardines) and turmeric can quiet it.",
        "Anxiety spikes": "GABA drops as progesterone shifts. Magnesium-rich foods (dark chocolate, pumpkin seeds) support the nervous system.",
        "Migraines": "Estrogen withdrawal can trigger vascular headaches. Ginger, magnesium, and anti-inflammatory fats help.",
        "Rage spikes": "Serotonin dips in late luteal. Complex carbs (sweet potato, oats) support serotonin production.",
        "Brain fog": "Progesterone is sedating. Protein-rich meals and healthy fats keep blood sugar steady.",
        "Energy crashes": "Blood sugar instability peaks now. Protein + fat at every meal prevents the crashes.",
        "Deep fatigue": "Iron stores may be depleting pre-period. Red meat, lentils, or leafy greens with vitamin C.",
        "Chin or jaw acne breakouts": "Androgens spike in luteal. Anti-inflammatory foods and cutting dairy can help.",
        "_default": `"${anchorSymptom}" is likely active or building. Anti-inflammatory foods (fatty fish, leafy greens, berries) can take the edge off.`,
      },
      "Menstruation": {
        "_default": `"${anchorSymptom}" may be present or easing. Warm, iron-rich, anti-inflammatory meals support recovery.`,
      },
    };

    const phaseMap = foodMap[cycleInfo.phase] || {};
    const foodNote = phaseMap[anchorSymptom] || phaseMap["_default"] || "";
    anchorContext = `Their anchor symptom: ${foodNote}`;
  }

  // Topic preferences context
  const topicContext = topics.length > 0
    ? `- Interest areas: ${topics.join(", ")}. Weave relevant tips from these areas into the intro when naturally fitting.`
    : "";

  return `You are Logan. You know ${firstName}'s cycle so well you can name what she's feeling before she does. You're not giving advice or instructions. You're the person who just gets it.

CONTEXT:
- Day ${cycleInfo.cycleDay} of ${cycleLengthDays}, **${cycleInfo.phase}**
- ${cycleInfo.daysUntilNextPhase} days until next phase
- Age: ${age || "unknown"}
- Anchor symptom: ${anchorSymptom || "not set"}
- Other symptoms: ${symptoms.join(", ") || "none"}
- PHASE STRENGTHS: ${strengthContext}
${anchorContext ? `- ${anchorContext}` : ""}
${topicContext}
${age && age <= 16 ? "- TONE: User is young. Use simple, relatable language. Keep intro under 25 words. Make the question feel like a text from a friend." : ""}
${age && age >= 17 && age <= 22 ? "- TONE: Keep it casual and brief. Max 35 words for intro." : ""}

RECENT CONVERSATION:
${recentMessages.map(m => `${m.role}: ${m.content.slice(0, 80)}`).join("\n") || "None"}

RECENT SELF-REPORTED CHECK-INS (use to personalize — if they reported low energy yesterday, acknowledge it):
${checkinMessages.length > 0 ? checkinMessages.map(m => {
  const meta = m.metadata || {};
  return `- ${meta.dimension}: "${meta.response}" (${meta.phase}, day ${meta.cycle_day})`;
}).join("\n") : "None yet"}

IMPORTANT TONE RULE:
- Every phase has superpowers. LEAD with what's going well — the strengths, the high-performing qualities of this phase.
- During Follicular and Ovulation: emphasize peak energy, creativity, confidence, and capability. Anchor symptom context is secondary or absent.
- During Luteal and Menstruation: acknowledge strengths first (detail-oriented thinking, intuition, reflection), then gently reference anchor symptom context if relevant.
- Never frame any phase as purely negative. Even challenging phases have powerful qualities.

Generate a JSON object:

1. "intro": 2-3 short sentences. Max 40 words total.
   - Sentence 1: Ground them in their day and phase (bold the phase name). Lead with what this phase is great for.
   - Sentence 2: Name a strength or high-performing quality they're likely feeling today. During Follicular/Ovulation, lean into peak performance. During Luteal/Menstruation, acknowledge the quieter superpowers.
   - Sentence 3 (optional, only in Luteal or Menstruation): A single, specific food mention that connects to their anchor symptom. Frame it as something their body might be drawn to, not as a prescription.

2. "question": One short question (under 12 words). During Follicular/Ovulation: ask about a strength or creative/energetic moment. During Luteal/Menstruation: ask about a strength OR a hyper-specific sensation tied to "${anchorSymptom}". The kind of question that makes them stop and think "wait, yes."

3. "starters": 3 replies (2-4 words each). One confirms ("Yeah exactly"), one pushes back ("Not today actually"), one opens up ("Tell me more").

4. "cheat_sheet": Personalized energy/focus/emotions/nutrition for THIS user in THIS phase. Each has "level" (high/medium/low/variable) and "note" (max 12 words). Notes must be INQUIRY-BASED — ask the user how they're feeling, don't tell them. Frame each note as a gentle question or check-in that invites them to reflect. Never declare what they're experiencing. During high-performing phases, levels should reflect the strengths (e.g., energy: high, focus: high).
   - "energy": Ask how their energy is today given their phase.
   - "focus": Ask about their mental clarity or creative state.
   - "emotions": Ask what their emotional landscape feels like right now.
   - "nutrition": Ask about cravings or what their body wants to eat. During Luteal/Menstruation, "level" should be "high" (cravings are strongest). During Follicular/Ovulation, "level" should be "medium". Tie the note to their anchor symptom when relevant (e.g., "Craving magnesium-rich foods like dark chocolate?").

VOICE:
- You're a friend who just knows, not a coach giving a plan
- Never say "you should", "try to", "consider", "make sure"
- No emojis, no exclamation points, no greetings
- Bold only the phase name
- Less is more. If it feels like a paragraph, it's too long.

RESPOND ONLY WITH VALID JSON:
{
  "intro": "...",
  "question": "...",
  "starters": ["...", "...", "..."],
  "cheat_sheet": {
    "energy": { "level": "...", "note": "..." },
    "focus": { "level": "...", "note": "..." },
    "emotions": { "level": "...", "note": "..." },
    "nutrition": { "level": "...", "note": "..." }
  }
}`;
}

async function generateAIInsight(apiKey: string, prompt: string): Promise<{
  insight: string;
  question: string;
  conversationStarters: string[];
  cheatSheet: { energy: { level: string; note: string }; focus: { level: string; note: string }; emotions: { level: string; note: string }; nutrition: { level: string; note: string } } | null;
}> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You are Logan. You predict what women feel before they notice it themselves, based on their cycle. You're not clinical. You're the friend who just knows. Always respond in valid JSON." },
        { role: "user", content: prompt }
      ],
      max_tokens: 400,
      temperature: 0.8,
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
      conversationStarters: parsed.starters || ["Yeah exactly", "Not today", "Tell me more"],
      cheatSheet: parsed.cheat_sheet || null,
    };
  } catch (e) {
    console.error("Failed to parse AI response as JSON:", content);
    return {
      insight: content || "How are you feeling today?",
      question: "",
      conversationStarters: ["Yeah exactly", "Not today", "Tell me more"],
      cheatSheet: null,
    };
  }
}
