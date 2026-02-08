import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Symptom categories for structured selection
const SYMPTOM_CATEGORIES = {
  emotional: {
    label: "EMOTIONAL & COGNITIVE",
    symptoms: [
      "Rage spikes",
      "Anxiety spikes", 
      "Short fuse",
      "Sudden dread",
      "Feeling overwhelmed",
      "Low stress tolerance",
      "Irritability",
      "Brain fog"
    ]
  },
  physical: {
    label: "PHYSICAL",
    symptoms: [
      "Energy crashes",
      "Wired but tired",
      "Full body inflammation",
      "Nausea",
      "Dizziness",
      "Ringing in ears",
      "Muffled hearing",
      "Migraines",
      "Deep fatigue",
      "Smell sensitivity",
      "Chin or jaw acne breakouts"
    ]
  },
  quirky: {
    label: "IS IT JUST ME?",
    symptoms: [
      "Random shame spiral",
      "One stinky armpit",
      "Feeling emotionally allergic to people",
      "Sudden urge to delete your whole life online"
    ]
  }
};

// All symptoms flattened for validation
const ALL_SYMPTOMS = [
  ...SYMPTOM_CATEGORIES.emotional.symptoms,
  ...SYMPTOM_CATEGORIES.physical.symptoms,
  ...SYMPTOM_CATEGORIES.quirky.symptoms
];

// Onboarding question flow - Strategic, performance-focused voice
const ONBOARDING_QUESTIONS = [
  {
    key: "welcome",
    message: "I'm Logan. I turn cycle data into strategic decisions for energy, focus, training, and recovery. To build your personal playbook, I need to understand your patterns. What's your name?",
    field: "full_name",
    parseType: "text",
    inputType: "text"
  },
  {
    key: "age",
    message: "Good to meet you, {name}. Your age helps me calibrate predictions around hormonal timing and recovery windows. How old are you?",
    field: "age",
    parseType: "number",
    inputType: "text"
  },
  {
    key: "cycle_length",
    message: "Noted. How long is your typical cycle in days? Most fall between 24-35. If you're unsure, 28 is a reasonable starting point.",
    field: "cycle_length_days",
    parseType: "number",
    inputType: "text"
  },
  {
    key: "last_period",
    message: "When did your last period start? This anchors your timeline so I can map your current phase and what's coming.",
    field: "last_period_start",
    parseType: "date",
    inputType: "date_picker"
  },
  {
    key: "symptoms",
    message: "Now the important part. Select all the symptoms that disrupt your performance, mood, or energy around your cycle. These become patterns I track for you.",
    field: "typical_symptoms",
    parseType: "symptoms",
    inputType: "symptom_picker"
  },
  {
    key: "anchor_symptom",
    message: "Which one derails you the most? This becomes your Anchor Symptom—the signal I'll monitor most closely and help you prepare for before it arrives.",
    field: "anchor_symptom",
    parseType: "anchor",
    inputType: "anchor_picker"
  },
  {
    key: "complete",
    message: "Your baseline is set. I'll now track your patterns and send you strategic insights—when to push harder, when to protect your capacity, and when to adjust your approach. This is intelligent performance guidance, not passive tracking.",
    field: null,
    parseType: null,
    inputType: null
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
    const { action, userMessage, selectedSymptoms, anchorSymptom, selectedDate } = body;

    console.log("Chat onboarding action:", action, "for user:", user.id);

    // Get or create participant record
    let { data: participant } = await supabase
      .from("participants")
      .select("*")
      .eq("email", user.email)
      .single();

    // Get existing chat messages to determine onboarding state
    const { data: messages } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    // Find onboarding state from messages
    const systemMessages = messages?.filter(m => m.message_type === "onboarding") || [];

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
        metadata: { 
          onboarding_step: 0, 
          expecting_field: welcomeQ.field,
          input_type: welcomeQ.inputType
        }
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
      let parsedValue: any = userMessage?.trim() || "";
      const parseType = currentQuestion.parseType;

      if (parseType === "date") {
        // Use selected date if provided, otherwise parse from text
        parsedValue = selectedDate || parseNaturalDate(userMessage || "");
      } else if (parseType === "number") {
        // Extract number
        const match = (userMessage || "").match(/\d+/);
        parsedValue = match ? parseInt(match[0], 10) : (currentQuestion.field === "age" ? 30 : 28);
      } else if (parseType === "symptoms") {
        // Use selected symptoms array
        parsedValue = selectedSymptoms || [];
      } else if (parseType === "anchor") {
        // Use anchor symptom
        parsedValue = anchorSymptom || userMessage?.trim() || "";
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

      // Build metadata for next message
      const nextMetadata: Record<string, any> = { 
        onboarding_step: nextStep, 
        expecting_field: nextQuestion.field,
        input_type: nextQuestion.inputType,
        onboarding_complete: nextStep === ONBOARDING_QUESTIONS.length - 1
      };

      // If symptoms step, include the categories
      if (nextQuestion.inputType === "symptom_picker") {
        nextMetadata.symptom_categories = SYMPTOM_CATEGORIES;
      }

      // If anchor step, include the selected symptoms
      if (nextQuestion.inputType === "anchor_picker") {
        // Get the symptoms from participant or from the message we just processed
        const symptomsForAnchor = participant?.typical_symptoms || selectedSymptoms || [];
        nextMetadata.available_symptoms = symptomsForAnchor;
      }

      // Insert the next question
      const { error: nextError } = await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: nextMessage,
        message_type: nextStep === ONBOARDING_QUESTIONS.length - 1 ? "text" : "onboarding",
        metadata: nextMetadata
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
