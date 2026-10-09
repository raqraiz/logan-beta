import { CALM_VOICE_RULE } from "../_shared/voiceRule.ts";
import { anchorPromptRule, currentCycleAnchorType } from "../_shared/cycleAnchor.ts";
import { buildBcMethodRule, bcFramingSummary } from "../_shared/bcMethod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPostpartumTimeline } from "../_shared/postpartumTimeline.ts";
import { calculateCycleInfo as sharedCalculateCycleInfo } from "../_shared/cycleCalculations.ts";
import { isPhaseTrackingOn } from "../_shared/cyclePhase.ts";
import {
  fetchActiveBoundaries,
  buildBoundaryRuleBlock,
  hasStageBoundary,
  sanitizeRecentMessages,
  mentionsLoss,
  type TopicBoundary,
} from "../_shared/topicBoundaries.ts";
import { fetchMemoryNotes, buildMemoryBlock, type MemoryNotes } from "../_shared/memoryNotes.ts";
import { trackMessageFailures } from "../_shared/messageFailures.ts";
import {
  RECENT_WINDOW_DAYS,
  buildOpenerRules,
  breaksOpenerGuardrail,
  fetchRecentLoggedSymptoms,
  fetchRejectedOpeners,
  recentCheckinLines,
  windowStartIso,
} from "../_shared/openerContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type InsightMetadata = {
  onboarding_complete?: boolean;
  insight_type?: string;
  placeholder?: boolean;
};

