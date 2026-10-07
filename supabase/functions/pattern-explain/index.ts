// One short, calm explanation for a symptom pattern on the You tab. Nothing is stored.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { CALM_VOICE_RULE } from "../_shared/voiceRule.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({ symptom: z.string().min(1).max(60), from: z.number().int().min(1).max(90).nullable(), to: z.number().int().min(1).max(90).nullable() });

// Symptoms that can need prompt care: always lead with a doctor line, never blame the cycle alone.
const SAFETY_RE = /\b(hearing|ear|tinnitus|deaf|vision|sight|blurr|eye|chest pain|chest|severe headache|migraine|worst headache|faint|pass(ed)? out|heavy bleeding|soak|hemorrhag|clot|self.?harm|suicid|hurt myself|pregnan)/i;
const SAFETY_LINE = "This is worth checking with a doctor, today if it's sudden, severe or getting worse.";
const dashes = (s: string) => s.replace(/\s*[—–]\s*/g, ", ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ error: "unauthorized" }, 401);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await service.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { symptom, from, to } = parsed.data;
    const safety = SAFETY_RE.test(symptom) ? SAFETY_LINE : null;
    if (from === null) return json({ safety, text: "Keep logging and I'll spot the timing." });

    const prompt = `You are Logan, a knowledgeable, grounded friend. In at most 2 short sentences (max 30 words total), explain in plain words why "${symptom}" often shows up around cycle days ${from} to ${to}, and when it usually eases. Use general biology (hormone shifts), "often"/"can", never certainty.
NO DIAGNOSIS: never name or imply a condition. Never name medication or dosage. No emojis, no lists.${safety ? " This symptom can need prompt care: do NOT say it is caused only by her cycle; say hormones can play a part, nothing more." : ""}${CALM_VOICE_RULE}`;
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) return json({ safety, text: null }, r.status === 429 || r.status === 402 ? r.status : 200);
    const d = await r.json();
    const text = dashes(String(d?.choices?.[0]?.message?.content ?? "").trim()) || null;
    return json({ safety, text });
  } catch (e) {
    console.error("[pattern-explain]", (e as Error).message);
    return json({ safety: null, text: null });
  }
});
