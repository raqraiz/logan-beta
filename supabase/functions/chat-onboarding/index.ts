import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Onboarding question flow
const ONBOARDING_QUESTIONS = [
  {
    key: "welcome",
    message: "Hey there! 👋 I'm Logan, your personal cycle companion. I'm here to help you understand your patterns and feel more prepared for what's ahead. Let's get to know each other a bit first—what's your name?",
    field: "full_name",
    parseType: "text"
  },
  {
    key: "last_period",
    message: "Nice to meet you, {name}! 🌸 To give you the most relevant insights, I need to know where you are in your cycle. When did your last period start? (Just give me an approximate date like 'January 15' or '2 weeks ago')",
    field: "last_period_start",
    parseType: "date"
  },
  {
    key: "cycle_length",
    message: "Got it! And how long is your typical cycle? Most people are between 24-35 days. If you're not sure, 28 days is a good starting point.",
    field: "cycle_length_days",
    parseType: "number"
  },
  {
    key: "symptoms",
    message: "Now for the important stuff—what symptoms tend to bother you most? Things like mood swings, cramps, fatigue, anxiety, brain fog, headaches... Just tell me whatever comes to mind!",
    field: "typical_symptoms",
    parseType: "symptoms"
  },
  {
    key: "anchor_symptom",
    message: "If you had to pick ONE symptom that really disrupts your life or catches you off guard, what would it be? This helps me give you heads-up warnings when it's likely coming.",
    field: "anchor_symptom",
    parseType: "text"
  },
  {
    key: "complete",
    message: "Perfect! I've got everything I need to start giving you personalized insights. 🎯 You'll hear from me a couple times a week with predictions and tips based on where you are in your cycle. Feel free to message me anytime with updates or questions!",
    field: null,
    parseType: null
  }
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user from JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, userMessage } = body;

    console.log("Chat onboarding action:", action, "for user:", user.id);

    // Get or create participant record
    let { data: participant } = await supabase
      .from("participants")
      .select("*")
      .eq("email", user.email)
      .single();

    // If no participant exists, we need to track onboarding via chat metadata
    // Get existing chat messages to determine onboarding state
    const { data: messages } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    // Find onboarding state from messages
    const systemMessages = messages?.filter(m => m.message_type === "onboarding") || [];
    const userMessages = messages?.filter(m => m.role === "user" && m.message_type === "text") || [];

    // Action: Initialize onboarding (send first message)
    if (action === "init") {
      // Check if already started onboarding
      if (messages && messages.length > 0) {
        console.log("User already has messages, skipping init");
        return new Response(
          JSON.stringify({ success: true, alreadyStarted: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Send welcome message
      const welcomeQ = ONBOARDING_QUESTIONS[0];
      const { error: insertError } = await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: welcomeQ.message,
        message_type: "onboarding",
        metadata: { onboarding_step: 0, expecting_field: welcomeQ.field }
      });

      if (insertError) {
        console.error("Insert error:", insertError);
        throw insertError;
      }

      console.log("Sent welcome message");
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: Process user response and continue onboarding
    if (action === "respond") {
      if (!userMessage) {
        return new Response(
          JSON.stringify({ error: "No message provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find the last onboarding question asked
      const lastOnboardingMsg = [...(systemMessages || [])].reverse().find(
        m => m.metadata?.onboarding_step !== undefined
      );

      if (!lastOnboardingMsg) {
        console.log("No onboarding in progress");
        return new Response(
          JSON.stringify({ success: true, onboardingComplete: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const currentStep = lastOnboardingMsg.metadata.onboarding_step as number;
      const currentQuestion = ONBOARDING_QUESTIONS[currentStep];
      
      // Check if onboarding is complete
      if (currentStep >= ONBOARDING_QUESTIONS.length - 1) {
        return new Response(
          JSON.stringify({ success: true, onboardingComplete: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parse the user's response based on expected field type
      let parsedValue: any = userMessage.trim();
      const parseType = currentQuestion.parseType;

      if (parseType === "date") {
        // Try to parse date from natural language
        parsedValue = parseNaturalDate(userMessage);
      } else if (parseType === "number") {
        // Extract number
        const match = userMessage.match(/\d+/);
        parsedValue = match ? parseInt(match[0], 10) : 28;
      } else if (parseType === "symptoms") {
        // Split symptoms into array
        parsedValue = parseSymptoms(userMessage);
      }

      // Update participant record if we have one
      if (participant && currentQuestion.field) {
        const updateData: Record<string, any> = {};
        updateData[currentQuestion.field] = parsedValue;
        
        await supabase
          .from("participants")
          .update(updateData)
          .eq("id", participant.id);
        
        console.log("Updated participant field:", currentQuestion.field, "=", parsedValue);
      } else if (!participant && currentQuestion.field) {
        // Create participant record if this is the name question
        if (currentQuestion.field === "full_name") {
          const { data: newParticipant, error: createError } = await supabase
            .from("participants")
            .insert({
              full_name: parsedValue,
              email: user.email,
              whatsapp_number: user.email || "web-user",
              consent_given: true,
              consent_given_at: new Date().toISOString(),
              preferred_channel: "web",
              is_active: true
            })
            .select()
            .single();
          
          if (createError) {
            console.error("Error creating participant:", createError);
          } else {
            participant = newParticipant;
            console.log("Created new participant:", participant?.id);
          }
        }
      }

      // Move to next question
      const nextStep = currentStep + 1;
      const nextQuestion = ONBOARDING_QUESTIONS[nextStep];

      // Personalize message with name if available
      let nextMessage = nextQuestion.message;
      if (participant?.full_name) {
        const firstName = participant.full_name.split(" ")[0];
        nextMessage = nextMessage.replace("{name}", firstName);
      } else if (currentQuestion.field === "full_name") {
        const firstName = parsedValue.split(" ")[0];
        nextMessage = nextMessage.replace("{name}", firstName);
      }

      // Insert the next question
      const { error: nextError } = await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: nextMessage,
        message_type: nextStep === ONBOARDING_QUESTIONS.length - 1 ? "text" : "onboarding",
        metadata: { 
          onboarding_step: nextStep, 
          expecting_field: nextQuestion.field,
          onboarding_complete: nextStep === ONBOARDING_QUESTIONS.length - 1
        }
      });

      if (nextError) {
        console.error("Error inserting next question:", nextError);
        throw nextError;
      }

      console.log("Sent question step:", nextStep);

      return new Response(
        JSON.stringify({ 
          success: true, 
          onboardingComplete: nextStep === ONBOARDING_QUESTIONS.length - 1 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Onboarding error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Helper: Parse natural language date
function parseNaturalDate(input: string): string {
  const now = new Date();
  const lower = input.toLowerCase();

  // Check for "X days/weeks ago"
  const agoMatch = lower.match(/(\d+)\s*(day|week)s?\s*ago/);
  if (agoMatch) {
    const num = parseInt(agoMatch[1], 10);
    const unit = agoMatch[2];
    const date = new Date(now);
    if (unit === "week") {
      date.setDate(date.getDate() - num * 7);
    } else {
      date.setDate(date.getDate() - num);
    }
    return date.toISOString().split("T")[0];
  }

  // Check for "yesterday"
  if (lower.includes("yesterday")) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split("T")[0];
  }

  // Check for "today"
  if (lower.includes("today")) {
    return now.toISOString().split("T")[0];
  }

  // Try to parse month + day like "January 15" or "Jan 15"
  const months: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
    nov: 10, november: 10, dec: 11, december: 11
  };

  for (const [monthName, monthIndex] of Object.entries(months)) {
    if (lower.includes(monthName)) {
      const dayMatch = input.match(/\d{1,2}/);
      if (dayMatch) {
        const day = parseInt(dayMatch[0], 10);
        const date = new Date(now.getFullYear(), monthIndex, day);
        // If date is in the future, assume last year
        if (date > now) {
          date.setFullYear(date.getFullYear() - 1);
        }
        return date.toISOString().split("T")[0];
      }
    }
  }

  // Default to a week ago if we can't parse
  const defaultDate = new Date(now);
  defaultDate.setDate(defaultDate.getDate() - 7);
  return defaultDate.toISOString().split("T")[0];
}

// Helper: Parse symptoms from natural language
function parseSymptoms(input: string): string[] {
  const knownSymptoms = [
    "Rage spikes", "Anxiety spikes", "Short fuse", "Sudden dread",
    "Feeling overwhelmed", "Brain fog", "Energy crashes", "Wired but tired",
    "Ringing in ears", "Muffled hearing", "Migraines", "Deep fatigue",
    "Chin or jaw acne breakouts", "Random shame spiral", "One stinky armpit",
    "Feeling emotionally allergic to people", "Cramps", "Bloating",
    "Mood swings", "Headaches", "Back pain", "Breast tenderness",
    "Food cravings", "Irritability", "Depression", "Insomnia"
  ];

  const lower = input.toLowerCase();
  const found: string[] = [];

  // Check for known symptoms
  for (const symptom of knownSymptoms) {
    if (lower.includes(symptom.toLowerCase())) {
      found.push(symptom);
    }
  }

  // Also check for partial matches
  const simpleMatches: Record<string, string> = {
    "cramp": "Cramps",
    "bloat": "Bloating",
    "mood": "Mood swings",
    "headache": "Headaches",
    "migraine": "Migraines",
    "fatigue": "Deep fatigue",
    "tired": "Deep fatigue",
    "anxious": "Anxiety spikes",
    "anxiety": "Anxiety spikes",
    "brain fog": "Brain fog",
    "fog": "Brain fog",
    "irritable": "Irritability",
    "angry": "Rage spikes",
    "rage": "Rage spikes",
    "sad": "Depression",
    "depressed": "Depression",
    "overwhelm": "Feeling overwhelmed",
    "acne": "Chin or jaw acne breakouts",
    "back pain": "Back pain",
    "insomnia": "Insomnia",
    "sleep": "Insomnia",
    "cravings": "Food cravings"
  };

  for (const [keyword, symptom] of Object.entries(simpleMatches)) {
    if (lower.includes(keyword) && !found.includes(symptom)) {
      found.push(symptom);
    }
  }

  // If nothing matched, store the raw input as a custom symptom
  if (found.length === 0) {
    return [input.trim()];
  }

  return found;
}
