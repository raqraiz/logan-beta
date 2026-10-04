// Generates partner heads-up drafts on request. Draft text is returned to the browser and never saved,
// except her own edited wording, kept (last 5) as style examples by explicit product decision.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { cycleConfidence, harderWindow, helpPhrase, isHardToPredict, localParts, weekdayOf } from "../_shared/partnerHeadsup.ts";
import { partnerHeadsupVisibleFor } from "../_shared/partnerHeadsupFlag.ts";
import { trackMessageFailures } from "../_shared/messageFailures.ts";

const MODEL = "openai/gpt-6-astra";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("generate"),
    mode: z.enum(["predicted", "today", "undated"]),
    source_message_id: z.string().uuid().optional(),
    name: z.string().max(60).optional(),
    relationship: z.enum(["partner", "family", "friend"]).optional(),
    use_defaults: z.boolean().optional(),
    adjust: z.enum(["shorter", "warmer", "lighter", "funny"]).optional(),
    language: z.enum(["en", "he", "es"]).optional(),
    current_text: z.string().max(1200).optional(),
    focus: z.array(z.string().trim().min(1).max(40)).max(2).optional(),
  }),
  z.object({ action: z.literal("save_style"), text: z.string().min(1).max(1000) }),
]);

function detectLang(samples: string[]): "en" | "he" | "es" {
  const joined = samples.join(" ");
  if (/[\u0590-\u05FF]/.test(joined)) return "he";
  const es = (joined.toLowerCase().match(/\b(que|estoy|pero|porque|hoy|tengo|muy|gracias|como|siento|también|estás)\b/g) ?? []).length;
  const en = (joined.toLowerCase().match(/\b(the|i|and|to|my|is|you|feel|what|so|me|for|it)\b/g) ?? []).length;
  return es >= 3 && es > en ? "es" : "en";
}
const LANG_NAME = { en: "English", he: "Hebrew", es: "Spanish" } as const;

