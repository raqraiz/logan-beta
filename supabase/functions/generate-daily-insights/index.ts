import { anchorPromptRule, currentCycleAnchorType } from "../_shared/cycleAnchor.ts";
import { buildBcMethodRule,  } from "../_shared/bcMethod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  fetchActiveBoundaries,
  buildBoundaryRuleBlock,
  hasStageBoundary,
  mentionsLoss,
} from "../_shared/topicBoundaries.ts";
import { fetchMemoryNotes, buildMemoryBlock } from "../_shared/memoryNotes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Chat-fact extraction (v1: food craving/aversion + named dated event) ---
const CHAT_FACT_MIN_CHARS = 200; // ~350 chars/week median; below this there is nothing to read
const CHAT_FACT_TIMEOUT_MS = 7000;

type ChatFact =
  | { type: "food"; direction: "craving" | "avoiding"; item: string; daysAgo: number }
  | { type: "event"; label: string; date: string };

async function extractChatFacts(
  transcript: string,
  today: string,
  apiKey: string,
): Promise<ChatFact[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHAT_FACT_TIMEOUT_MS);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        temperature: 0,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You extract at most two kinds of fact a woman states about HERSELF in her own chat messages.",
              'Return json of the form {"foods":[{"item":"...","direction":"craving|avoiding","daysAgo":0}],"events":[{"label":"...","date":"YYYY-MM-DD"}]}.',
              "foods: a specific food or drink she says she is craving, wants, or wants to avoid. item is 1-3 words, lowercase.",
              "  daysAgo: how many days before today the message was sent (each line is tagged with its age).",
              "events: a named plan or event with an identifiable date (a race, a trip, a wedding, a deadline, an appointment).",
              "  label is 1-5 words, lowercase. date must be an absolute YYYY-MM-DD resolved against today's date.",
              "  Skip any event whose date you cannot pin down confidently.",
              "Rules:",
              "- Extract ONLY what she states about herself. Return empty lists for questions, hypotheticals,",
              "  someone else's plans or cravings, negations, and general curiosity.",
              "- Do NOT invent or infer. Empty lists are the correct answer most of the time.",
            ].join("\n"),
          },
          { role: "user", content: `Today is ${today}.\nHer recent messages:\n${transcript.slice(0, 6000)}` },
        ],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn("[chat_facts] gateway error", res.status);
      return [];
    }

    const data = await res.json();
    const parsed = JSON.parse(
      String(data.choices?.[0]?.message?.content ?? "{}").replace(/```json/gi, "").replace(/```/g, "").trim(),
    );

    const facts: ChatFact[] = [];
    for (const f of Array.isArray(parsed.foods) ? parsed.foods : []) {
      const item = typeof f?.item === "string" ? f.item.trim().slice(0, 40) : "";
      const daysAgo = Number.isFinite(f?.daysAgo) ? Math.max(0, Math.round(Number(f.daysAgo))) : 7;
      // Foods use the same ~7 day freshness window as symptom data.
      if (item && daysAgo <= 7) {
        facts.push({
          type: "food",
          direction: f?.direction === "avoiding" ? "avoiding" : "craving",
          item,
          daysAgo,
        });
      }
    }
    for (const e of Array.isArray(parsed.events) ? parsed.events : []) {
      const label = typeof e?.label === "string" ? e.label.trim().slice(0, 60) : "";
      const date = typeof e?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : "";
      // An event is valid through its own date, then gone the next day.
      if (label && date && date >= today) facts.push({ type: "event", label, date });
    }
    return facts.slice(0, 5);
  } catch (e) {
    console.warn("[chat_facts] extraction skipped:", (e as Error)?.message);
    return [];
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const localDate = typeof body.localDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.localDate)
      ? body.localDate
      : null;
    const contextKey = typeof body.contextKey === "string" ? body.contextKey.slice(0, 300) : null;
    if (!localDate || !contextKey) return json({ error: "Missing localDate or contextKey" }, 400);

    const lifeStage = typeof body.lifeStage === "string" ? body.lifeStage : "cycling";
    const phase = typeof body.phase === "string" ? body.phase : "Follicular";
    const cycleDay = Number.isFinite(body.cycleDay) ? Number(body.cycleDay) : null;
    const cycleLengthDays = Number.isFinite(body.cycleLengthDays) ? Number(body.cycleLengthDays) : 28;
    const postpartumPhase = typeof body.postpartumPhase === "string" ? body.postpartumPhase : null;
    const postpartumWeeks = Number.isFinite(body.postpartumWeeks) ? Number(body.postpartumWeeks) : null;
    const anchorSymptom = typeof body.anchorSymptom === "string" ? body.anchorSymptom : null;

    // Never generate without real stage data.
    if (lifeStage === "postpartum" && (!postpartumPhase || postpartumPhase === "unset")) {
      return json({ error: "fallback_required" }, 422);
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Serve the cache when nothing about her situation changed today.
    const { data: cached } = await service
      .from("daily_home_insights")
      .select("succeed_text, dont_mess_up_text, succeed_partner_text, dont_mess_up_partner_text, context_key")
      .eq("user_id", userId)
      .eq("local_date", localDate)
      .maybeSingle();

    if (cached && cached.context_key === contextKey) {
      return json({
        succeed: String(cached.succeed_text).split("\n").filter(Boolean),
        dontMessUp: String(cached.dont_mess_up_text).split("\n").filter(Boolean),
        succeedPartner: String(cached.succeed_partner_text ?? "").split("\n").filter(Boolean),
        dontMessUpPartner: String(cached.dont_mess_up_partner_text ?? "").split("\n").filter(Boolean),
        cached: true,
      });
    }

    const { data: bcRow } = await service
      .from("participants")
      .select("birth_control_method, on_hormonal_bc, birth_control_status, cycle_anchor_type")
      .eq("user_id", userId)
      .maybeSingle();
    const bcRule = buildBcMethodRule(bcRow as any) + anchorPromptRule(currentCycleAnchorType(bcRow));

    // Recent symptoms (last 21 days) with freshness so the model can hedge.
    const since = new Date(Date.now() - 21 * 86400000).toISOString();
    const { data: logs } = await service
      .from("symptom_logs")
      .select("symptoms, notes, logged_at")
      .eq("user_id", userId)
      .gte("logged_at", since)
      .order("logged_at", { ascending: false })
      .limit(20);

    const symptomLines: string[] = [];
    for (const log of logs ?? []) {
      const daysAgo = Math.max(
        0,
        Math.round((Date.now() - new Date(log.logged_at as string).getTime()) / 86400000),
      );
      const names = Array.isArray(log.symptoms)
        ? (log.symptoms as Array<{ name?: string; severity?: number } | string>)
            .map((s) => (typeof s === "string" ? s : s?.name))
            .filter(Boolean)
        : [];
      if (names.length) symptomLines.push(`${names.join(", ")} (${daysAgo}d ago)`);
    }
    const symptomContext = symptomLines.length
      ? `Recent symptom logs (most recent first): ${symptomLines.slice(0, 10).join("; ")}. Anything older than a week is a weak signal — hedge rather than assert a trend.`
      : "She has no recent symptom logs. Do not invent symptoms.";

    // Active "don't bring up X" boundaries — absolute, enforced on this surface too.
    const boundaries = await fetchActiveBoundaries(service, userId);
    const memoryNotes = await fetchMemoryNotes(service, userId);
    const stageSuppressed = hasStageBoundary(boundaries, lifeStage);

    let stageContext: string;
    if (lifeStage === "postpartum") {
      stageContext = `She is postpartum, ${postpartumWeeks ?? 0} weeks since birth (recovery stage: ${postpartumPhase}). She is NOT cycling. Never mention a menstrual cycle phase or cycle day.`;
    } else if (lifeStage === "menopause" || lifeStage === "perimenopause") {
      stageContext = `She is in ${lifeStage}. Do not name a cycle phase or day number. Focus on sleep, strength, protein, temperature regulation and mood.`;
    } else if (lifeStage === "pregnant") {
      stageContext = `She is pregnant. Do not name a menstrual cycle phase. Focus on safe, supportive guidance.`;
    } else if (lifeStage === "pregnancy_loss") {
      stageContext = stageSuppressed
        ? `Do not name a menstrual cycle phase or day number. Keep everything neutral and everyday: sleep, energy, nourishment, movement, mood. Do NOT reference loss, grief, healing, recovery, or anything she has been through.`
        : `She is recovering from a pregnancy loss. Be gentle, never minimize, never rush her timeline.`;
    } else if (!isPhaseTrackingOn(lifeStage)) {
      // Phase tracking off is decided by life_stage only, never by birth control.
      stageContext = `Her cycle is irregular or externally regulated by hormonal birth control. Do not name a phase or day number. Focus on steady-state levers.`;
    } else {
      stageContext = `She is on Day ${cycleDay ?? 1} of a ${cycleLengthDays}-day cycle, in her ${phase} phase.`;
    }

    const anchorContext = anchorSymptom
      ? `Her anchor symptom (the one she cares most about) is "${anchorSymptom}".`
      : "";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI not configured" }, 500);

    // --- Chat facts from her own messages in the last 7 days (never persisted) ---
    let chatFactContext = "";
    const chatSince = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: recentMessages } = await service
      .from("chat_messages")
      .select("content, created_at")
      .eq("user_id", userId)
      .eq("role", "user")
      .gte("created_at", chatSince)
      .order("created_at", { ascending: false })
      .limit(60);

    const msgLines: string[] = [];
    let totalChars = 0;
    for (const m of recentMessages ?? []) {
      const text = typeof m.content === "string" ? m.content.trim() : "";
      if (!text) continue;
      totalChars += text.length;
      const daysAgo = Math.max(
        0,
        Math.round((Date.now() - new Date(m.created_at as string).getTime()) / 86400000),
      );
      msgLines.push(`(${daysAgo}d ago) ${text.slice(0, 400)}`);
    }

    if (totalChars >= CHAT_FACT_MIN_CHARS && msgLines.length) {
      const facts = await extractChatFacts(msgLines.join("\n"), localDate, LOVABLE_API_KEY);
      if (facts.length) {
        const lines = facts.map((f) =>
          f.type === "food"
            ? `She mentioned ${f.direction === "avoiding" ? "wanting to avoid" : "craving"} ${f.item} (${f.daysAgo === 0 ? "today" : `${f.daysAgo}d ago`}).`
            : `She mentioned ${f.label}${f.date === localDate ? " — that is today" : ` on ${f.date}`}.`
        );
        chatFactContext = `From her own recent messages: ${lines.join(" ")} These came from chat, not from a log — reference them lightly and naturally, never state them as confirmed facts, and skip any that do not fit today's guidance.`;
      }
    }


    const systemPrompt = `You are Logan — a knowledgeable, grounded friend giving a woman two short lists for TODAY only.${buildBoundaryRuleBlock(boundaries)}${bcRule}${buildMemoryBlock(memoryNotes)}

${stageContext}
${anchorContext}
${symptomContext}
${chatFactContext}


Write four lists, two addressed to her and two addressed to her partner:
- "succeed": 3 things that will make today go well for her, given her exact state.
- "dontMessUp": 3 specific traps to avoid today, given her exact state.
- "succeedPartner": exactly 3 things her partner can do today to support her.
- "dontMessUpPartner": exactly 3 things her partner should avoid today.

The partner lists speak directly TO the partner as "you" (example: "Take dinner off the plate tonight."). Never assume the partner's gender. No gendered gifts or stereotypes (no cologne, flowers, "date night", "man up" and similar). They draw on the same state, symptoms and recent-message context as her lists.

Rules for every item: ONE sentence, 8 words or fewer, concrete and actionable, plain everyday words. Never start with "Prioritize" or "Refrain from". Never use the words "ensure", "nurture" or "self-care". Never use em dashes or en dashes. Grace over guilt, never shaming. No emojis, no markdown, no numbering, no headers. Vary the wording day to day.

Return ONLY JSON: {"succeed":["...","...","..."],"dontMessUp":["...","...","..."],"succeedPartner":["...","...","..."],"dontMessUpPartner":["...","...","..."]}`;

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
          { role: "user", content: `Today is ${localDate}. Generate today's four lists.` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return json({ error: "Rate limited, try again shortly." }, 429);
      if (response.status === 402) return json({ error: "AI credits exhausted." }, 402);
      console.error("AI gateway error:", response.status, await response.text());
      return json({ error: "AI error" }, 500);
    }

    const data = await response.json();
    const raw: string = data.choices?.[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

    let succeed: string[] = [];
    let dontMessUp: string[] = [];
    let succeedPartner: string[] = [];
    let dontMessUpPartner: string[] = [];
    const asList = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
    try {
      const parsed = JSON.parse(cleaned);
      succeed = asList(parsed.succeed);
      dontMessUp = asList(parsed.dontMessUp);
      succeedPartner = asList(parsed.succeedPartner);
      dontMessUpPartner = asList(parsed.dontMessUpPartner);
    } catch (_e) {
      console.error("Failed to parse AI output:", cleaned.slice(0, 300));
    }

    if (succeed.length < 2 || dontMessUp.length < 2) {
      return json({ error: "fallback_required" }, 422);
    }

    // Partner tips: max 8 words, banned words, no dashes. Bad tips are regenerated, never truncated.
    const BANNED_TIP = /[—–]|\b(ensure|nurture|self-care|self care|prioriti[sz]e|refrain)\b/i;
    const tipOk = (t: string) => t.trim().split(/\s+/).length <= 8 && !BANNED_TIP.test(t);
    const fixTips = async (list: string[], kind: "do" | "avoid"): Promise<string[]> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const badIdx = list.map((t, i) => (tipOk(t) ? -1 : i)).filter((i) => i >= 0);
        if (!badIdx.length) break;
        try {
          const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "openai/gpt-6-astra",
              instructions: `${systemPrompt}\n\nRewrite only the given partner tips. Each must be 8 words or fewer, addressed to the partner as "you", gender-neutral, plain words, no dashes, no "ensure", "nurture", "self-care", "Prioritize" or "Refrain from". Keep the same meaning. These are things to ${kind === "do" ? "do" : "avoid"} today. Return ONLY a JSON array of strings, same order.`,
              input: JSON.stringify(badIdx.map((i) => list[i])),
            }),
          });
          if (!r.ok) break;
          const d = await r.json();
          const text: string = d.output_text ?? (d.output ?? []).flatMap((o: { content?: { text?: string }[] }) => o.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
          const arr = JSON.parse(text.replace(/```json/gi, "").replace(/```/g, "").trim());
          if (!Array.isArray(arr)) break;
          list = [...list];
          badIdx.forEach((i, k) => { if (typeof arr[k] === "string" && arr[k].trim()) list[i] = arr[k].trim(); });
        } catch { break; }
      }
      return list.filter(tipOk).slice(0, 3);
    };
    [succeedPartner, dontMessUpPartner] = await Promise.all([fixTips(succeedPartner, "do"), fixTips(dontMessUpPartner, "avoid")]);

    // Post-generation guard: strip any line that breaches an active loss boundary.
    // If a list ends up too short, substitute neutral everyday tips (never an empty
    // section, and never the client's static loss-themed fallback).
    if (stageSuppressed && lifeStage === "pregnancy_loss") {
      const NEUTRAL_SUCCEED = [
        "Get outside for ten minutes of daylight before noon.",
        "Start the day with something that has a bit of protein.",
        "Pick one small task and let finishing it be enough.",
      ];
      const NEUTRAL_DONTMESS = [
        "Don't skip lunch because the day got busy.",
        "Don't scroll in bed past your usual lights-out.",
        "Don't pack your evening so full you can't rest.",
      ];
      const NEUTRAL_SUCCEED_HIM = [
        "Handle dinner tonight without being asked.",
        "Suggest a short walk together this evening.",
        "Ask what would make her evening easier, then do it.",
      ];
      const NEUTRAL_DONTMESS_HIM = [
        "Don't make plans for her evening without checking first.",
        "Don't leave the small chores for her to notice.",
        "Don't push a conversation she doesn't feel like having.",
      ];
      const guard = (list: string[], fallback: string[]) => {
        const kept = list.filter((t) => !mentionsLoss(t));
        if (kept.length !== list.length) console.warn("[boundary] stripped loss references from daily insights");
        return kept.length >= 2 ? kept : fallback;
      };
      succeed = guard(succeed, NEUTRAL_SUCCEED);
      dontMessUp = guard(dontMessUp, NEUTRAL_DONTMESS);
      succeedPartner = guard(succeedPartner, NEUTRAL_SUCCEED_HIM);
      dontMessUpPartner = guard(dontMessUpPartner, NEUTRAL_DONTMESS_HIM);
    }

    succeed = succeed.slice(0, 4);
    dontMessUp = dontMessUp.slice(0, 4);
    // Him lists are best-effort: too few items simply falls back to the static set.
    succeedPartner = succeedPartner.length >= 2 ? succeedPartner.slice(0, 4) : [];
    dontMessUpPartner = dontMessUpPartner.length >= 2 ? dontMessUpPartner.slice(0, 4) : [];

    // Unique constraint is (user_id, local_date) — a context change overwrites today's row.
    const { error: upsertErr } = await service
      .from("daily_home_insights")
      .upsert(
        {
          user_id: userId,
          local_date: localDate,
          succeed_text: succeed.join("\n"),
          dont_mess_up_text: dontMessUp.join("\n"),
          succeed_partner_text: succeedPartner.length ? succeedPartner.join("\n") : null,
          dont_mess_up_partner_text: dontMessUpPartner.length ? dontMessUpPartner.join("\n") : null,
          context_key: contextKey,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,local_date" },
      );
    if (upsertErr) console.error("daily_home_insights upsert failed:", upsertErr.message);

    return json({ succeed, dontMessUp, succeedPartner, dontMessUpPartner, cached: false });
  } catch (e) {
    console.error("generate-daily-insights error:", e);
    return json({ error: "An internal error occurred" }, 500);
  }
});
