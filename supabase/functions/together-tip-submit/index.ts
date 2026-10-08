// Moderates and saves one "What helped" tip. Nothing goes public before this check.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { handleSync, handleWord } from "./words.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({ symptom: z.string().trim().min(1).max(60), text: z.string().trim().min(3).max(160), tipId: z.string().uuid().optional() });

const CHECK_FIRST_RE = /\b(muffled hearing|hearing loss|tinnitus|ringing in (my |the )?ears?|ear ringing)\b/i;
const SAFETY_RE = /\b(hearing|ear|tinnitus|deaf|vision|sight|blurr|eye|chest pain|chest|severe headache|worst headache|faint|pass(ed)? out|heavy bleeding|soak|hemorrhag|clot|self.?harm|suicid|hurt myself|pregnan)/i;
const SAFETY_REASON = "For this one, a doctor is the best first step, so I don't share tips about it.";
const dashes = (s: string) => s.replace(/\s*[—–]\s*/g, ", ");

function labelFor(p: Record<string, any> | null): string {
  if (!p) return "Someone in Together";
  const stage = p.life_stage;
  if (stage === "pregnant") return "Someone who's pregnant";
  if (stage === "postpartum") return "Someone postpartum";
  if (stage === "perimenopause") return "Someone in perimenopause";
  if (stage === "menopause") return "Someone in menopause";
  if (!p.last_period_start) return "Someone in Together";
  const len = Math.min(60, Math.max(20, p.cycle_length_days || 28));
  const start = Date.parse(`${p.last_period_start}T12:00:00Z`);
  const day = (((Math.floor((Date.now() - start) / 86400000)) % len) + len) % len + 1;
  const ov = len - 14;
  if (day <= 5) return "Someone on her period";
  if (day < ov - 1) return "Someone in her follicular week";
  if (day <= ov + 1) return "Someone in her ovulation week";
  return "Someone in her luteal week";
}

// Rejection reasons, first match wins: selling, instruction, broken, unsafe, off topic.
const SELLING_REASON = "Tips can't include links or anything for sale. Want to share what helped you instead?";
const INSTRUCTION_REASON = "Tips share what helped you, not what others should take. Want to rewrite it as what you tried?";
const BROKEN_REASON = "Some details had to come out, and now it doesn't quite read right. Want to rewrite it?";
const UNSAFE_REASON = "This one is better talked through with a doctor. Want to share something else that helped?";
const offTopicReason = (symptom: string) => `This doesn't seem to be about ${symptom}. Want to try again?`;
// Imperative advice about medicine, supplements or doses, e.g. "Take X", "Stop the pill".
const INSTRUCTION_RE = /^\s*(you should\s+|try\s+|just\s+)?(take|stop|start|quit|increase|decrease|double|skip|switch|change|come off|get off|use)\b/i;
const SELLING_RE = /(https?:\/\/|www\.|\.com\b|\.net\b|\.shop\b|\.co\b|\b(buy|shop|order|discount|promo code|coupon|use my code|for sale|dm me|link in bio)\b)/i;
const tooBroken = (s: string) => s.replace(/[^a-zA-Z\s]/g, " ").trim().split(/\s+/).filter((w) => w.length > 1).length < 4;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["decision", "kind", "cleaned_text", "reason"],
  properties: {
    decision: { type: "string", enum: ["approve", "review", "reject"] },
    kind: { type: "string", enum: ["ok", "selling", "instruction", "broken_after_cleaning", "unsafe", "off_topic", "other"] },
    cleaned_text: { type: "string" },
    reason: { type: ["string", "null"] },
  },
};

// Distinct real cycles (period starts) with a log of this symptom in the last 12 months.
async function ownCycles(service: any, userId: string, symptom: string): Promise<number> {
  const since = new Date(Date.now() - 365 * 86400000).toISOString();
  const { data: logs } = await service.from("symptom_logs").select("symptoms, logged_at").eq("user_id", userId).gte("logged_at", since);
  const { data: part } = await service.from("participants").select("id, last_period_start").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!part) return 0;
  const { data: hist } = await service.from("cycle_history").select("cycle_start_date").eq("participant_id", part.id);
  const anchors = [...(hist ?? []).map((h: any) => h.cycle_start_date), part.last_period_start].filter(Boolean).map((d: string) => Date.parse(`${d}T12:00:00Z`)).sort((a, b) => a - b);
  const { data: canon } = await service.rpc("together_canonical", { _name: symptom });
  const target = String(canon ?? symptom).toLowerCase();
  const seen = new Set<number>();
  for (const l of logs ?? []) {
    const arr = Array.isArray(l.symptoms) ? l.symptoms : [];
    let hit = false;
    for (const s of arr) { if (!s?.name) continue; const { data: c } = await service.rpc("together_canonical", { _name: s.name }); if (String(c ?? s.name).toLowerCase() === target) { hit = true; break; } }
    if (!hit) continue;
    const t = Date.parse(l.logged_at); let a = -1;
    for (const x of anchors) if (x <= t + 86400000) a = x;
    if (a >= 0) seen.add(a);
  }
  return seen.size;
}

