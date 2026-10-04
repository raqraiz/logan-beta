// Generates partner heads-up drafts on request. Draft text is returned to the browser and never saved,
// except her own edited wording, kept (last 5) as style examples by explicit product decision.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { helpPhrase } from "../_shared/partnerHeadsup.ts";
import { partnerHeadsupVisibleFor } from "../_shared/partnerHeadsupFlag.ts";
import { trackMessageFailures } from "../_shared/messageFailures.ts";

const MODEL = "openai/gpt-6-astra";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("generate"),
    name: z.string().max(60).optional(),
    focus: z.array(z.string().trim().min(1).max(40)).max(2).optional(),
    avoid_opening: z.number().int().min(0).max(9).optional(),
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

    const [{ data: s }, { data: recent }, { data: styles }] = await Promise.all([
      admin.from("partner_headsup_settings").select("*").eq("user_id", uid).maybeSingle(),
      admin.from("chat_messages").select("content").eq("user_id", uid).eq("role", "user").order("created_at", { ascending: false }).limit(12),
      admin.from("partner_headsup_style_examples").select("text").eq("user_id", uid).order("created_at", { ascending: false }).limit(3),
    ]);
    const lang = detectLang((recent ?? []).map((r) => r.content));
    const name = (b.name || "").trim();
    const inc = { mood: s ? s.include_mood : true, helps: s ? s.include_helps : true };
    const helps: string[] = (s?.helps ?? []).map(helpPhrase);
    // Rotate openings; never the same as the previous draft (client passes the last one used).
    const OPENINGS = [
      "Open with a short, simple greeting and get straight to the point.",
      "Open with what would help most tonight, then say why.",
      "Open with a warm, slightly playful line.",
      "Open with a simple 'quick one from me' style line.",
      "Open by saying today has been a lot, in plain words.",
    ];
    let opening = Math.floor(Math.random() * OPENINGS.length);
    if (opening === b.avoid_opening) opening = (opening + 1) % OPENINGS.length;
    const focusList = b.focus ?? [];

    const prompt = [
      `Write a short WhatsApp message that a woman will send, as herself, to ${name || "someone close to her"}, letting them know today is a harder one and how they could help.`,
      "Rules:",
      "- First person, as her. Under 55 words. Warm, calm and plain. Never critical, blaming or accusatory, even if things are tense between them. No em dashes or en dashes. No emojis unless her style examples use them. No hashtags.",
      "- Never mention bleeding, periods, menstruation, cycles, PMS, hormones, fertility, sex, medication, or any symptom detail. Never mention dates or days of the week; keep it about today / tonight.",
      name ? `- Start with a greeting that uses the name "${name}" (e.g. "Hey ${name},"). Never assume their gender.` : '- Start with a greeting without a name, e.g. "Hey,". Never assume their gender.',
      `- Write in ${LANG_NAME[lang]}.`,
      focusList.length
        ? `- Build it around what feels hardest today: ${focusList.join("; ")}. Turn each into how she'd like support, in plain general terms. Say it's not about them.`
        : inc.mood ? "- Include a light line that she's running low today and that it's not about them." : "- Do not describe her mood or energy.",
      `- ${OPENINGS[opening]}`,
      inc.helps && helps.length ? `- End with what helps: ${helps.join("; ")}.` : "- End with one simple, concrete ask.",
      styles?.length ? `\nHer own past wording, match this voice:\n${styles.map((x) => `"""${x.text}"""`).join("\n")}` : "",
      "\nExample of the tone:",
      '"Hey love, today\'s a rough one for me. Low energy and not much patience left. It\'s not about you. Could you take dinner tonight and give me a bit of space?"',
      "\nReturn only the message text.",
    ].filter(Boolean).join("\n");

    const text = await callModel(prompt);
    return json({ text, opening });
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