async function callModel(prompt: string): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw Object.assign(new Error("AI not configured"), { status: 500 });
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model: MODEL, input: prompt, stream: true, store: false, reasoning: { effort: "low", summary: "auto" }, include: ["reasoning.encrypted_content"] }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text();
    throw Object.assign(new Error(t || "AI request failed"), { status: res.status });
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
        if (ev.type === "response.failed" || ev.type === "error") throw Object.assign(new Error(ev.error?.message ?? "AI failed"), { status: 502 });
      } catch (e) { if ((e as any)?.status) throw e; }
    }
  }
  out = out.trim().replace(/^["“]|["”]$/g, "").replace(/\s*[—–]\s*/g, ", ");
  if (!out) throw Object.assign(new Error("Empty draft"), { status: 502 });
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);
    const uid = u.user.id;
    const admin = trackMessageFailures(createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!), "partner-headsup-draft");
    if (!(await partnerHeadsupVisibleFor(admin, uid))) return json({ error: "Not available" }, 403);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const b = parsed.data;

    if (b.action === "save_style") {
      await admin.from("partner_headsup_style_examples").insert({ user_id: uid, text: b.text });
      const { data: old } = await admin.from("partner_headsup_style_examples").select("id")
        .eq("user_id", uid).order("created_at", { ascending: false }).range(5, 50);
      if (old?.length) await admin.from("partner_headsup_style_examples").delete().in("id", old.map((r) => r.id));
      return json({ ok: true });
    }

    const [{ data: s }, { data: p }, { data: recent }, { data: styles }] = await Promise.all([
      admin.from("partner_headsup_settings").select("*").eq("user_id", uid).maybeSingle(),
      admin.from("participants").select("last_period_start, cycle_length_days, timezone").eq("user_id", uid).maybeSingle(),
      admin.from("chat_messages").select("content").eq("user_id", uid).eq("role", "user").order("created_at", { ascending: false }).limit(12),
      admin.from("partner_headsup_style_examples").select("text").eq("user_id", uid).order("created_at", { ascending: false }).limit(3),
    ]);

    const userLang = detectLang((recent ?? []).map((r) => r.content));
    const lang = b.language ?? userLang;
    const name = (b.name || s?.partner_name || "").trim() || "there";
    const relationship = b.relationship ?? s?.relationship ?? null;
    const defaults = b.use_defaults || !s;
    const inc = {
      dates: defaults ? true : s!.include_dates,
      mood: defaults ? true : s!.include_mood,
      helps: defaults ? true : s!.include_helps,
    };
    const helps: string[] = (s?.helps ?? []).map(helpPhrase);

    let feeling = "";
    // When she picked chips, her own chat words are never used, only the chips.
    if (b.mode === "today" && b.source_message_id && !b.focus) {
      const { data: m } = await admin.from("chat_messages").select("content, user_id").eq("id", b.source_message_id).maybeSingle();
      if (m?.user_id === uid) feeling = m.content;
    }

    const local = localParts(p?.timezone);
    const win = harderWindow(p?.last_period_start ?? null, p?.cycle_length_days ?? null, local.date);
    const conf = await cycleConfidence(admin, uid);
    const hard = await isHardToPredict(admin, uid, local.date);
    const undated = b.mode === "undated" || conf.low || hard || !win;
    // Vary the opening each time so it never reads like a copy (no message text is stored to compare against).
    const { count: sentCount } = await admin.from("partner_headsup_events").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("status", "opened");
    const OPENINGS = [
      "Open with a short greeting and get straight to the point.",
      "Open by naming the days first, then the greeting can be skipped.",
      "Open with what would help most, then explain why.",
      "Open with a warm, slightly playful line before the heads-up.",
      "Open with a simple 'quick one from me' style line.",
    ];
    const opening = OPENINGS[(sentCount ?? 0) % OPENINGS.length];
    const focusList = b.focus ?? null;

    let timing = "";
    if (b.mode === "today") timing = "It is about today only. Base it on how she says she feels today, without any symptom detail.";
    else if (!inc.dates) timing = "Do not mention any days or dates. Say 'the next few days'.";
    else if (undated) timing = "Do not name days. Say 'in the next week or so'.";
    else timing = `Her harder stretch is from about ${weekdayOf(win!.start)} to ${weekdayOf(win!.end)}. Name those two weekdays.`;

    const prompt = [
      `Write a short WhatsApp message that a woman will send, as herself, to ${name}${relationship ? ` (her ${relationship})` : ""}, giving a heads-up that she is having, or about to have, a harder few days.`,
      "Rules:",
      "- First person, as her. Under 60 words. Warm and plain. No em dashes or en dashes. No emojis unless her style examples use them. No hashtags.",
      "- Never mention bleeding, periods, menstruation, cycles, PMS, hormones, fertility, sex, medication, or any symptom detail (no pain, cramps, headaches, etc.).",
      `- Use the name "${name}" only if natural. ${relationship === "partner" ? 'A greeting like "Hey love" is fine.' : ""} Never assume ${name}'s gender: no gendered words or pronouns for them.`,
      `- Write in ${LANG_NAME[lang]}.`,
      `- ${timing}`,
      focusList && focusList.length
        ? `- Build the message around what feels hardest for her this time: ${focusList.join("; ")}. Turn each into how she'd like support, in plain general terms, never medical. Say it's not about them.`
        : focusList ? "- Do not describe her mood or energy; keep it to what helps."
        : inc.mood ? "- Include a light line about lower energy / shorter fuse, and that it's not about them." : "- Do not describe her mood or energy.",
      `- ${opening} Do not start with "Hey love, a heads-up from me", and do not reuse the first sentence of her past wording below.`,
      inc.helps && helps.length ? `- End with what helps: ${helps.join("; ")}.` : "- Do not list what helps.",
      feeling ? `\nHow she says she feels today (use the feeling, drop any symptom or body detail):\n"""${feeling.slice(0, 600)}"""` : "",
      styles?.length ? `\nHer own past wording, match this voice and phrasing:\n${styles.map((x) => `"""${x.text}"""`).join("\n")}` : "",
      b.adjust && b.current_text ? `\nRewrite this current draft to be ${b.adjust === "funny" ? "lighter and a bit funny" : b.adjust}, keeping the same facts:\n"""${b.current_text}"""` : "",
      b.language && b.current_text && !b.adjust ? `\nTranslate and adapt this current draft into ${LANG_NAME[lang]}:\n"""${b.current_text}"""` : "",
      "\nExamples of the tone:",
      '"Hey love, a heads-up from me. The next few days, from about Thursday to Sunday, are usually my harder stretch. Lower energy, shorter fuse. It\'s not about you. What helps: taking dinner off my plate, a bit of extra patience, and space without asking why."',
      '"Hey love, today\'s a rough one for me. Low energy and not much patience left. It\'s not about you. Could you take dinner tonight and give me a bit of space?"',
      "\nReturn only the message text.",
    ].filter(Boolean).join("\n");

    const text = await callModel(prompt);
    return json({
      text,
      language: lang,
      user_language: userLang,
      undated: b.mode !== "today" && undated,
      cycles_used: conf.n,
      window: win && !undated ? { start: win.start, end: win.end, period_start: win.periodStart } : null,
      cycle_length_days: p?.cycle_length_days ?? null,
    });
  } catch (e) {
    const status = (e as any)?.status ?? 500;
    console.error("[partner-headsup-draft]", status, e);
    const msg = status === 402 ? "Logan's AI credits have run out. Please try again later."
      : status === 429 ? "Logan is busy right now. Try again in a minute."
      : status === 403 ? "This isn't available right now."
      : "Couldn't write the draft. Try again.";
    return json({ error: msg }, status);
  }
});
