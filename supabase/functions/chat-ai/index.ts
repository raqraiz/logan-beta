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

    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();

    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // --- Credit check (DISABLED — free access during alpha) ---
    const CREDITS_ENABLED = false;
    
    // Check if onboarding is complete (still needed for other logic)
    const { data: onboardingCheck } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "assistant")
      .contains("metadata", { onboarding_complete: true })
      .limit(1);

    const isOnboardingComplete = onboardingCheck && onboardingCheck.length > 0;

    if (CREDITS_ENABLED && isOnboardingComplete) {
      // Get or create user credits
      let { data: credits } = await supabase
        .from("user_credits")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (!credits) {
        const { data: newCredits, error: createError } = await supabase
          .from("user_credits")
          .insert({ user_id: user.id, free_credits: 5, paid_credits: 0, free_credits_reset_at: new Date().toISOString() })
          .select()
          .single();
        if (createError) {
          console.error("Error creating credits:", createError);
          return new Response(
            JSON.stringify({ error: "Failed to initialize credits" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        credits = newCredits;
      }

      // Check if free credits should be reset (24h)
      const resetAt = new Date(credits.free_credits_reset_at);
      const now = new Date();
      const hoursSinceReset = (now.getTime() - resetAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceReset >= 24) {
        await supabase
          .from("user_credits")
          .update({ free_credits: 5, free_credits_reset_at: now.toISOString() })
          .eq("user_id", user.id);
        credits.free_credits = 5;
        credits.free_credits_reset_at = now.toISOString();
      }

      const totalCredits = credits.free_credits + credits.paid_credits;
      if (totalCredits <= 0) {
        return new Response(
          JSON.stringify({ error: "no_credits", message: "You're out of credits. Purchase more to continue chatting." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Deduct 1 credit (free first, then paid)
      if (credits.free_credits > 0) {
        await supabase
          .from("user_credits")
          .update({ free_credits: credits.free_credits - 1 })
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("user_credits")
          .update({ paid_credits: credits.paid_credits - 1 })
          .eq("user_id", user.id);
      }

      // Log transaction
      await supabase.from("credit_transactions").insert({
        user_id: user.id,
        amount: -1,
        type: "usage",
        description: "Chat message",
      });

      // Check if user just used their 5th credit ever — award bonus
      if (!credits.bonus_credits_awarded) {
        const { count } = await supabase
          .from("credit_transactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("type", "usage");

        if (count && count >= 5) {
          const { data: current } = await supabase
            .from("user_credits")
            .select("paid_credits")
            .eq("user_id", user.id)
            .single();

          if (current) {
            await supabase
              .from("user_credits")
              .update({ paid_credits: current.paid_credits + 10, bonus_credits_awarded: true })
              .eq("user_id", user.id);
          }

          await supabase.from("credit_transactions").insert({
            user_id: user.id,
            amount: 10,
            type: "bonus",
            description: "Complimentary credits — thanks for chatting with Logan!",
          });
        }
      }
    }
    // --- End credit check ---

    // Get participant data for context
    let { data: participant } = await supabase
      .from("participants")
      .select("*")
      .eq("email", user.email)
      .single();

    // --- Period confirmation detection ---
    const { data: lastAssistantMsg } = await supabase
      .from("chat_messages")
      .select("metadata")
      .eq("user_id", user.id)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    
    const wasPeridCheckin = (lastAssistantMsg?.metadata as any)?.period_checkin === true;

    const referencesHistoricalDate = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/i.test(userMessage)
      || /last (month|cycle|time)/i.test(userMessage)
      || /\d{4}/.test(userMessage);

    const dayOfWeekPattern = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i;

    const periodConfirmPatterns = [
      /^yes,?\s*(it )?(started|period|got it|began|came)/i,
      /started (today|yesterday|this morning|last night)/i,
      /^(i )?(got|getting) my period/i,
      /^it started/i,
      /period started (today|yesterday|this morning|last night)/i,
      /started yesterday/i,
      /my period (just )?(started|came|arrived|began)/i,
      /^(i )?(just )?(got|started|had) (my |the )?period/i,
      /got it yesterday/i,
      // Day-of-week variants: "period began Tuesday", "started on Monday", "got my period friday"
      /(?:period|it)\s+(?:started|began|came|arrived)\s+(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)/i,
      /(?:started|began|came|got it)\s+(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)/i,
    ];
    
    const bareYesPatterns = [/^yes$/i, /^yes,? (it )?(started|has|did)/i];
    const isBareYes = bareYesPatterns.some(p => p.test(userMessage.trim()));
    
    const isPeriodConfirmation = !referencesHistoricalDate && (
      periodConfirmPatterns.some(p => p.test(userMessage)) ||
      (isBareYes && wasPeridCheckin)
    );

    // Helper: resolve a day-of-week name to the most recent past date
    function resolveDayOfWeek(dayName: string): Date {
      const dayMap: Record<string, number> = {
        sunday: 0, sun: 0,
        monday: 1, mon: 1,
        tuesday: 2, tue: 2, tues: 2,
        wednesday: 3, wed: 3,
        thursday: 4, thu: 4, thur: 4, thurs: 4,
        friday: 5, fri: 5,
        saturday: 6, sat: 6,
      };
      const target = dayMap[dayName.toLowerCase()];
      const now = new Date();
      const current = now.getDay();
      let diff = current - target;
      if (diff <= 0) diff += 7; // always go to the most recent past occurrence
      const result = new Date(now);
      result.setDate(result.getDate() - diff);
      return result;
    }

    if (isPeriodConfirmation && participant) {
      let periodStartDate = new Date();

      const dayOfWeekMatch = userMessage.match(dayOfWeekPattern);
      const daysAgoMatch = userMessage.match(/(\d+)\s+days?\s+ago/i);
      if (dayOfWeekMatch) {
        periodStartDate = resolveDayOfWeek(dayOfWeekMatch[1]);
      } else if (daysAgoMatch) {
        periodStartDate.setDate(periodStartDate.getDate() - parseInt(daysAgoMatch[1]));
      } else if (/yesterday/i.test(userMessage)) {
        periodStartDate.setDate(periodStartDate.getDate() - 1);
      } else if (/this morning/i.test(userMessage) || /last night/i.test(userMessage) || /today/i.test(userMessage)) {
        // stays today
      }
      if (/a few days ago/i.test(userMessage) && !daysAgoMatch) {
        periodStartDate.setDate(periodStartDate.getDate() - 2);
      }
      const formattedDate = periodStartDate.toISOString().split("T")[0];

      let previousCycleLength: number | null = null;
      if (participant.last_period_start) {
        const prevStart = new Date(participant.last_period_start);
        const newStart = new Date(formattedDate);
        const diffDays = Math.round((newStart.getTime() - prevStart.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays >= 15 && diffDays <= 60) {
          previousCycleLength = diffDays;
          await supabase
            .from("cycle_history")
            .insert({
              participant_id: participant.id,
              cycle_start_date: participant.last_period_start,
              cycle_end_date: formattedDate,
              cycle_length_days: diffDays,
            });
        }
      }

      const { error: updateError } = await supabase
        .from("participants")
        .update({ last_period_start: formattedDate })
        .eq("id", participant.id);

      if (!updateError) {
        const { data: refreshed } = await supabase
          .from("participants")
          .select("*")
          .eq("id", participant.id)
          .single();
        if (refreshed) participant = refreshed;
      }

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

      const newCycleInfo = calculateCycleInfo(formattedDate, participant.cycle_length_days || 28, participant.timezone || "UTC");

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
          last_period_start: formattedDate,
          timezone: participant.timezone || "UTC",
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

    // --- Cycle edit detection (cycle length or period date changes via chat) ---
    if (participant) {
      // Detect cycle length change: "change my cycle length to 30", "my cycle is 32 days", "set cycle to 26 days"
      const cycleLengthMatch = userMessage.match(
        /(?:change|set|update|make|switch)\s+(?:my\s+)?cycle\s*(?:length)?\s*(?:to|=)\s*(\d{2,})/i
      ) || userMessage.match(
        /(?:my\s+)?cycle\s*(?:length)?\s*(?:is|should be|is actually)\s*(\d{2,})\s*days?/i
      ) || userMessage.match(
        /cycle\s*(?:length)?\s*(?:to)\s*(\d{2,})\s*days?/i
      );

      // Detect period date change: "my period started on March 15", "change my period date to April 2"
      const periodDateMatch = userMessage.match(
        /(?:period|last period|period date)\s+(?:started|began|was|start)\s+(?:on\s+)?(?:the\s+)?(\w+\s+\d{1,2}(?:,?\s*\d{4})?)/i
      ) || userMessage.match(
        /(?:change|set|update)\s+(?:my\s+)?(?:period|period date|last period)\s+(?:to|date to)\s+(\w+\s+\d{1,2}(?:,?\s*\d{4})?)/i
      );

      if (cycleLengthMatch) {
        const newLength = parseInt(cycleLengthMatch[1]);
        if (newLength >= 18 && newLength <= 45) {
          const { error: updateErr } = await supabase
            .from("participants")
            .update({ cycle_length_days: newLength })
            .eq("id", participant.id);

          if (!updateErr) {
            const { data: refreshed } = await supabase
              .from("participants")
              .select("*")
              .eq("id", participant.id)
              .single();
            if (refreshed) participant = refreshed;

            const updatedCycleInfo = calculateCycleInfo(
              participant.last_period_start || new Date().toISOString().split("T")[0],
              newLength,
              participant.timezone || "UTC"
            );

            const msg = `Done — cycle length updated to **${newLength} days**. That puts you on **Day ${updatedCycleInfo.cycleDay}** in your **${updatedCycleInfo.phase}** phase now.`;

            await supabase.from("chat_messages").insert({
              user_id: user.id,
              role: "assistant",
              content: msg,
              message_type: "text",
              metadata: {
                cycle_day: updatedCycleInfo.cycleDay,
                cycle_phase: updatedCycleInfo.phase,
                has_cycle_visual: true,
                visual_type: "cycle_circle",
                cycle_length_days: newLength,
                last_period_start: participant.last_period_start,
                timezone: participant.timezone || "UTC",
                cycle_length_update: true,
              }
            });

            return new Response(
              JSON.stringify({
                success: true,
                message: msg,
                cycleInfo: updatedCycleInfo,
                cycleLengthUpdated: true,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      if (periodDateMatch) {
        const dateStr = periodDateMatch[1];
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime()) && parsed <= new Date()) {
          const formattedDate = parsed.toISOString().split("T")[0];

          // Archive previous cycle if applicable
          let previousCycleLength: number | null = null;
          if (participant.last_period_start) {
            const prevStart = new Date(participant.last_period_start);
            const diffDays = Math.round((parsed.getTime() - prevStart.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays >= 15 && diffDays <= 60) {
              previousCycleLength = diffDays;
              await supabase.from("cycle_history").insert({
                participant_id: participant.id,
                cycle_start_date: participant.last_period_start,
                cycle_end_date: formattedDate,
                cycle_length_days: diffDays,
              });
            }
          }

          const { error: updateErr } = await supabase
            .from("participants")
            .update({ last_period_start: formattedDate })
            .eq("id", participant.id);

          if (!updateErr) {
            const { data: refreshed } = await supabase
              .from("participants")
              .select("*")
              .eq("id", participant.id)
              .single();
            if (refreshed) participant = refreshed;

            const updatedCycleInfo = calculateCycleInfo(
              formattedDate,
              participant.cycle_length_days || 28,
              participant.timezone || "UTC"
            );

            let msg = `Done — updated your last period start to **${parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" })}**. You're on **Day ${updatedCycleInfo.cycleDay}** in your **${updatedCycleInfo.phase}** phase.`;
            if (previousCycleLength) {
              msg += ` That last cycle was **${previousCycleLength} days**.`;
            }

            await supabase.from("chat_messages").insert({
              user_id: user.id,
              role: "assistant",
              content: msg,
              message_type: "text",
              metadata: {
                cycle_day: updatedCycleInfo.cycleDay,
                cycle_phase: updatedCycleInfo.phase,
                has_cycle_visual: true,
                visual_type: "cycle_circle",
                cycle_length_days: participant.cycle_length_days || 28,
                last_period_start: formattedDate,
                timezone: participant.timezone || "UTC",
                period_update: true,
                new_period_start: formattedDate,
                previous_cycle_length: previousCycleLength,
              }
            });

            return new Response(
              JSON.stringify({
                success: true,
                message: msg,
                cycleInfo: updatedCycleInfo,
                periodUpdated: true,
                previousCycleLength,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
    }
    // --- End cycle edit detection ---

    // --- Meal plan intent detection ---
    // If the user asks about food/meals/recipes, let Logan answer normally first,
    // then append a small follow-up bubble offering the full cycle-synced meal plan resource.
    let shouldOfferMealPlan = false;
    {
      const mealPlanPatterns: RegExp[] = [
        /\bmeal\s*plan(s|ner)?\b/i,
        /\b(make|create|build|generate|give me|i want|can you (make|create|build|give))\b[^.?!]{0,60}\b(meal|recipe|menu|food|grocery|shopping)\b/i,
        /\bwhat (should|do|can|to) i?\s*(eat|cook|make for (breakfast|lunch|dinner|a meal))\b/i,
        /\bwhat'?s? (good|best) to eat\b/i,
        /\b(weekly|monthly|cyclical|cycle[- ]synced)\s+(meal|menu|food|recipe)/i,
        /\b(grocery|shopping)\s+list\b/i,
        /\b(recipes?|menu)\s+(for|by|that match|aligned with)\b[^.?!]{0,40}\b(cycle|phase|week|hormones?)\b/i,
        /\b(food|meal|recipe|menu)s?\s+(suggestions?|ideas?|for (this|my) (phase|cycle|week))\b/i,
      ];
      shouldOfferMealPlan = mealPlanPatterns.some(p => p.test(userMessage));
    }
    // --- End meal plan intent ---

    // --- Symptom logging from chat ---
    // Detect symptoms mentioned in the user's message and persist to symptom_logs
    // so they sync with the Home tab's symptom widget / history.
    {
      const SYMPTOM_KEYWORDS: { name: string; patterns: RegExp[] }[] = [
        { name: "Cramps", patterns: [/\bcramp(s|ing|y)?\b/i, /\bperiod pain\b/i] },
        { name: "Bloating", patterns: [/\bbloat(ed|ing)?\b/i] },
        { name: "Headache", patterns: [/\bheadache(s)?\b/i, /\bmigraine(s)?\b/i] },
        { name: "Fatigue", patterns: [/\bfatigue(d)?\b/i, /\bexhaust(ed|ion)\b/i, /\bso tired\b/i, /\bwiped out\b/i, /\bdrained\b/i] },
        { name: "Back pain", patterns: [/\bback pain\b/i, /\bbackache\b/i, /\blower back\b/i] },
        { name: "Breast tenderness", patterns: [/\bbreast(s)?\s+(tender|sore|hurt)/i, /\bsore breasts?\b/i, /\btender breasts?\b/i] },
        { name: "Nausea", patterns: [/\bnausea(ted|ous)?\b/i, /\bqueasy\b/i, /\bnauseous\b/i] },
        { name: "Acne", patterns: [/\bacne\b/i, /\bbreak(ing )?out\b/i, /\bpimples?\b/i, /\bzits?\b/i] },
        { name: "Joint pain", patterns: [/\bjoint(s)? (pain|ache|hurt)/i, /\bachy joints\b/i] },
        { name: "Insomnia", patterns: [/\binsomnia\b/i, /\bcan'?t sleep\b/i, /\btrouble sleeping\b/i, /\bsleepless\b/i] },
        { name: "Mood swings", patterns: [/\bmood swing(s)?\b/i, /\bmoody\b/i, /\bemotional roller ?coaster\b/i] },
        { name: "Anxiety", patterns: [/\banxious\b/i, /\banxiety\b/i, /\bon edge\b/i, /\bpanick(y|ing)\b/i] },
        { name: "Irritability", patterns: [/\birritabl(e|y)\b/i, /\birritated\b/i, /\bsnappy\b/i, /\bshort temper(ed)?\b/i, /\bcranky\b/i] },
        { name: "Brain fog", patterns: [/\bbrain fog(gy)?\b/i, /\bfoggy\b/i, /\bcan'?t (think|focus|concentrate)\b/i] },
        { name: "Low motivation", patterns: [/\blow motivation\b/i, /\bunmotivated\b/i, /\bno motivation\b/i, /\bcan'?t get going\b/i] },
        { name: "Sadness", patterns: [/\b(feeling |so |really )?sad\b/i, /\bcrying\b/i, /\btearful\b/i, /\bdown\b/i, /\bblue\b/i] },
        { name: "Restlessness", patterns: [/\brestless\b/i, /\bantsy\b/i, /\bcan'?t sit still\b/i] },
        { name: "Overwhelm", patterns: [/\boverwhelmed\b/i, /\boverwhelm\b/i, /\btoo much\b/i] },
        { name: "High energy", patterns: [/\bhigh energy\b/i, /\benergized\b/i, /\bso much energy\b/i] },
        { name: "Low energy", patterns: [/\blow energy\b/i, /\bno energy\b/i, /\bsluggish\b/i, /\blethargic\b/i] },
        { name: "Sharp focus", patterns: [/\bsharp focus\b/i, /\blaser focus(ed)?\b/i, /\bvery focused\b/i] },
        { name: "Poor focus", patterns: [/\bpoor focus\b/i, /\bcan'?t focus\b/i, /\bdistracted\b/i, /\bunfocused\b/i] },
        { name: "Cravings", patterns: [/\bcravings?\b/i, /\bcraving (sugar|chocolate|carbs|salt)/i] },
        { name: "Hot flashes", patterns: [/\bhot flash(es)?\b/i, /\bhot flush(es)?\b/i] },
        { name: "Night sweats", patterns: [/\bnight sweats?\b/i, /\bsweating at night\b/i] },
        { name: "Spotting", patterns: [/\bspotting\b/i, /\blight bleeding\b/i] },
      ];

      // Loose intent: user is reporting how they feel (not asking a generic question)
      const reportingIntent = /\b(i\s*(?:'?m|am|feel|have|got|woke up|am having|am feeling)|my\s+(?:head|back|stomach|breasts?|joints?)|having|feeling|today i|right now)\b/i.test(userMessage)
        || /\b(log|track|record|note)\b/i.test(userMessage);

      if (reportingIntent) {
        const detected: { name: string; severity: number }[] = [];
        for (const { name, patterns } of SYMPTOM_KEYWORDS) {
          if (patterns.some(p => p.test(userMessage))) {
            // Severity heuristic: scan for intensity modifiers
            let severity = 3;
            if (/\b(mild|slight|tiny|barely|a bit|a little)\b/i.test(userMessage)) severity = 2;
            if (/\b(very mild|barely)\b/i.test(userMessage)) severity = 1;
            if (/\b(bad|strong|heavy|really|pretty|quite)\b/i.test(userMessage)) severity = 4;
            if (/\b(severe|terrible|awful|worst|excruciating|unbearable|killing me|so bad)\b/i.test(userMessage)) severity = 5;
            detected.push({ name, severity });
          }
        }

        if (detected.length > 0) {
          const liveCycle = participant?.last_period_start && participant?.cycle_length_days
            ? calculateCycleInfo(participant.last_period_start, participant.cycle_length_days, participant.timezone || "UTC")
            : null;

          const { error: symLogErr } = await supabase.from("symptom_logs").insert({
            user_id: user.id,
            symptoms: detected,
            notes: userMessage.length <= 500 ? userMessage : userMessage.slice(0, 500),
            cycle_day: liveCycle?.cycleDay ?? null,
            cycle_phase: liveCycle?.phase ?? null,
          });
          if (symLogErr) {
            console.error("Failed to insert symptom log from chat:", symLogErr);
          } else {
            console.log("Logged symptoms from chat:", detected.map(d => d.name).join(", "));
          }
        }
      }
    }
    // --- End symptom logging ---

    // --- Postpartum life-stage / birth-date detection ---
    if (participant) {
      const lowerMsg = userMessage.toLowerCase();

      // Patterns for "X months/weeks/days postpartum" or "X months/weeks after giving birth"
      const ppDurationMatch = userMessage.match(
        /(\d{1,2})\s*(month|months|week|weeks|day|days)\s*(?:postpartum|pp|after\s+(?:giving\s+)?birth|after\s+(?:my\s+)?baby|since\s+(?:i\s+)?(?:gave\s+birth|had\s+(?:my\s+)?baby))/i
      ) || userMessage.match(
        /(?:i'?m|i\s+am|currently)\s+(\d{1,2})\s*(month|months|week|weeks)\s*(?:postpartum|pp)/i
      );

      // Pattern for explicit birth date: "gave birth on March 5", "baby born April 12", "had my baby on Jan 3"
      const ppDateMatch = userMessage.match(
        /(?:gave\s+birth|had\s+(?:my\s+)?baby|baby\s+(?:was\s+)?born|delivered)\s+(?:on\s+)?(?:the\s+)?(\w+\s+\d{1,2}(?:,?\s*\d{4})?)/i
      );

      // Bare "I'm postpartum" mention with no duration/date
      const ppBareMention = /\b(?:i'?m|i\s+am|currently)\s+postpartum\b/i.test(userMessage)
        || /\bjust\s+had\s+(?:a\s+)?baby\b/i.test(userMessage);

      const isPostpartumSignal = ppDurationMatch || ppDateMatch || ppBareMention;

      if (isPostpartumSignal) {
        let computedStartDate: string | null = null;
        let askForDate = false;

        if (ppDateMatch) {
          const parsed = new Date(ppDateMatch[1]);
          if (!isNaN(parsed.getTime()) && parsed <= new Date()) {
            computedStartDate = parsed.toISOString().split("T")[0];
          }
        } else if (ppDurationMatch) {
          const n = parseInt(ppDurationMatch[1]);
          const unit = ppDurationMatch[2].toLowerCase();
          const days = unit.startsWith("month") ? n * 30 : unit.startsWith("week") ? n * 7 : n;
          const d = new Date();
          d.setDate(d.getDate() - days);
          computedStartDate = d.toISOString().split("T")[0];
          // Even with a duration, ask for the exact date for accuracy
          askForDate = true;
        } else {
          askForDate = true;
        }

        // Only act if life stage is changing OR start date is missing/changing
        const needsLifeStageSwitch = participant.life_stage !== "postpartum";
        const needsDateUpdate = computedStartDate && participant.postpartum_start_date !== computedStartDate;

        if (needsLifeStageSwitch || needsDateUpdate) {
          const updatePayload: any = { life_stage: "postpartum" };
          if (computedStartDate) updatePayload.postpartum_start_date = computedStartDate;

          const { error: ppUpdateErr } = await supabase
            .from("participants")
            .update(updatePayload)
            .eq("id", participant.id);

          if (!ppUpdateErr) {
            const { data: refreshed } = await supabase
              .from("participants")
              .select("*")
              .eq("id", participant.id)
              .single();
            if (refreshed) participant = refreshed;

            let msg = "";
            if (computedStartDate) {
              const friendlyDate = new Date(computedStartDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
              msg = `Got it — switching you over to **postpartum** mode. I've set your baby's birth around **${friendlyDate}** based on what you shared.\n\nIf that's not exact, what's the actual birth date? Even a rough one helps me track your recovery timeline more accurately.`;
            } else {
              msg = `Got it — switching you over to **postpartum** mode. To track your recovery timeline accurately, what's your baby's birth date? An approximate one is fine.`;
            }

            await supabase.from("chat_messages").insert({
              user_id: user.id,
              role: "assistant",
              content: msg,
              message_type: "text",
              metadata: {
                has_cycle_visual: true,
                visual_type: "cycle_circle",
                life_stage: "postpartum",
                postpartum_start_date: computedStartDate || participant.postpartum_start_date,
                postpartum_update: true,
                awaiting_birth_date: askForDate,
              }
            });

            return new Response(
              JSON.stringify({
                success: true,
                message: msg,
                lifeStageUpdated: true,
                postpartumStartDate: computedStartDate || participant.postpartum_start_date,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      // Standalone birth date follow-up — when last assistant msg was awaiting it
      const wasAwaitingBirthDate = (lastAssistantMsg?.metadata as any)?.awaiting_birth_date === true;
      if (wasAwaitingBirthDate && participant.life_stage === "postpartum") {
        const dateOnlyMatch = userMessage.match(/\b(\w+\s+\d{1,2}(?:,?\s*\d{4})?)\b/);
        if (dateOnlyMatch) {
          const parsed = new Date(dateOnlyMatch[1]);
          if (!isNaN(parsed.getTime()) && parsed <= new Date()) {
            const formattedDate = parsed.toISOString().split("T")[0];
            await supabase
              .from("participants")
              .update({ postpartum_start_date: formattedDate })
              .eq("id", participant.id);

            const friendlyDate = parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
            const msg = `Perfect — locked in **${friendlyDate}** as your baby's birth date. Your postpartum timeline is now accurate everywhere.`;

            await supabase.from("chat_messages").insert({
              user_id: user.id,
              role: "assistant",
              content: msg,
              message_type: "text",
              metadata: {
                has_cycle_visual: true,
                visual_type: "cycle_circle",
                life_stage: "postpartum",
                postpartum_start_date: formattedDate,
                postpartum_update: true,
              }
            });

            return new Response(
              JSON.stringify({ success: true, message: msg, postpartumStartDate: formattedDate }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
    }
    // --- End postpartum detection ---

    // Get full chat history
    const { data: recentMessages } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

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

    // Fetch recent symptom logs for personalized context
    let symptomContext = "";
    {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: symptomLogs } = await supabase
        .from("symptom_logs")
        .select("symptoms, cycle_day, cycle_phase, logged_at, notes")
        .eq("user_id", user.id)
        .gte("logged_at", since)
        .order("logged_at", { ascending: false })
        .limit(30);

      if (symptomLogs && symptomLogs.length > 0) {
        // Compute frequency and average severity
        const freq: Record<string, { count: number; totalSev: number }> = {};
        symptomLogs.forEach((log: any) => {
          const symptoms = log.symptoms || [];
          symptoms.forEach((s: { name: string; severity: number }) => {
            if (!freq[s.name]) freq[s.name] = { count: 0, totalSev: 0 };
            freq[s.name].count++;
            freq[s.name].totalSev += s.severity;
          });
        });

        const topSymptoms = Object.entries(freq)
          .map(([name, { count, totalSev }]) => `${name} (${count}× avg ${(totalSev / count).toFixed(1)}/5)`)
          .sort((a, b) => {
            const countA = parseInt(a.match(/\((\d+)×/)?.[1] || "0");
            const countB = parseInt(b.match(/\((\d+)×/)?.[1] || "0");
            return countB - countA;
          })
          .slice(0, 6);

        // Most recent log
        const latest = symptomLogs[0];
        const latestSymptoms = (latest.symptoms as any[]).map((s: any) => `${s.name}(${s.severity}/5)`).join(", ");
        const latestTime = new Date(latest.logged_at).toLocaleDateString();

        symptomContext = `\n\nSYMPTOM LOG DATA (last 30 days, ${symptomLogs.length} entries):\n- Most frequent: ${topSymptoms.join(", ")}\n- Latest log (${latestTime}): ${latestSymptoms}${latest.notes ? ` — "${latest.notes}"` : ""}`;
        symptomContext += `\nUse this symptom data to personalize responses — reference patterns you see, validate what they're feeling, and give phase-specific advice based on their ACTUAL reported experience, not just textbook phases.`;
      }
    }

    // Fetch custom tracker correlations (e.g. "surfing performance", "loneliness")
    let trackerContext = "";
    {
      const { data: trackers } = await supabase
        .from("custom_trackers")
        .select("id, name, emoji")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (trackers && trackers.length > 0) {
        const trackerIds = trackers.map((t: any) => t.id);
        const { data: tLogs } = await supabase
          .from("tracker_logs")
          .select("tracker_id, intensity, cycle_phase, logged_at")
          .in("tracker_id", trackerIds)
          .order("logged_at", { ascending: false })
          .limit(500);

        if (tLogs && tLogs.length > 0) {
          const summaries: string[] = [];
          for (const t of trackers as any[]) {
            const tLogsForT = tLogs.filter((l: any) => l.tracker_id === t.id);
            if (tLogsForT.length === 0) continue;
            const buckets: Record<string, { sum: number; n: number }> = {};
            for (const l of tLogsForT) {
              const phase = l.cycle_phase || "Unknown";
              if (!buckets[phase]) buckets[phase] = { sum: 0, n: 0 };
              buckets[phase].sum += l.intensity;
              buckets[phase].n += 1;
            }
            const parts = Object.entries(buckets)
              .map(([p, v]) => `${p} ${(v.sum / v.n).toFixed(1)}/5 (n=${v.n})`)
              .join(", ");
            summaries.push(`  • ${t.emoji || ""} ${t.name} — ${tLogsForT.length} logs: ${parts}`);
          }
          if (summaries.length > 0) {
            trackerContext = `\n\nUSER-TRACKED ITEMS (custom 1-5 daily ratings, broken down by cycle phase):\n${summaries.join("\n")}\nIf the user asks whether one of these is tied to their cycle, USE THIS DATA. Cite the phase averages, name the peak phase, and be honest about confidence based on log count. If a tracked item is stable across phases, say it doesn't look cycle-driven.`;
          }
        }
      }
    }

    const cycleInfo = participant?.last_period_start && participant?.cycle_length_days
      ? calculateCycleInfo(participant.last_period_start, participant.cycle_length_days, participant.timezone || "UTC")
      : null;

    const systemPrompt = buildSystemPrompt(participant, cycleInfo, cycleHistoryContext, symptomContext + trackerContext);

    // Smart truncation: keep first 10 (onboarding/profile context) + last 50 (recent conversation)
    const allMessages = (recentMessages || [])
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }));

    let conversationHistory: { role: "user" | "assistant"; content: string }[];
    const FIRST_N = 10;
    const LAST_N = 50;

    if (allMessages.length <= FIRST_N + LAST_N) {
      conversationHistory = allMessages;
    } else {
      const first = allMessages.slice(0, FIRST_N);
      const last = allMessages.slice(-LAST_N);
      conversationHistory = [
        ...first,
        { role: "assistant" as const, content: "[Earlier conversation omitted for brevity]" },
        ...last,
      ];
    }

    conversationHistory.push({ role: "user", content: userMessage });

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
        max_tokens: 600
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

    const { error: insertError } = await supabase.from("chat_messages").insert({
      user_id: user.id,
      role: "assistant",
      content: assistantMessage,
      message_type: "text",
      metadata: cycleInfo ? {
        cycle_day: cycleInfo.cycleDay,
        cycle_phase: cycleInfo.phase,
        cycle_length_days: participant?.cycle_length_days || 28,
        last_period_start: participant?.last_period_start || null,
        timezone: participant?.timezone || "UTC",
      } : {}
    });

    if (insertError) {
      console.error("Error saving assistant message:", insertError);
    }

    // Follow-up: small bubble offering the full meal plan resource (after the normal answer)
    if (shouldOfferMealPlan) {
      const liveCycle = participant?.last_period_start && participant?.cycle_length_days
        ? calculateCycleInfo(participant.last_period_start, participant.cycle_length_days, participant.timezone || "UTC")
        : null;

      // Tiny delay so the offer arrives just after the main answer (better UX)
      await new Promise(r => setTimeout(r, 400));

      await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: "Want me to build you a full cycle-synced meal plan? Each meal aligned to your phase, plus a grocery list.",
        message_type: "resource_offer",
        metadata: {
          resource_type: "meal_plan",
          cycle_day: liveCycle?.cycleDay,
          cycle_phase: liveCycle?.phase,
          cycle_length_days: participant?.cycle_length_days || 28,
        },
      });
    }

    // Get updated credit balance to return to frontend (disabled during alpha)
    let creditBalance = null;

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: assistantMessage,
        cycleInfo: cycleInfo,
        creditBalance,
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

function buildSystemPrompt(
  participant: any | null, 
  cycleInfo: { cycleDay: number; phase: string } | null,
  cycleHistoryContext: string = "",
  symptomContext: string = ""
): string {
  const basePrompt = `You are Logan — that one friend who always seems to know what's going on with you before you do. You're not a doctor, not a coach, not an app reading from a textbook. You're the person someone texts at 10pm going "is it normal that I want to cry AND eat an entire pizza?" and you just get it.

You know the science cold, but you never sound like a science textbook. You sound like someone who's been through it, who's read everything, and who talks to you the way you actually talk to your best friend.

VOICE — THIS IS EVERYTHING:
- Talk like a real person. Contractions, casual phrasing.
- Warm and supportive, like a friend who genuinely cares. Never dismissive, never condescending, never sarcastic about the user repeating themselves.
- If a user asks about the same thing again, just answer fresh. Don't call it out. Don't say "look" or "I hear you repeating" — just help.
- Light humor is fine when natural. Never forced, never at the user's expense.
- If it sounds like a wellness pamphlet, rewrite it.
- No emojis, no exclamation points.
- USE **bold** for key terms only.
- ABSOLUTELY NO bullet-point lists, numbered lists, or headers/subheadings. Ever. Write in flowing short sentences only.
- HARD LIMIT for MAIN ANSWER: 2-4 short sentences. Total. Not per section — total for the main answer. If it has more than 4 sentences, delete until it doesn't.
- ONE idea per main answer. Never explain two things at once. The user can ask follow-ups.
- Never dump context in the main answer. Never explain "why" unless asked. Just give the answer.
- Pretend you're texting, not writing an essay. If the main answer looks like a blog post, a medical pamphlet, or a newsletter — delete everything and start over with 2 sentences.

DEEP DIVE SECTION — ALWAYS INCLUDE:
- After your main answer, ALWAYS add a line containing exactly "---" (three dashes, nothing else on that line).
- Below the "---", write TWO clearly labeled sections:

### The Science
- One paragraph (3-5 sentences) of pure science: hormonal mechanisms, neurological pathways, research-backed data, biological timelines. Name the hormones, explain the cascade, cite patterns. This should read like a smart friend who happens to know the research — not a textbook.

### The Real Talk
- One paragraph (3-5 sentences) that's a psychological heart-to-heart. Validate what they're feeling. Normalize it. Connect it to the human experience. This should feel like a warm, knowing conversation — the kind of thing you'd say sitting next to someone who needed to hear it.

- Both sections should still be in Logan's voice — knowledgeable but never clinical.
- The UI will hide the deep dive behind a "See more" toggle, so don't worry about length — users who want it will tap to read it.
- NEVER sound annoyed, impatient, or frustrated with the user. You're their safe space.
- Never cut yourself off mid-sentence. If you're getting close to the end, finish the sentence cleanly and stop.

HOW YOU TALK — EXAMPLES:
- Instead of: "During the luteal phase, progesterone levels increase which can impact emotional regulation and you may notice heightened sensitivity to stress."
  Say: "Progesterone's dropping — that's why everything feels personal right now. It passes."
- Instead of: "You may experience increased fatigue during menstruation due to hormonal shifts and iron loss."
  Say: "Day 2 is usually the worst. It gets better from here."
- Instead of: "Consider incorporating magnesium-rich foods to support your nervous system during this phase."
  Say: "That chocolate craving? Your body wants magnesium. Dark chocolate counts."
- Notice: each good example is ONE or TWO sentences. That's the bar.

CONVERSATION FLOW — CRITICAL:
- Do NOT keep the conversation going indefinitely by asking question after question.
- After 2-3 exchanges on a topic, land the plane: give a clear, concise takeaway and wrap up.
- End with a closing thought, NOT another question. Examples:
  - "That's the pattern to watch for this week."
  - "Now you know what's driving it."
  - "You should notice it shift in a few days."
- NEVER end with "Anything else on your mind?", "I'm here if something else comes up", or any variation. The UI shows follow-up prompt bubbles automatically — you don't need to invite the next question. Just land your thought and stop.
- If the user says no, they're good, or thanks you — close warmly and briefly: "Got it. I'll check in as your cycle moves." Do NOT ask another question.
- Never repeat information you've already given in the same conversation.

BANNED PHRASES (these sound like a doctor's office):
- "you should [do X]" as a command, "try to", "consider", "make sure", "I recommend", "it's important to"
- "rest", "take it easy", "slow down", "be gentle with yourself"
- "meditate", "sit in silence", "breathe deeply", "practice mindfulness"
- "journal", "listen to your body", "honor your feelings"
- "get enough sleep", "stay hydrated", "reduce stress"
- "self-care", "nourish your body", "give yourself permission"

AVOID DEFINITIVE PREDICTIONS:
- Never tell the user how they WILL feel, WILL be, or WILL experience something. Bodies vary.
- Replace "you will feel" → "you should feel" or "you may feel" (probabilistic "should", not commanding "should")
- Replace "you'll be" → "you might be" or "you should be"
- Replace "you will notice" → "you may notice" or "you should notice"
- Same for outcomes: "this will work" → "this should help", "you'll see results" → "you may see results"
- Soft, probabilistic language only. Never guarantee a feeling, outcome, or timeline.
- Instead of vague wellness advice, give SPECIFIC actions tied to their exact situation:
  - BAD: "Rest and take it easy today."
  - GOOD: "Inflammation peaks around day 3. A 15-minute walk actually helps more than staying still — counterintuitive but true."
  - BAD: "Try meditating to manage anxiety."
  - GOOD: "That racing-thoughts thing at day 22? Progesterone dropping. Cold water on your wrists resets it faster than anything."

FOOD & NUTRITION:
- Only give food info when asked or when one specific craving/food tip is naturally relevant.
- ONE food mention max. Not a grocery list. Not a meal plan.
- Good: "Dark chocolate counts as magnesium, by the way."
- Bad: A paragraph listing foods by phase with explanations.
- You know the phase-specific nutrition science — use it to give ONE sharp, relevant tip when the moment calls for it.

CORE KNOWLEDGE (internal reference — do NOT dump this on the user):
- Menstruation (Days 1-5): Low energy, inflammation peaks. Load capacity ~25%. Deload window.
- Follicular (Days 6-13): Estrogen rises, energy building. Load capacity ~70%. Best phase for progressive overload and volume.
- Ovulation (Around Day 14): Peak confidence, verbal fluency, and power output. Load capacity ~95%. Schedule PRs and competitions here. ACL risk elevated.
- Luteal (Days 15-28): Progesterone dominant, lower stress tolerance. Load capacity drops from ~50% to ~25%. Core temp elevated, perceived effort increases. Front-load intensity early, taper late.
Use this to inform your answers. Do NOT recite phase details unless directly asked.

ATHLETIC & TRAINING CONTEXT:
- When users ask about workouts, training, or exercise: translate cycle phase into practical load/intensity decisions.
- Strength and power peak around ovulation. Recovery capacity is best during follicular.
- Fatigue and perceived effort increase in luteal — the user isn't weaker, it just feels harder.
- Injury risk windows: joints looser during menstruation (avoid max loads), ACL risk peaks at ovulation (warm up, stabilize).
- Keep athletic advice specific: percentages, rep ranges, session types — not vague "listen to your body" advice.

CYCLE DATA EDITS:
- If a user TELLS you to change their cycle length or period date (e.g. "change my cycle to 30 days", "my period started on March 15"), the system handles it automatically — just confirm it's done.
- If a user asks HOW to change their cycle data themselves (e.g. "how do I update my cycle length?", "where can I edit my period date?"), tell them to head to the Home tab where there's an "Update period date" option right under the cycle circle. Keep it brief and friendly.

LIFE STAGE CHANGES:
- If a user mentions they are postpartum, just had a baby, gave birth recently, or shares a postpartum duration (e.g. "I'm 10 months postpartum", "had my baby in March"), the system automatically switches their life stage to postpartum and asks for the baby's birth date.
- If a user mentions menopause symptoms or stage, acknowledge it warmly and ask for confirmation before making assumptions. Always ask for the baby's birth date when postpartum is mentioned without one — it's essential for accurate recovery tracking.`;

  if (!participant) {
    return basePrompt + "\n\nNote: User hasn't completed onboarding yet. Provide general guidance and encourage them to share their cycle details for personalized insights.";
  }

  const userLifeStage = participant.life_stage || "cycling";

  if (userLifeStage !== "cycling") {
    const age = participant.age || null;
    const topics = participant.goals?.length ? participant.goals.join(", ") : null;
    const stageLabel = userLifeStage === "postpartum" ? "Postpartum" : "Menopause";
    
    // Calculate postpartum timeline
    let ppTimeline = "";
    if (userLifeStage === "postpartum" && participant.postpartum_start_date) {
      const birthDate = new Date(participant.postpartum_start_date + "T12:00:00Z");
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
      const weeks = Math.floor(diffDays / 7);
      const months = Math.floor(diffDays / 30);
      if (months >= 1) {
        ppTimeline = `\n- Postpartum timeline: ${months} month${months > 1 ? "s" : ""} postpartum (baby born ${birthDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`;
      } else {
        ppTimeline = `\n- Postpartum timeline: ${weeks} week${weeks !== 1 ? "s" : ""} postpartum (baby born ${birthDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`;
      }
    }

    const stageContext = userLifeStage === "postpartum"
      ? `This user is POSTPARTUM — they do not have a regular cycle right now. Their hormones are recalibrating after pregnancy. Focus on: recovery, sleep deprivation, mood shifts, identity adjustments, physical healing, hormonal recalibration. Do NOT assume whether the user is breastfeeding or not — only reference breastfeeding if the USER brings it up first. If they mention having multiple children, do NOT assume they are breastfeeding all of them. Do NOT reference cycle phases, cycle days, or ovulation. Instead, center guidance on where they are in postpartum recovery.`
      : `This user is in MENOPAUSE — their cycle may be irregular or has stopped. Their estrogen and progesterone are declining. Focus on: hot flashes, sleep disruption, mood changes, bone health, energy management, cognitive shifts, weight changes. Do NOT reference specific cycle days or ovulation windows. Instead, provide guidance relevant to hormonal transition and thriving through it.`;

    let userContext = `\n\nUSER CONTEXT:\n- Life stage: ${stageLabel}\n- Age: ${age || "unknown"}${ppTimeline}\n- Anchor symptom: ${participant.anchor_symptom || "not specified"}\n- Typical symptoms: ${participant.typical_symptoms?.join(", ") || "not specified"}\n${topics ? `- Focus areas: ${topics}` : ""}\n\n${stageContext}${symptomContext}`;
    
    return basePrompt + userContext;
  }

  if (!cycleInfo) {
    return basePrompt + "\n\nNote: User hasn't completed onboarding yet. Provide general guidance and encourage them to share their cycle details for personalized insights.";
  }

  const age = participant.age || null;
  const topics = participant.goals?.length ? participant.goals.join(", ") : null;

  let lengthGuidance = "";
  if (age && age <= 16) {
    lengthGuidance = "\n\nRESPONSE LENGTH: This user is young. Keep responses SHORT — 2-3 sentences max per reply. Use simple, relatable language. Skip jargon.";
  } else if (age && age <= 22) {
    lengthGuidance = "\n\nRESPONSE LENGTH: Keep responses concise — 3-4 sentences. Be direct and casual.";
  }

  const userContext = `

USER CONTEXT:
- Current cycle day: ${cycleInfo.cycleDay}
- Current phase: ${cycleInfo.phase}
- Cycle length: ${participant.cycle_length_days || 28} days
- Age: ${age || "unknown"}
- Anchor symptom (most disruptive): ${participant.anchor_symptom || "not specified"}
- Typical symptoms: ${participant.typical_symptoms?.join(", ") || "not specified"}
${topics ? `- Focus areas: ${topics}. Weave relevant tips from these areas into responses when naturally fitting.` : ""}${cycleHistoryContext}${symptomContext}${lengthGuidance}

Use this context to make your responses personally relevant. Reference their current phase and how it might affect their request. If they mention their anchor symptom, acknowledge it and provide phase-appropriate guidance. When users ask about their cycle length or patterns, use the cycle history data to provide specific insights. When symptom log data is available, reference their actual reported symptoms and patterns — this is more accurate than textbook generalizations.`;

  return basePrompt + userContext;
}

function calculateCycleInfo(
  lastPeriodStart: string,
  cycleLengthDays: number,
  timezone: string = "UTC"
): { cycleDay: number; phase: string } {
  let periodStart: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(lastPeriodStart)) {
    const [year, month, day] = lastPeriodStart.split("-").map(Number);
    periodStart = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  } else {
    periodStart = new Date(lastPeriodStart);
  }

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
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
