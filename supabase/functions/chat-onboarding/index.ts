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
    key: "age",
    message: "Hey {name}. I'm Logan. I help you work with your cycle instead of against it. To give you useful insights on energy, focus, and recovery, I need to learn your patterns. Let's start simple: how old are you?",
    field: "age",
    parseType: "number",
    inputType: "text"
  },
  {
    key: "cycle_length",
    message: "Got it. How long is your typical cycle in days? Most fall between 24-35. If you're not sure, 28 is a fair starting point.",
    field: "cycle_length_days",
    parseType: "number",
    inputType: "text"
  },
  {
    key: "last_period",
    message: "When did your last period start? This helps me figure out where you are in your cycle right now.",
    field: "last_period_start",
    parseType: "date",
    inputType: "date_picker"
  },
  {
    key: "symptoms",
    message: "Now the important part. Which of these tend to hit you around your cycle? Select everything that disrupts your energy, mood, or focus.",
    field: "typical_symptoms",
    parseType: "symptoms",
    inputType: "symptom_picker"
  },
  {
    key: "anchor_symptom",
    message: "Which one throws you off the most? This becomes your Anchor Symptom, the thing I'll help you see coming before it arrives.",
    field: "anchor_symptom",
    parseType: "anchor",
    inputType: "anchor_picker"
  },
  {
    key: "complete",
    message: "You're all set. I'll start learning your patterns and send you insights you can actually use: when to push, when to ease up, and how to plan around what's coming. Welcome aboard.",
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

      // Get user's name from profile or participant record
      let userName = "there";
      
      // Try to get name from profiles table
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      
      if (profile?.full_name) {
        userName = profile.full_name.split(" ")[0];
      } else if (participant?.full_name) {
        userName = participant.full_name.split(" ")[0];
      }

      // Send welcome message with personalized name
      const welcomeQ = ONBOARDING_QUESTIONS[0];
      const personalizedMessage = welcomeQ.message.replace("{name}", userName);
      
      const { error: insertError } = await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: personalizedMessage,
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

      console.log("Sent welcome message to:", userName);
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

      // Get user's name from profile for participant creation
      let userName = "";
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      
      if (profile?.full_name) {
        userName = profile.full_name;
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
        // Create participant record on first response (age question)
        const { data: newParticipant, error: createError } = await supabase
          .from("participants")
          .insert({
            full_name: userName || user.email?.split("@")[0] || "User",
            email: user.email,
            whatsapp_number: user.email || "web-user",
            consent_given: true,
            consent_given_at: new Date().toISOString(),
            preferred_channel: "web",
            is_active: true,
            [currentQuestion.field]: parsedValue
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

      // Move to next question
      const nextStep = currentStep + 1;
      const nextQuestion = ONBOARDING_QUESTIONS[nextStep];
      const nextMessage = nextQuestion.message;
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

      // If onboarding is complete, send the first insight with cycle circle
      if (nextStep === ONBOARDING_QUESTIONS.length - 1 && participant) {
        // Calculate cycle info
        const cycleInfo = calculateCycleInfo(
          participant.last_period_start,
          participant.cycle_length_days
        );

        if (cycleInfo) {
          const firstInsight = generateFirstInsight(
            cycleInfo.phase,
            cycleInfo.cycleDay,
            participant.anchor_symptom || anchorSymptom
          );

          // Wait a moment before sending the insight
          await new Promise(resolve => setTimeout(resolve, 1500));

          const { error: insightError } = await supabase.from("chat_messages").insert({
            user_id: user.id,
            role: "assistant",
            content: firstInsight,
            message_type: "text",
            metadata: {
              has_cycle_visual: true,
              cycle_day: cycleInfo.cycleDay,
              cycle_phase: cycleInfo.phase,
              cycle_length_days: participant.cycle_length_days || 28,
              insight_type: "awareness"
            }
          });

          if (insightError) {
            console.error("Error sending first insight:", insightError);
          } else {
            console.log("Sent first insight for phase:", cycleInfo.phase);
          }
        }
      }

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

// Helper: Calculate cycle day and phase from dates
function calculateCycleInfo(
  lastPeriodStart: string | null,
  cycleLengthDays: number | null
): { cycleDay: number; phase: string } | null {
  if (!lastPeriodStart || !cycleLengthDays) return null;

  const today = new Date();
  const periodStart = new Date(lastPeriodStart);
  const diffTime = today.getTime() - periodStart.getTime();
  const daysSinceStart = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  // Calculate current day in cycle (1-indexed, wrapping around)
  const cycleDay = ((daysSinceStart % cycleLengthDays) + cycleLengthDays) % cycleLengthDays + 1;

  // Determine phase using biological model
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

// Helper: Generate first insight based on phase
function generateFirstInsight(phase: string, cycleDay: number, anchorSymptom: string | null): string {
  const phaseInsights: Record<string, string> = {
    Menstruation: `Day ${cycleDay}. Your body is shedding and resetting. Energy is typically at its lowest, and inflammation markers tend to peak. ${anchorSymptom ? `Watch for ${anchorSymptom.toLowerCase()} to show up stronger than usual.` : "This is a good window to prioritize rest over performance."}`,
    
    Follicular: `Day ${cycleDay}. Estrogen is climbing, which usually means sharper focus, better verbal fluency, and rising energy. ${anchorSymptom ? `Your ${anchorSymptom.toLowerCase()} tends to ease during this phase.` : "Good window for challenging work, social energy, and starting new projects."}`,
    
    Ovulation: `Day ${cycleDay}. You're in your fertile window. Estrogen peaks, often bringing peak social energy and confidence. ${anchorSymptom ? `If ${anchorSymptom.toLowerCase()} hits, it may feel amplified.` : "Communication and collaboration tend to flow more easily now."}`,
    
    Luteal: `Day ${cycleDay}. Progesterone is dominant now, which can lower stress tolerance and shorten your fuse. ${anchorSymptom ? `This is when ${anchorSymptom.toLowerCase()} typically surfaces for you.` : "Notice if you're more reactive or need more recovery time than usual."}`
  };

  return phaseInsights[phase] || phaseInsights.Follicular;
}
