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

// Onboarding question flow - simplified for beginners
const ONBOARDING_QUESTIONS = [
  {
    key: "age",
    message: "First things first — how old are you?",
    field: "age",
    parseType: "number",
    inputType: "text"
  },
  {
    key: "cycle_length",
    message: "How many days is your cycle? (From the start of one period to the start of the next.)\n\nMost people are somewhere between 24 and 35 days. If you're not sure, that's totally fine — tap \"I'm not sure\" below.",
    field: "cycle_length_days",
    parseType: "number",
    inputType: "text",
    showNotSure: true
  },
  {
    key: "last_period",
    message: "When did your last period start? Even a rough guess works — you can update it later.",
    field: "last_period_start",
    parseType: "date",
    inputType: "date_picker",
    showNotSure: true
  },
  {
    key: "symptoms",
    message: "Now let's talk about what you actually feel. Pick anything that sounds familiar — there are no wrong answers.",
    field: "typical_symptoms",
    parseType: "symptoms",
    inputType: "symptom_picker"
  },
  {
    key: "anchor_symptom",
    message: "Which one bothers you the most? This is the one Logan will watch for — your early warning signal.",
    field: "anchor_symptom",
    parseType: "anchor",
    inputType: "anchor_picker"
  },
  {
    key: "complete",
    message: "You're all set! Logan now knows your cycle, your phase, and what to watch for. From here, everything gets personal.",
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

    const systemMessages = messages?.filter(m => m.message_type === "onboarding") || [];

    // Action: Initialize onboarding (send first message)
    if (action === "init") {
      if (messages && messages.length > 0) {
        console.log("User already has messages, skipping init");
        return new Response(
          JSON.stringify({ success: true, alreadyStarted: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let userName = "there";
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

      // Welcome message
      const welcomeMsg = `Hey ${userName}! I'm Logan — I help you understand how your cycle affects how you feel, think, and perform.\n\nLet me learn a few things about you so I can make this personal. It'll take about 2 minutes.`;

      await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: welcomeMsg,
        message_type: "onboarding",
        metadata: { 
          onboarding_step: -1,
          insight_type: "welcome"
        }
      });

      // Brief pause, then send the cycle basics education card
      await new Promise(resolve => setTimeout(resolve, 800));

      await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: "Here's the big picture of how your cycle works:",
        message_type: "text",
        metadata: { 
          visual_type: "education_cycle_basics",
          insight_type: "education"
        }
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Now send the first question
      const welcomeQ = ONBOARDING_QUESTIONS[0];
      await supabase.from("chat_messages").insert({
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

      console.log("Sent welcome + education + first question to:", userName);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: Process user response and continue onboarding
    if (action === "respond") {
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
      
      if (currentStep >= ONBOARDING_QUESTIONS.length - 1) {
        return new Response(
          JSON.stringify({ success: true, onboardingComplete: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parse the user's response
      let parsedValue: any = userMessage?.trim() || "";
      const parseType = currentQuestion.parseType;

      if (parseType === "date") {
        parsedValue = selectedDate || parseNaturalDate(userMessage || "");
      } else if (parseType === "number") {
        const match = (userMessage || "").match(/\d+/);
        parsedValue = match ? parseInt(match[0], 10) : (currentQuestion.field === "age" ? 30 : 28);
      } else if (parseType === "symptoms") {
        parsedValue = selectedSymptoms || [];
      } else if (parseType === "anchor") {
        parsedValue = anchorSymptom || userMessage?.trim() || "";
      }

      // Get user's name
      let userName = "";
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      if (profile?.full_name) userName = profile.full_name;

      // Update participant record
      if (participant && currentQuestion.field) {
        const updateData: Record<string, any> = {};
        updateData[currentQuestion.field] = parsedValue;
        await supabase.from("participants").update(updateData).eq("id", participant.id);
        console.log("Updated participant field:", currentQuestion.field, "=", parsedValue);
      } else if (!participant && currentQuestion.field) {
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

      const nextStep = currentStep + 1;
      const nextQuestion = ONBOARDING_QUESTIONS[nextStep];

      // ─── Educational moments between steps ───────────────────────

      // After AGE → show hormone basics before asking cycle length
      if (currentQuestion.key === "age") {
        await supabase.from("chat_messages").insert({
          user_id: user.id,
          role: "assistant",
          content: "Your body has two main hormones that rise and fall each month — they're behind most of what you feel:",
          message_type: "text",
          metadata: {
            visual_type: "education_hormones",
            insight_type: "education"
          }
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // After LAST PERIOD → show cycle circle + educational context
      if (currentQuestion.key === "last_period") {
        const cycleLength = participant?.cycle_length_days || 28;
        const cycleInfo = calculateCycleInfo(parsedValue, cycleLength);

        if (cycleInfo) {
          const phaseTidbits: Record<string, string> = {
            Menstruation: `You're on **day ${cycleInfo.cycleDay}** — that's your period. Your hormones are at their lowest right now, which is why you might feel tired or low energy. That's completely normal.`,
            Follicular: `You're on **day ${cycleInfo.cycleDay}** — the build-up phase. Your energy is climbing and your brain is getting sharper. This is when most people start feeling "like themselves" again.`,
            Ovulation: `You're on **day ${cycleInfo.cycleDay}** — your peak! Energy and confidence are at their highest right now. This is a short window, so make the most of it.`,
            Luteal: `You're on **day ${cycleInfo.cycleDay}** — the wind-down phase. Things might feel heavier or more frustrating than last week. That's your hormones shifting, not you.`
          };

          const tidbit = phaseTidbits[cycleInfo.phase] || phaseTidbits.Follicular;

          await supabase.from("chat_messages").insert({
            user_id: user.id,
            role: "assistant",
            content: tidbit,
            message_type: "text",
            metadata: {
              has_cycle_visual: true,
              visual_type: "cycle_circle",
              cycle_day: cycleInfo.cycleDay,
              cycle_phase: cycleInfo.phase,
              cycle_length_days: cycleLength,
              insight_type: "onboarding_reveal"
            }
          });

          await new Promise(resolve => setTimeout(resolve, 1000));

          // Show symptom explainer card before the symptom question
          await supabase.from("chat_messages").insert({
            user_id: user.id,
            role: "assistant",
            content: "Most of what you feel follows a pattern tied to your cycle. Here's what that looks like:",
            message_type: "text",
            metadata: {
              visual_type: "education_symptoms",
              insight_type: "education"
            }
          });

          await new Promise(resolve => setTimeout(resolve, 800));
        }
      }

      // After SYMPTOMS → validate and show symptom map
      if (currentQuestion.key === "symptoms" && selectedSymptoms && selectedSymptoms.length > 0) {
        const cycleLength = participant?.cycle_length_days || 28;
        const cycleInfo = calculateCycleInfo(participant?.last_period_start, cycleLength);

        const symptomList = selectedSymptoms.slice(0, 3);
        const hasEmotional = selectedSymptoms.some((s: string) => SYMPTOM_CATEGORIES.emotional.symptoms.includes(s));
        const hasPhysical = selectedSymptoms.some((s: string) => SYMPTOM_CATEGORIES.physical.symptoms.includes(s));
        const hasQuirky = selectedSymptoms.some((s: string) => SYMPTOM_CATEGORIES.quirky.symptoms.includes(s));

        let validationMsg = "";

        if (hasEmotional && hasPhysical) {
          validationMsg = `${symptomList.join(", ")}${selectedSymptoms.length > 3 ? ` and ${selectedSymptoms.length - 3} more` : ""}. You're getting hit on both sides — mind and body. That's really common, and it usually gets worse in the last 2 weeks of your cycle. Most people don't connect those dots.`;
        } else if (hasEmotional) {
          validationMsg = `${symptomList.join(", ")}${selectedSymptoms.length > 3 ? ` and ${selectedSymptoms.length - 3} more` : ""}. These are linked to a hormone called progesterone — it ramps up in the second half of your cycle. You're not imagining it.`;
        } else if (hasPhysical) {
          validationMsg = `${symptomList.join(", ")}${selectedSymptoms.length > 3 ? ` and ${selectedSymptoms.length - 3} more` : ""}. Your body is telling you where it struggles most. These tend to follow your hormonal shifts — especially in the last 2 weeks before your period.`;
        } else {
          validationMsg = `${symptomList.join(", ")}${selectedSymptoms.length > 3 ? ` and ${selectedSymptoms.length - 3} more` : ""}. These follow your hormonal pattern more closely than you might think. Once you start noticing when they hit, it stops being a surprise.`;
        }

        if (hasQuirky) {
          validationMsg += " And yeah — the weird ones are real too. Hormones do strange things.";
        }

        const metadata: Record<string, any> = { insight_type: "symptom_validation" };
        if (cycleInfo) {
          metadata.has_cycle_visual = true;
          metadata.visual_type = "symptom_map";
          metadata.cycle_day = cycleInfo.cycleDay;
          metadata.cycle_phase = cycleInfo.phase;
          metadata.cycle_length_days = cycleLength;
          metadata.validated_symptoms = selectedSymptoms;
        }

        await supabase.from("chat_messages").insert({
          user_id: user.id,
          role: "assistant",
          content: validationMsg,
          message_type: "text",
          metadata
        });

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Show anchor explainer before the anchor question
        await supabase.from("chat_messages").insert({
          user_id: user.id,
          role: "assistant",
          content: "Now let's pick your anchor symptom:",
          message_type: "text",
          metadata: {
            visual_type: "education_anchor",
            insight_type: "education"
          }
        });

        await new Promise(resolve => setTimeout(resolve, 800));
      }

      // Build metadata for next message
      const nextMetadata: Record<string, any> = { 
        onboarding_step: nextStep, 
        expecting_field: nextQuestion.field,
        input_type: nextQuestion.inputType,
        onboarding_complete: nextStep === ONBOARDING_QUESTIONS.length - 1
      };

      if (nextQuestion.inputType === "symptom_picker") {
        nextMetadata.symptom_categories = SYMPTOM_CATEGORIES;
      }
      if (nextQuestion.inputType === "anchor_picker") {
        const symptomsForAnchor = participant?.typical_symptoms || selectedSymptoms || [];
        nextMetadata.available_symptoms = symptomsForAnchor;
      }
      if ((nextQuestion as any).showNotSure) {
        nextMetadata.show_not_sure = (nextQuestion as any).key === "cycle_length" ? "cycle_length" : "last_period";
      }

      const { error: nextError } = await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: nextQuestion.message,
        message_type: nextStep === ONBOARDING_QUESTIONS.length - 1 ? "text" : "onboarding",
        metadata: nextMetadata
      });

      if (nextError) {
        console.error("Error inserting next question:", nextError);
        throw nextError;
      }

      console.log("Sent question step:", nextStep);

      // If onboarding is complete, send the first insight
      if (nextStep === ONBOARDING_QUESTIONS.length - 1 && participant) {
        const cycleInfo = calculateCycleInfo(participant.last_period_start, participant.cycle_length_days);

        if (cycleInfo) {
          const firstInsight = generateFirstInsight(
            cycleInfo.phase,
            cycleInfo.cycleDay,
            participant.anchor_symptom || anchorSymptom
          );

          await new Promise(resolve => setTimeout(resolve, 1500));

          const { error: insightError } = await supabase.from("chat_messages").insert({
            user_id: user.id,
            role: "assistant",
            content: firstInsight,
            message_type: "text",
            metadata: {
              has_cycle_visual: true,
              visual_type: "hormone_chart",
              cycle_day: cycleInfo.cycleDay,
              cycle_phase: cycleInfo.phase,
              cycle_length_days: participant.cycle_length_days || 28,
              insight_type: "awareness"
            }
          });

          if (insightError) {
            console.error("Error sending first insight:", insightError);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, onboardingComplete: nextStep === ONBOARDING_QUESTIONS.length - 1 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: Go back to a previous step
    if (action === "go_back") {
      const { targetStep } = body;
      
      if (targetStep === undefined || targetStep < 0 || targetStep >= ONBOARDING_QUESTIONS.length - 1) {
        return new Response(
          JSON.stringify({ error: "Invalid target step" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const targetStepMessages = messages?.filter(
        m => m.metadata?.onboarding_step !== undefined && (m.metadata as any).onboarding_step >= targetStep
      ) || [];

      if (targetStepMessages.length > 0) {
        const cutoffTime = targetStepMessages[0].created_at;
        const { error: deleteError } = await supabase
          .from("chat_messages")
          .delete()
          .eq("user_id", user.id)
          .gte("created_at", cutoffTime);

        if (deleteError) {
          console.error("Error deleting messages:", deleteError);
          throw deleteError;
        }
      }

      const targetQuestion = ONBOARDING_QUESTIONS[targetStep];
      const targetMetadata: Record<string, any> = {
        onboarding_step: targetStep,
        expecting_field: targetQuestion.field,
        input_type: targetQuestion.inputType
      };

      if (targetQuestion.inputType === "symptom_picker") {
        targetMetadata.symptom_categories = SYMPTOM_CATEGORIES;
      }
      if (targetQuestion.inputType === "anchor_picker") {
        const symptomsForAnchor = participant?.typical_symptoms || [];
        targetMetadata.available_symptoms = symptomsForAnchor;
      }
      if ((targetQuestion as any).showNotSure) {
        targetMetadata.show_not_sure = (targetQuestion as any).key === "cycle_length" ? "cycle_length" : "last_period";
      }

      await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: targetQuestion.message,
        message_type: "onboarding",
        metadata: targetMetadata
      });

      console.log("Went back to step:", targetStep);

      return new Response(
        JSON.stringify({ success: true, wentBackToStep: targetStep }),
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

  if (lower.includes("approximate") || lower.includes("not sure") || lower.includes("2 weeks")) {
    const date = new Date(now);
    date.setDate(date.getDate() - 14);
    return date.toISOString().split("T")[0];
  }

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

  if (lower.includes("yesterday")) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split("T")[0];
  }

  if (lower.includes("today")) {
    return now.toISOString().split("T")[0];
  }

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
        if (date > now) {
          date.setFullYear(date.getFullYear() - 1);
        }
        return date.toISOString().split("T")[0];
      }
    }
  }

  const defaultDate = new Date(now);
  defaultDate.setDate(defaultDate.getDate() - 7);
  return defaultDate.toISOString().split("T")[0];
}

// Helper: Calculate cycle day and phase
function calculateCycleInfo(
  lastPeriodStart: string | null,
  cycleLengthDays: number | null
): { cycleDay: number; phase: string } | null {
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

// Helper: Generate first insight
function generateFirstInsight(phase: string, cycleDay: number, anchorSymptom: string | null): string {
  const phaseInsights: Record<string, string> = {
    Menstruation: `Here's your first personal insight 👇\n\n**Day ${cycleDay} — Period phase**\n\n- **Energy**: Low — your body is resetting\n- **What to expect**: Rest feels more productive than pushing through\n${anchorSymptom ? `- **Your anchor (${anchorSymptom.toLowerCase()})**: tends to show up here` : "- **Tip**: Gentle movement over intensity"}\n\nThis isn't a setback — it's your body clearing the slate for what comes next.`,

    Follicular: `Here's your first personal insight 👇\n\n**Day ${cycleDay} — Build-up phase**\n\n- **Energy**: Rising — estrogen is doing the work\n- **Brain**: Clearer thinking, better focus\n${anchorSymptom ? `- **Your anchor (${anchorSymptom.toLowerCase()})**: usually eases up now` : "- **Tip**: Great time to tackle something that felt hard last week"}\n\nThis energy builds. Use it.`,

    Ovulation: `Here's your first personal insight 👇\n\n**Day ${cycleDay} — Peak phase**\n\n- **Energy**: Highest of the month\n- **Superpower**: Confidence and communication peak here\n${anchorSymptom ? `- **Your anchor (${anchorSymptom.toLowerCase()})**: can spike when everything runs high` : "- **Tip**: Schedule important conversations now"}\n\nShort window. Make it count.`,

    Luteal: `Here's your first personal insight 👇\n\n**Day ${cycleDay} — Wind-down phase**\n\n- **Energy**: Dropping — everything takes more effort\n- **Mood**: Patience thins, stress tolerance drops\n${anchorSymptom ? `- **Your anchor (${anchorSymptom.toLowerCase()})**: usually peaks in this window` : "- **Tip**: Front-load hard tasks to early this week"}\n\nNot a character flaw. It's chemistry.`
  };

  return phaseInsights[phase] || phaseInsights.Follicular;
}