async function moderate(symptom: string, text: string, checkFirst = false): Promise<{ decision: string; kind: string; cleaned_text: string; reason: string | null } | null> {
  const instructions = `You check short tips women share about what helped with a symptom ("${symptom}") in a women's health app. Return JSON.
Clean the tip: remove people's names, links, emails, phone numbers, social handles and any medicine dose (numbers with mg, ml, units, "x a day" for medicines). Keep her words otherwise; do not rewrite her voice. No em dashes.
Personal experience is allowed, including naming a supplement she tried ("Magnesium in the evening helped me").
decision "reject" with kind "selling" when the tip contains a link, a brand or shop being promoted, discount codes or anything for sale.
decision "reject" with kind "instruction" when the tip tells others to take, stop, start or change any medicine, supplement or dose ("Take magnesium", "Stop the pill").
decision "reject" with kind "broken_after_cleaning" when, after cleaning, the tip is broken, unclear, a fragment or very short.
decision "reject" with kind "unsafe" when the tip is harmful or dangerous advice, diagnoses a condition, or contains sexual or hateful content.
decision "reject" with kind "off_topic" when the tip is not about what helped with this symptom.
decision "reject" with kind "other" only when none of the above fit. Give a short kind reason addressed to her (one sentence, no blame).
decision "review" (kind "other") when unsure, or the tip names a specific prescription medicine.
${checkFirst ? `This symptom needs a doctor when new or sudden. Food, habits and comfort tips are fine. decision "reject" with kind "unsafe" when the tip promises to fix or cure it, or suggests she doesn't need a doctor.\n` : ""}decision "approve" with kind "ok" otherwise. reason null when approved.`;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Lovable-API-Key": Deno.env.get("LOVABLE_API_KEY") ?? "", "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra", instructions, input: text, stream: true, store: false, reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "tip_check", strict: true, schema: SCHEMA } },
    }),
  });
  if (!r.ok || !r.body) { console.error("[tip-submit] gateway", r.status); return null; }
  let out = ""; let buf = "";
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split("\n"); buf = lines.pop() ?? "";
    for (const l of lines) {
      if (!l.startsWith("data:")) continue;
      try { const ev = JSON.parse(l.slice(5).trim()); if (ev.type === "response.output_text.delta") out += ev.delta ?? ""; } catch { /* ignore */ }
    }
  }
  try { return JSON.parse(out); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ error: "unauthorized" }, 401);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await service.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);
    const raw = await req.json().catch(() => null);
    // Words (her own symptom words) share this one gate with tips; tips below are unchanged.
    if (raw && (raw.mode === "word" || raw.mode === "sync")) {
      const out = raw.mode === "word" ? await handleWord(service, user.id, raw) : await handleSync(service, user.id);
      return json(out.body, out.status);
    }
    const parsed = Body.safeParse(raw);
    if (!parsed.success) return json({ error: "invalid", details: parsed.error.flatten().fieldErrors }, 400);
    const { symptom, text, tipId } = parsed.data;

    // Rejected tips are kept only 30 days so she can edit and resend.
    await service.from("together_tips").delete().eq("status", "rejected").lt("created_at", new Date(Date.now() - 30 * 86400000).toISOString());

    const { data: prof } = await service.from("profiles").select("together_consent").eq("id", user.id).maybeSingle();
    if (!prof?.together_consent) return json({ error: "not_joined" }, 403);
    const checkFirst = CHECK_FIRST_RE.test(symptom);
    if (!checkFirst && SAFETY_RE.test(symptom)) return json({ status: "rejected", reason: SAFETY_REASON });
    if (checkFirst && (await ownCycles(service, user.id, symptom)) < 2) return json({ error: "needs_pattern" }, 403);

    const { data: p } = await service.from("participants").select("life_stage, last_period_start, cycle_length_days, due_date, pregnancy_lmp, postpartum_start_date").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: stageKey } = p ? await service.rpc("together_stage", { _life_stage: p.life_stage, _due: p.due_date, _lmp: p.pregnancy_lmp, _pp: p.postpartum_start_date }) : { data: null };

    const check = await moderate(symptom, text, checkFirst);
    const cleaned = dashes((check?.cleaned_text || text).trim()).slice(0, 160);
    let decision = check?.decision ?? "review";
    let kind = check?.kind ?? "other";
    // First applicable rejection wins: selling, instruction, broken, unsafe, off topic.
    if (SELLING_RE.test(text)) { decision = "reject"; kind = "selling"; }
    else if (INSTRUCTION_RE.test(text)) { decision = "reject"; kind = "instruction"; }
    else if (checkFirst && /\b(cure[sd]?|fix(es|ed)?|gets? rid of|no need (for|to see) a doctor|don'?t need a doctor|skip the doctor|instead of (a |the )?doctor|went away for good)\b/i.test(text)) { decision = "reject"; kind = "unsafe"; }
    else if (decision !== "reject" && check && tooBroken(cleaned)) { decision = "reject"; kind = "broken_after_cleaning"; }
    const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "pending";
    const reason = status !== "rejected" ? null
      : kind === "selling" ? SELLING_REASON
      : kind === "instruction" ? INSTRUCTION_REASON
      : kind === "broken_after_cleaning" ? BROKEN_REASON
      : kind === "unsafe" ? UNSAFE_REASON
      : kind === "off_topic" ? offTopicReason(symptom)
      : dashes(check?.reason || "This one can't be shared as it is. Try saying just what helped you.");
    const row = { author_id: user.id, symptom, text: status === "rejected" ? text : cleaned, original_text: text, label: labelFor(p), stage_key: stageKey ?? null, status, reject_reason: reason, report_count: 0, needs_review: false, created_at: new Date().toISOString() };

    let saved;
    if (tipId) {
      saved = await service.from("together_tips").update(row).eq("id", tipId).eq("author_id", user.id).eq("status", "rejected").select("id, status").maybeSingle();
    } else {
      saved = await service.from("together_tips").insert(row).select("id, status").single();
    }
    if (saved.error || !saved.data) { console.error("[tip-submit] save", saved.error?.message); return json({ error: "save_failed" }, 500); }
    return json({ id: saved.data.id, status: saved.data.status, reason, label: row.label });
  } catch (e) {
    console.error("[tip-submit]", (e as Error).message);
    return json({ error: "failed" }, 500);
  }
});