type RecentInsightRow = {
  id: string;
  content: string | null;
  created_at: string;
  metadata: InsightMetadata | null;
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

    const supabase = trackMessageFailures(createClient(supabaseUrl, supabaseServiceKey), "generate-insight");

    // Check if onboarding is complete
    const { data: messages } = await supabase
      .from("chat_messages")
      .select("metadata")
      .eq("user_id", user.id)
      .not("metadata", "is", null);

    const onboardingComplete = messages?.some(
      (m: { metadata: InsightMetadata | null }) => m.metadata?.onboarding_complete === true
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
      .select("id, content, created_at, metadata")
      .eq("user_id", user.id)
      .eq("role", "assistant")
      .gte("created_at", todayStart.toISOString());

    const stalePlaceholderIds = ((recentInsights || []) as RecentInsightRow[])
      .filter((m) => m.metadata?.insight_type === "proactive" && m.metadata?.placeholder === true)
      .filter((m) => new Date(m.created_at).getTime() < Date.now() - 60_000)
      .map((m) => m.id);

    if (stalePlaceholderIds.length > 0) {
      await supabase.from("chat_messages").delete().in("id", stalePlaceholderIds);
    }

    const alreadySentToday = ((recentInsights || []) as RecentInsightRow[]).some(
      (m) => m.metadata?.insight_type === "proactive" && m.metadata?.placeholder !== true && m.content !== "..."
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
    const removePlaceholder = async () => {
      await supabase.from("chat_messages").delete().eq("id", placeholderId);
    };

    // Get participant data
    const { data: participant } = await supabase
      .from("participants")
      .select("*")
      .eq("email", user.email)
      .single();

    if (!participant) {
      await removePlaceholder();
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_participant" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userLifeStage = participant.life_stage || "cycling";

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
      .eq("role", "user") // her own words only: earlier cards must never feed back into the next one
      .neq("message_type", "checkin")
      .gte("created_at", windowStartIso())
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

    // Active "don't bring up X" boundaries — absolute, enforced on every surface.
    const boundaries = await fetchActiveBoundaries(supabase, user.id);
    const memoryNotes = await fetchMemoryNotes(supabase, user.id);
    const openerRules = buildOpenerRules({
      loggedSymptoms: await fetchRecentLoggedSymptoms(supabase, user.id),
      checkins: recentCheckinLines(checkinMessages || []),
      rejected: await fetchRejectedOpeners(supabase, user.id),
    });
    // Strip prior boundary disputes / apologies out of the context we feed back in.
    const safeRecentMessages = sanitizeRecentMessages(recentMessages || []);
    const stageSuppressed = hasStageBoundary(boundaries, userLifeStage);

    // For non-cycling users, generate stage-specific insights.
    // Perimenopause users are still cycling — route them through the cycling path.
    if (!isPhaseTrackingOn(userLifeStage)) {
      const prompt = buildNonCyclingInsightPrompt(
        profile?.full_name || "there",
        participant,
        userLifeStage,
        safeRecentMessages,
        boundaries,
        memoryNotes,
      ) + openerRules;

      let aiResult;
      try {
        aiResult = await generateGuardedInsight(Deno.env.get("LOVABLE_API_KEY")!, prompt + anchorPromptRule(currentCycleAnchorType(participant)) + CALM_VOICE_RULE);
      } catch (aiErr) {
        const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
        console.error("AI insight generation failed, removing placeholder:", msg);
        await removePlaceholder();
        const isBilling = /\b402\b|payment_required|Not enough credits/i.test(msg);
        const isRate = /\b429\b|rate limit/i.test(msg);
        return new Response(
          JSON.stringify({
            success: true,
            skipped: true,
            reason: isBilling ? "ai_credits_exhausted" : isRate ? "ai_rate_limited" : "ai_unavailable",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      let { insight, question, conversationStarters, cheatSheet } = aiResult;

      // Post-generation guard: a loss boundary must never leak into the opener.
      if (stageSuppressed && userLifeStage === "pregnancy_loss" && mentionsLoss(insight)) {
        console.warn("Loss boundary violated in generated opener — regenerating once");
        try {
          const retry = await generateAIInsight(
            Deno.env.get("LOVABLE_API_KEY")!,
            prompt + "\n\nYOUR PREVIOUS ATTEMPT VIOLATED THE USER BOUNDARY. Rewrite with zero reference to loss, grief, miscarriage, or healing from loss.",
          );
          if (!mentionsLoss(retry.insight)) {
            insight = retry.insight;
            question = retry.question;
            conversationStarters = retry.conversationStarters;
            cheatSheet = retry.cheatSheet;
          } else {
            throw new Error("retry still violated boundary");
          }
        } catch {
          console.warn("Falling back to neutral opener after boundary violation");
          insight = "Morning. Here for whatever today looks like.";
          question = "How's your energy right now?";
          conversationStarters = ["Pretty good", "Kind of flat", "Tell me more"];
          cheatSheet = null;
        }
      }

      await supabase.from("chat_messages").update({
        content: insight,
        metadata: {
          insight_type: "proactive",
          life_stage: userLifeStage,
          generated_at: new Date().toISOString(),
          engagement_question: question,
          conversation_starters: conversationStarters,
          cheat_sheet: cheatSheet,
        }
      }).eq("id", placeholderId);

      return new Response(
        JSON.stringify({ success: true, generated: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate cycle info using participant's timezone
    const cycleInfo = calculateCycleInfo(
      participant.last_period_start,
      participant.cycle_length_days,
      participant.timezone || "UTC",
      (participant as any).current_period_end_date ?? null,
      !!(participant as any).period_still_active,
      {
        menstruation_days: (participant as any).menstruation_days ?? null,
        follicular_days: (participant as any).follicular_days ?? null,
        ovulation_window_days: (participant as any).ovulation_window_days ?? null,
        luteal_days: (participant as any).luteal_days ?? null,
      },
    );



    if (!cycleInfo) {
      await removePlaceholder();
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no_cycle_data" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Long absence re-engagement ---
    // If a cycling user hasn't messaged Logan in 30+ days, her cycle data is
    // almost certainly stale (a period likely came and went). Lead with a
    // gentle re-engagement check-in instead of confidently quoting a phase.
    const { data: lastUserMsg } = await supabase
      .from("chat_messages")
      .select("created_at")
      .eq("user_id", user.id)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const daysSinceLastUserMsg = lastUserMsg?.created_at
      ? Math.floor((Date.now() - new Date(lastUserMsg.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const isLongAbsence = daysSinceLastUserMsg !== null && daysSinceLastUserMsg >= 30;

    // Check if user is in late luteal — ask about period
    const isLateLuteal = cycleInfo.phase === "Luteal" && cycleInfo.daysUntilNextPhase <= 3;
    const isOverdue = cycleInfo.cycleDay > (participant.cycle_length_days || 28);

    if (isLongAbsence) {
      const absenceContent = `Welcome back — it's been about **${daysSinceLastUserMsg} days** since we last talked. Your cycle data here is likely out of date.\n\nHas your period come (and gone) since then? Let me know and I'll get your timing accurate again.`;

      await supabase.from("chat_messages").update({
        content: absenceContent,
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
          long_absence_days: daysSinceLastUserMsg,
          generated_at: new Date().toISOString(),
          conversation_starters: [
            "Yes, it started today",
            "It came and went — let me give you the date",
            "Not yet"
          ]
        }
      }).eq("id", placeholderId);

      return new Response(
        JSON.stringify({ success: true, generated: true, longAbsence: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (isLateLuteal || isOverdue) {
      const dayLabel = isOverdue
        ? `Day ${cycleInfo.cycleDay} — that's ${cycleInfo.cycleDay - (participant.cycle_length_days || 28)} days past your expected cycle length`
        : `Day ${cycleInfo.cycleDay}, wrapping up **luteal**`;

      const isMarkerAnchor = currentCycleAnchorType(participant) === "marker";
      const checkinContent = isMarkerAnchor
        ? `Day ${cycleInfo.cycleDay} of your cycle.\n\nFeels like a new cycle might have started?`
        : `${dayLabel}. Your period could arrive any time now.\n\nHas it started yet? If so, I'll reset your cycle so everything stays accurate — your insights, your phase, all of it.`;

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
          ...(isMarkerAnchor ? { marker_checkin: true, cycle_anchor_type: "marker" } : {}),
          generated_at: new Date().toISOString(),
          conversation_starters: isMarkerAnchor
            ? ["Yes, mark it", "Not yet", "I got a bleed"]
            : ["Yes, it started today", "Started yesterday", "Not yet"]
        }
      }).eq("id", placeholderId);
    } else {
      // Generate AI insight
      const prompt = buildInsightPrompt(
        profile?.full_name || "there",
        cycleInfo,
        participant,
        safeRecentMessages,
        boundaries,
        memoryNotes,
      ) + openerRules;

      let aiResult;
      try {
        aiResult = await generateGuardedInsight(Deno.env.get("LOVABLE_API_KEY")!, prompt + anchorPromptRule(currentCycleAnchorType(participant)) + CALM_VOICE_RULE);
      } catch (aiErr) {
        const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
        console.error("AI insight generation failed, removing placeholder:", msg);
        // Remove placeholder so UI doesn't show a blank message
        await supabase.from("chat_messages").delete().eq("id", placeholderId);
        const isBilling = /\b402\b|payment_required|Not enough credits/i.test(msg);
        const isRate = /\b429\b|rate limit/i.test(msg);
        return new Response(
          JSON.stringify({
            success: true,
            skipped: true,
            reason: isBilling ? "ai_credits_exhausted" : isRate ? "ai_rate_limited" : "ai_unavailable",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { insight, question, conversationStarters, cheatSheet } = aiResult;

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
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

type PhaseLengths = {
  menstruation_days?: number | null;
  follicular_days?: number | null;
  ovulation_window_days?: number | null;
  luteal_days?: number | null;
};

// Thin wrapper over the single source of truth in _shared/cycleCalculations.ts
// (canonical logic from chat-ai). Preserves this function's historical
// positional signature and its modulo-wrap for pre-start reference dates.
// Overdue cycles never wrap — matches chat-ai so briefing and chat agree.
function calculateCycleInfo(
  lastPeriodStart: string | null,
  cycleLengthDays: number | null,
  timezone: string = "UTC",
  currentPeriodEndDate?: string | null,
  periodStillActive?: boolean,
  phaseLengths?: PhaseLengths | null,
): { cycleDay: number; phase: string; daysUntilNextPhase: number } | null {
  return sharedCalculateCycleInfo(lastPeriodStart, cycleLengthDays, {
    timezone,
    currentPeriodEndDate: currentPeriodEndDate ?? null,
    periodStillActive: !!periodStillActive,
    phaseLengths: phaseLengths ?? null,
    futureStartPolicy: "wrap",
  });
}


function buildInsightPrompt(
  userName: string,
  cycleInfo: { cycleDay: number; phase: string; daysUntilNextPhase: number },
  participant: Record<string, any>,
  recentMessages: { content: string; role: string }[],
  boundaries: TopicBoundary[] = [],
  memoryNotes: MemoryNotes = { corrections: [], confirmed: [] },
): string {
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

  // Topic preferences context
  const topicContext = topics.length > 0
    ? `- Interest areas: ${topics.join(", ")}. Weave relevant tips from these areas into the intro when naturally fitting.`
    : "";

  const isPerimenopause = (participant.life_stage === "perimenopause");
  const perimenopauseContext = isPerimenopause
    ? `\n- LIFE STAGE: **Perimenopause**. ${firstName} STILL HAS PERIODS and is still cycling, but the pattern is shifting (cycles getting shorter/longer, heavier/lighter, skipped months, new symptoms like hot flashes, sleep changes, sharper mood swings). DO NOT call her menopausal — perimenopause ≠ menopause. Reference her cycle day and phase as usual. Mention sleep, hot flashes, mood or energy only if she logged them recently.`
    : "";

  // NO-UTERUS BRANCH (hysterectomy, ovaries retained) — layered on top of life_stage,
  // mirroring the on_hormonal_bc pattern. Not a life_stage value.
  const noUterusNote = participant.has_uterus === false
    ? `\n- NO UTERUS (hysterectomy, ovaries intact): She is NOT menopausal — her ovaries still cycle, so hormone patterns still apply. But she will NEVER bleed again: never ask for, reference, or imply a period date, Day 1, a late/due period, or "when your period starts". Any cycle day or phase here is an ESTIMATE with no bleed anchor — hedge it ("roughly", "estimated") and lean on her tracked symptoms over calendar timing.`
    : "";

  return `You are Logan. You're ${firstName}'s warm, steady companion. You know her cycle, and you only talk about feelings she has actually shared. You're not giving advice or instructions.${buildBoundaryRuleBlock(boundaries)}${buildBcMethodRule(participant)}${buildMemoryBlock(memoryNotes)}

CONTEXT:
- Today is Day ${cycleInfo.cycleDay} of your cycle · **${cycleInfo.phase}**
- ${cycleInfo.daysUntilNextPhase} days until next phase
- Age: ${age || "unknown"}
${(participant.watch_symptoms?.length ? `- She chose to watch: ${participant.watch_symptoms.join(", ")}. This only tells you what she cares about. Never say or imply she is having any of these today unless she logged it.\n` : "")}- PHASE STRENGTHS: ${strengthContext}${perimenopauseContext}${noUterusNote}
${topicContext}
${age && age <= 16 ? "- TONE: User is young. Use simple, relatable language. Keep intro under 25 words. Make the question feel like a text from a friend." : ""}
${age && age >= 17 && age <= 22 ? "- TONE: Keep it casual and brief. Max 35 words for intro." : ""}

HER OWN RECENT WORDS (last ${RECENT_WINDOW_DAYS} days, context only):
${recentMessages.map(m => `${m.content.slice(0, 80)}`).join("\n") || "None"}

IMPORTANT TONE RULE:
- Every phase has superpowers. LEAD with what's going well — the strengths, the high-performing qualities of this phase.
- During Follicular and Ovulation: emphasize peak energy, creativity, confidence, and capability. Anchor symptom context is secondary or absent.
- During Luteal and Menstruation: acknowledge strengths first (detail-oriented thinking, intuition, reflection). Mention a symptom only if she logged it in the last few days.
- Never frame any phase as purely negative. Even challenging phases have powerful qualities.

Generate a JSON object:

1. "intro": 2-3 short sentences. Max 40 words total.
   - Include that today is Day ${cycleInfo.cycleDay} of her cycle and the **${cycleInfo.phase}** phase (bold only the phase name). Make it clear the day number refers to the whole cycle, not the phase. Vary the sentence shape from day to day.
   - Mention what this phase tends to be good for (a strength, not a feeling you assume she has). During Follicular/Ovulation, lean into peak performance. During Luteal/Menstruation, acknowledge the quieter strengths.
   - No food, supplement or symptom suggestions.

2. "question": One short, open question (under 12 words), such as "How's today landing?". If she logged something recently, ask how that is going. Otherwise keep it open, never a guess at a negative state. Write it as its own full sentence: start with a capital letter and end with "?".

3. "starters": 3 replies (2-4 words each) that fit the open question. One good ("Pretty good"), one mixed ("A bit flat"), one opens up ("Tell me more").

4. "cheat_sheet": Personalized energy/focus/emotions/nutrition for THIS user in THIS phase. Each has "level" (high/medium/low/variable) and "note" (max 12 words). Notes must be INQUIRY-BASED — ask the user how they're feeling, don't tell them. Frame each note as a gentle question or check-in that invites them to reflect. Never declare what they're experiencing. Any question in a note is a full sentence that starts with a capital letter and ends with "?". During high-performing phases, levels should reflect the strengths (e.g., energy: high, focus: high).
   - "energy": Ask how their energy is today given their phase.
   - "focus": Ask about their mental clarity or creative state.
   - "emotions": Ask what their emotional landscape feels like right now.
   - "nutrition": Ask about cravings or what their body wants to eat. During Luteal/Menstruation, "level" should be "high" (cravings are strongest). During Follicular/Ovulation, "level" should be "medium". Keep it open (e.g., "Anything your body is asking for?").

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

function buildNonCyclingInsightPrompt(
  userName: string,
  participant: Record<string, any>,
  lifeStage: string,
  recentMessages: { content: string; role: string }[],
  boundaries: TopicBoundary[] = [],
  memoryNotes: MemoryNotes = { corrections: [], confirmed: [] },
): string {
  const stageSuppressed = hasStageBoundary(boundaries, lifeStage);
  const firstName = userName.split(" ")[0];
  const age = participant.age || null;
  const topics = participant.goals || [];

  let timelineContext = "";
  let ppPhaseGuidance = "";
  let pregnancyPhaseGuidance = "";
  if (lifeStage === "postpartum" && participant.postpartum_start_date) {
    const ppT = getPostpartumTimeline(participant.postpartum_start_date, { timezone: (participant as any).timezone || "UTC" })!;
    const diffDays = ppT.days;
    const weeks = ppT.weeks;
    const months = ppT.months;
    timelineContext = months >= 3
      ? `${months} months postpartum (week ${weeks})`
      : `${weeks} weeks postpartum (Day ${diffDays})`;

    if (diffDays < 14) {
      ppPhaseGuidance = "ACUTE RECOVERY (0-2 weeks): hormonal cliff (estrogen + progesterone crashed, prolactin/oxytocin surging), lochia, raw tissue. Center on rest, fluids, warm protein-rich meals, ZERO performance framing. Watch for intrusive thoughts.";
    } else if (diffDays < 42) {
      ppPhaseGuidance = "EARLY RECOVERY (2-6 weeks): baby-blues window closing. Hormones still finding baseline, thyroid can swing. Steady blood sugar, gentle daily walks once cleared, name PPD/PPA risk if mood not lifting by week 3.";
    } else if (diffDays < 84) {
      ppPhaseGuidance = "TISSUE CLOSING (6-12 weeks): tissue mostly healed, sleep debt at peak, identity shock peaking. Reintroduce breath-to-pelvic-floor work and very gentle strength. Cognitive fog is real but not permanent.";
    } else if (months < 6) {
      ppPhaseGuidance = "REBUILDING (3-6 months): hair shedding peaks, hormones re-regulating, cycle may return or hormones may mimic ovulation pre-period. Add light load training, protein 1.4-1.8g/kg, watch for 'PMS-like' moods even pre-cycle.";
    } else if (months < 12) {
      ppPhaseGuidance = "RECLAIMING CAPACITY (6-12 months): cycle often returns, thyroid worth rechecking. Train like an athlete with progressive overload. DO NOT use early-postpartum 'healing/recovery' framing — treat her as an adult athlete with a baby.";
    } else if (months < 24) {
      ppPhaseGuidance = "EXTENDED POSTPARTUM (12-24 months): hormones largely recalibrated, usually cycling again. Train for performance and longevity. Symptoms now usually trace to cycle/thyroid/sleep/stress — not 'postpartum'. NEVER use 'healing' framing.";
    } else {
      ppPhaseGuidance = "BEYOND 2 YEARS: treat as cycling adult with parenting context. Investigate cycle, iron, ferritin, thyroid panel, vitamin D, B12 before blaming postpartum for anything.";
    }
  }

  if (lifeStage === "pregnant") {
    // Compute gestational week from due_date (preferred) or pregnancy_lmp
    let gestWeeks: number | null = null;
    if (participant.due_date) {
      const due = new Date(participant.due_date + "T12:00:00Z");
      const now = new Date();
      const daysUntilDue = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      gestWeeks = Math.max(0, Math.min(42, 40 - Math.floor(daysUntilDue / 7)));
    } else if (participant.pregnancy_lmp) {
      const lmp = new Date(participant.pregnancy_lmp + "T12:00:00Z");
      const now = new Date();
      gestWeeks = Math.floor((now.getTime() - lmp.getTime()) / (1000 * 60 * 60 * 24 * 7));
    }
    if (gestWeeks !== null) {
      timelineContext = `${gestWeeks} weeks pregnant`;
      if (gestWeeks < 14) {
        pregnancyPhaseGuidance = "FIRST TRIMESTER (0-13 weeks): nausea, fatigue, food aversions, breast tenderness, emotional swings from progesterone surge. Focus on rest, hydration, small frequent meals, folate, and reassurance. Miscarriage anxiety is real — hold that gently.";
      } else if (gestWeeks < 28) {
        pregnancyPhaseGuidance = "SECOND TRIMESTER (14-27 weeks): energy often returns, bump grows, first movements, round ligament pain. Focus on protein, iron, gentle strength, pelvic floor awareness, sleep positioning.";
      } else {
        pregnancyPhaseGuidance = "THIRD TRIMESTER (28+ weeks): braxton hicks, reflux, swelling, sleep disruption, nesting, birth prep. Focus on hydration, protein, side-sleeping, perineal prep, mental prep for labor and postpartum.";
      }
    } else {
      pregnancyPhaseGuidance = "PREGNANCY (gestational age unknown): focus on validation, gentle nutrition, hydration, sleep, and mood — ask about trimester before giving stage-specific tips.";
    }
  }

  const onHormonalBc = participant.on_hormonal_bc;
  const stageLabel =
    lifeStage === "postpartum" ? "Postpartum"
    : lifeStage === "perimenopause" ? "Perimenopause"
    : lifeStage === "pregnant" ? "Pregnancy"
    : lifeStage === "pregnancy_loss" ? "Pregnancy Loss"
    : lifeStage === "irregular" ? (
        participant.has_uterus === false ? "Irregular / no uterus (ovaries intact)"
        : onHormonalBc === true ? "Irregular / Hormonal BC" : "Irregular cycle")
    : "Menopause";
  const stageContext =
    lifeStage === "postpartum"
      ? `${firstName} is in the postpartum stage${timelineContext ? ` — ${timelineContext}` : ""}. Phase-specific guidance: ${ppPhaseGuidance} Focus appropriately for this exact phase — do NOT use generic "healing and recovery" language for users past 6 months. Do NOT assume she is breastfeeding — only mention it if she brought it up. If she has multiple children, do NOT assume she is breastfeeding all of them.`
      : lifeStage === "perimenopause"
        ? `${firstName} is navigating **perimenopause** — she STILL HAS PERIODS and is still cycling, but the pattern is shifting (cycles getting shorter/longer, heavier/lighter, skipped months, new symptoms like hot flashes, sleep changes, sharper mood swings). DO NOT call her menopausal. Focus on tracking pattern shifts, sleep, hot flashes, mood, energy, and bone/muscle health. Perimenopause ≠ menopause.`
        : lifeStage === "pregnant"
          ? `${firstName} is **pregnant**${timelineContext ? ` — ${timelineContext}` : ""}. Phase-specific guidance: ${pregnancyPhaseGuidance} DO NOT reference cycle phases, ovulation, or period timing. DO NOT use menopause, perimenopause, or postpartum framing. Center pregnancy body-changes, emotional shifts, nutrition, sleep, and mental preparation for the specific trimester.`
          : lifeStage === "pregnancy_loss"
            ? (stageSuppressed
                ? `${firstName} has asked you NOT to bring up her pregnancy loss. Write a warm, neutral, everyday opener: energy, sleep, mood, nourishment, movement. Do NOT mention loss, grief, miscarriage, healing, recovery, "what you've been through", or her body recovering from anything. Do NOT reference ovulation, cycle phases, or menopause framing either. Just be an ordinary, warm presence.`
                : `${firstName} is navigating **pregnancy loss**. Lead with grief-aware, empathetic witnessing. Do NOT rush to cycle tracking, milestones, or "silver linings." Do NOT reference ovulation, phases, or menopause framing. Acknowledge the loss, name that the body is also recovering (hormones drop, bleeding, milk changes possible), and offer gentle presence — not fixes.`)
            : lifeStage === "irregular"
              ? (participant.birth_control_method === "copper_iud"
                  ? `${firstName} has an **irregular cycle** and ${bcFramingSummary(participant)}. Follow the BIRTH CONTROL METHOD rule above for all method wording. DO NOT use menopause, perimenopause, postpartum, or pregnancy framing. DO NOT confidently quote a specific cycle phase. Focus on steady-state levers: sleep, protein, strength, stress, and her own tracked patterns.`
                  : onHormonalBc === true
                  ? `${firstName} ${bcFramingSummary(participant)}. Her cycle is not tied to phases, so describe her day through what she tells you, with no phase labels. Describe her birth control plainly and neutrally. DO NOT use menopause, perimenopause, postpartum, or pregnancy framing. DO NOT confidently quote a specific cycle phase. Good everyday topics: sleep, food, movement, stress, and hydration. How to word anything about her specific method (bleeding, breaks, nutrients) is governed ONLY by the BIRTH CONTROL METHOD rules. Acknowledge symptoms in terms of daily patterns, not phase predictions.`
                  : onHormonalBc === false
                    ? `${firstName} has an **irregular cycle** and has explicitly confirmed she is NOT on hormonal birth control (could be PMOS — formerly called PCOS; both terms are in active use, so mirror whichever term she used — hypothalamic amenorrhea, thyroid, stress, or just unpredictable timing). ABSOLUTE RULE: NEVER mention the pill, IUD, implant, ring, patch, hormonal contraception, or BC-related nutrient depletion — she has told us this does not apply to her. DO NOT use menopause, perimenopause, postpartum, or pregnancy framing. DO NOT confidently quote a specific cycle phase. Good everyday topics: sleep, food, movement, stress, hydration, and her own observed patterns over calendar timing.`
                    : `${firstName} has an **irregular cycle**. We do NOT know whether she is on hormonal birth control — never assert or assume that she is, and do not give BC-specific nutrient-depletion advice. DO NOT use menopause, perimenopause, postpartum, or pregnancy framing. DO NOT confidently quote a specific cycle phase. Good everyday topics: sleep, food, movement, stress, hydration, and daily patterns rather than phase predictions.`)
              : `${firstName} is navigating menopause. Estrogen and progesterone are declining. Focus on bone health, sleep quality, mood stability, and managing symptoms like hot flashes or brain fog.`;


  // NO-UTERUS BRANCH (hysterectomy, ovaries retained) — layered on top of life_stage,
  // mirroring the on_hormonal_bc pattern. Not a life_stage value.
  const noUterusNote = participant.has_uterus === false
    ? `\n- NO UTERUS (hysterectomy, ovaries intact): She is NOT menopausal — her ovaries still cycle, so hormone patterns still apply. But she will NEVER bleed again: never ask for, reference, or imply a period date, Day 1, a late/due period, or "when your period starts". Any cycle day or phase here is an ESTIMATE with no bleed anchor — hedge it ("roughly", "estimated") and lean on her tracked symptoms over calendar timing.`
    : "";

  return `You are Logan. You're ${firstName}'s companion through her ${stageLabel.toLowerCase()} journey. You're not clinical — you're the friend who just gets it.${buildBoundaryRuleBlock(boundaries)}${buildBcMethodRule(participant)}${buildMemoryBlock(memoryNotes)}

CONTEXT:
- Life stage: **${stageLabel}**
${timelineContext ? `- Timeline: ${timelineContext}` : ""}
- ${stageContext}${noUterusNote}
- Age: ${age || "unknown"}
${(participant.watch_symptoms?.length ? `- She chose to watch: ${participant.watch_symptoms.join(", ")}. This only tells you what she cares about. Never say or imply she is having any of these today unless she logged it.\n` : "")}${topics.length > 0 ? `- Interest areas: ${topics.join(", ")}` : ""}

HER OWN RECENT WORDS (last ${RECENT_WINDOW_DAYS} days, context only):
${recentMessages.map(m => `${m.content.slice(0, 80)}`).join("\n") || "None"}

RULES:
${stageSuppressed
  ? `- STAGE AUTHORITY IS SUSPENDED: She has asked you not to bring up this life stage. Do NOT name it, allude to it, or frame the opener around it. Do NOT substitute another stage's framing either. Write a neutral, warm, everyday opener.`
  : `- STAGE AUTHORITY: The life stage above is **${stageLabel}** and is authoritative. It is IMPOSSIBLE for this response to use framing from any other stage. Never mention menopause for a pregnant/postpartum/perimenopause user. Never mention pregnancy for a menopause user. Never mention cycle phases or ovulation for pregnant, pregnancy_loss, postpartum, or menopause users.`}
- Lead with warmth. ${stageLabel} is not a deficit, it's a stage with its own strengths. Do not assume how she feels (except where the pregnancy loss rule above applies).
- For postpartum: match the EXACT phase guidance above. Acute/early phases = healing, rest, gentle pelvic floor. Rebuilding+ = strength, capacity, identity — NOT "healing/recovery" framing. Never prescribe. Never guilt.
- For perimenopause: she is STILL CYCLING. Never call her menopausal. Acknowledge pattern shifts, sharper swings, and new signals (hot flashes, sleep, mood). Perimenopause ≠ menopause.
- For menopause: focus on adaptation, strength preservation, and reframing the narrative. Only use menopause framing when life stage is actually "menopause".
- For pregnancy: match the EXACT trimester guidance above. Center pregnancy-specific body, mind, nutrition, and prep. NEVER use menopause, perimenopause, or postpartum framing. NEVER reference cycle phases or ovulation.
${stageSuppressed && lifeStage === "pregnancy_loss"
  ? `- Pregnancy loss must NOT be referenced at all in this message — no grief language, no "healing", no "what you've been through". This overrides every other instruction.`
  : `- For pregnancy loss: lead with grief-aware witnessing. Never rush to cycle tracking or "next steps." NEVER use cycle-phase, menopause, or generic postpartum framing.`}
- NEVER reference cycle phases, ovulation, or period timing for menopause, postpartum, pregnant, or pregnancy_loss users (perimenopause users still cycle, so cycle references are fine for them).
- For irregular / hormonal BC: never use menopause, perimenopause, postpartum, or pregnancy framing. Do NOT confidently assign a cycle phase. Describe it neutrally. Keep to everyday topics (sleep, food, movement, stress). Never name vitamins, minerals or supplements.
- NEVER assume breastfeeding status unless the user has explicitly mentioned it.

Generate a JSON object:

1. "intro": 2-3 short sentences. Max 40 words total.
   - Sentence 1: Ground them in their stage (bold the stage name). Vary the shape from day to day.
   - Sentence 2: Something warm and true about this stage. Do not name a feeling she has not logged.
   - Sentence 3 (optional): A gentle, neutral note. No tips about symptoms, food, supplements or medication.

2. "question": One short, open question (under 12 words), such as "How's today landing?". If she logged something recently, ask how that is going. Never a guess at a negative state. Start with a capital letter and end with "?".

3. "starters": 3 replies (2-4 words each) that fit an open question. One good, one mixed, one opens up.

4. "cheat_sheet": Personalized energy/focus/emotions/nutrition. Each has "level" (high/medium/low/variable) and "note" (max 12 words, inquiry-based; any question is a full sentence starting with a capital letter and ending with "?").

VOICE:
- Friend who just knows, not a coach
- Never say "you should", "try to", "consider", "make sure"
- No emojis, no exclamation points, no greetings
- Bold only the stage name
- Less is more

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

type InsightResult = Awaited<ReturnType<typeof generateAIInsight>>;

/** Same guardrail as chat: a card never names a supplement, medication or dose. One retry, then a plain fallback. */
async function generateGuardedInsight(apiKey: string, prompt: string): Promise<InsightResult> {
  const bad = (r: InsightResult) => breaksOpenerGuardrail(
    r.insight, r.question,
    ...Object.values(r.cheatSheet ?? {}).map((c) => (c as { note?: string })?.note),
  );
  const first = await generateAIInsight(apiKey, prompt);
  if (!bad(first)) return first;
  console.warn("Opener broke the medication/supplement guardrail, regenerating once");
  try {
    const retry = await generateAIInsight(apiKey, prompt + "\n\nYOUR PREVIOUS ATTEMPT NAMED A SUPPLEMENT, MEDICATION OR DOSE. Rewrite with none.");
    if (!bad(retry)) return retry;
  } catch { /* fall through to fallback */ }
  return {
    insight: "Here for whatever today looks like.",
    question: "How's today landing?",
    conversationStarters: ["Pretty good", "A bit flat", "Tell me more"],
    cheatSheet: null,
  };
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
        { role: "system", content: "You are Logan, a warm, steady friend. You never assume how she feels. You only refer to feelings she has logged recently. You're not clinical. Always respond in valid JSON." },
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

  // Strip code fences and any leading "json" label the model sometimes prepends
  const stripped = content
    .replace(/```json\n?|\n?```/g, "")
    .replace(/^\s*json\s*/i, "")
    .trim();

  // Extract the first {...} block to tolerate stray prose around the JSON
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  const jsonSlice = firstBrace !== -1 && lastBrace > firstBrace
    ? stripped.slice(firstBrace, lastBrace + 1)
    : stripped;

  const tryParse = (s: string) => {
    try { return JSON.parse(s); } catch { return null; }
  };

  let parsed = tryParse(jsonSlice) || tryParse(stripped);

  // Last-ditch: regex out the intro field so users never see raw JSON
  if (!parsed) {
    const introMatch = stripped.match(/"intro"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (introMatch) {
      parsed = { intro: introMatch[1].replace(/\\"/g, '"').replace(/\\n/g, " ") };
    }
  }

  if (parsed) {
    return {
      insight: parsed.intro || "How are you feeling today?",
      question: parsed.question || "",
      conversationStarters: parsed.starters || ["Pretty good", "A bit flat", "Tell me more"],
      cheatSheet: parsed.cheat_sheet || null,
    };
  }

  console.error("Failed to parse AI response as JSON, length:", content.length);
  return {
    insight: "How are you feeling today?",
    question: "",
    conversationStarters: ["Pretty good", "A bit flat", "Tell me more"],
    cheatSheet: null,
  };
}
