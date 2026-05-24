// Analyzes recent Whoop biometrics to (a) cross-check cycle phase and
// (b) suggest optimizations. Posts an assistant chat message tagged
// metadata.source = "whoop_cycle_brief". Throttled to 1/day per user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function rawFromNotes(notes: string | null): number | null {
  if (!notes) return null;
  const m = notes.match(/raw=([\-\d.]+)/);
  return m ? Number(m[1]) : null;
}
const mean = (xs: number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : NaN;

type Phase = "menstrual" | "follicular" | "ovulation" | "luteal" | "unknown";

function expectedPhase(lastPeriod: string | null, cycleLen: number): { phase: Phase; day: number | null } {
  if (!lastPeriod) return { phase: "unknown", day: null };
  const start = new Date(lastPeriod + "T12:00:00Z").getTime();
  const day = Math.floor((Date.now() - start) / 86400_000) % cycleLen + 1;
  const ovDay = cycleLen - 14;
  let phase: Phase = "luteal";
  if (day <= 5) phase = "menstrual";
  else if (day < ovDay - 1) phase = "follicular";
  else if (day <= ovDay + 1) phase = "ovulation";
  return { phase, day };
}

async function callLovableAI(prompt: string): Promise<string | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are Logan, a grounded health coach for women. Respond in 2-4 short sentences. No bullets, no headers. Acknowledge what the data shows, then give one practical optimization for today." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) { console.error("AI failed", res.status, await res.text()); return null; }
    const j = await res.json();
    return j.choices?.[0]?.message?.content ?? null;
  } catch (e) { console.error("AI error", e); return null; }
}

async function analyzeUser(admin: ReturnType<typeof createClient>, userId: string) {
  // Throttle: skip if a brief was posted in last 20h
  const since = new Date(Date.now() - 20 * 3600_000).toISOString();
  const { data: recentBrief } = await admin
    .from("chat_messages")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", since)
    .contains("metadata", { source: "whoop_cycle_brief" })
    .limit(1);
  if (recentBrief && recentBrief.length > 0) return { skipped: "throttled" };

  // Pull participant context
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;
  const { data: participant } = await admin
    .from("participants")
    .select("last_period_start, cycle_length_days, life_stage, full_name")
    .eq("email", email ?? "")
    .maybeSingle();
  if (!participant || participant.life_stage !== "cycling") return { skipped: "not_cycling" };

  const { phase: expected, day } = expectedPhase(
    participant.last_period_start, participant.cycle_length_days ?? 28,
  );

  // Pull last 35 days of Whoop trackers
  const since35 = new Date(Date.now() - 35 * 86400_000).toISOString();
  const { data: trackers } = await admin
    .from("custom_trackers")
    .select("id, name")
    .eq("user_id", userId)
    .in("name", ["HRV", "Resting HR", "Skin temperature", "Respiratory rate", "Sleep score", "Recovery"]);
  const byName = new Map((trackers ?? []).map((t: any) => [t.name, t.id]));

  const ids = Array.from(byName.values());
  if (ids.length === 0) return { skipped: "no_trackers" };
  const { data: logs } = await admin
    .from("tracker_logs")
    .select("tracker_id, logged_at, notes")
    .eq("user_id", userId)
    .in("tracker_id", ids)
    .gte("logged_at", since35)
    .order("logged_at", { ascending: false });

  // bucket by tracker name
  const bucket: Record<string, { recent: number[]; baseline: number[] }> = {};
  const recentCutoff = Date.now() - 5 * 86400_000;
  for (const [name, id] of byName.entries()) {
    bucket[name as string] = { recent: [], baseline: [] };
    for (const l of (logs ?? []).filter((x: any) => x.tracker_id === id)) {
      const v = rawFromNotes(l.notes as string);
      if (v == null) continue;
      const t = new Date(l.logged_at as string).getTime();
      if (t >= recentCutoff) bucket[name as string].recent.push(v);
      else bucket[name as string].baseline.push(v);
    }
  }

  // Build signal summary
  const signals: string[] = [];
  const skin = bucket["Skin temperature"];
  if (skin?.recent.length && skin.baseline.length) {
    const d = mean(skin.recent) - mean(skin.baseline);
    if (Math.abs(d) >= 0.15) signals.push(`Skin temp ${d > 0 ? "+" : ""}${d.toFixed(2)}°C vs baseline`);
  }
  const hrv = bucket["HRV"];
  if (hrv?.recent.length && hrv.baseline.length) {
    const d = mean(hrv.recent) - mean(hrv.baseline);
    const pct = (d / mean(hrv.baseline)) * 100;
    if (Math.abs(pct) >= 8) signals.push(`HRV ${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`);
  }
  const rhr = bucket["Resting HR"];
  if (rhr?.recent.length && rhr.baseline.length) {
    const d = mean(rhr.recent) - mean(rhr.baseline);
    if (Math.abs(d) >= 2) signals.push(`Resting HR ${d > 0 ? "+" : ""}${d.toFixed(1)} bpm`);
  }
  const resp = bucket["Respiratory rate"];
  if (resp?.recent.length && resp.baseline.length) {
    const d = mean(resp.recent) - mean(resp.baseline);
    if (Math.abs(d) >= 0.4) signals.push(`Respiratory rate ${d > 0 ? "+" : ""}${d.toFixed(1)} bpm`);
  }
  const sleep = bucket["Sleep score"];
  if (sleep?.recent.length && sleep.baseline.length) {
    const d = mean(sleep.recent) - mean(sleep.baseline);
    if (Math.abs(d) >= 5) signals.push(`Sleep score ${d > 0 ? "+" : ""}${d.toFixed(0)}%`);
  }
  const rec = bucket["Recovery"];
  if (rec?.recent.length && rec.baseline.length) {
    const d = mean(rec.recent) - mean(rec.baseline);
    if (Math.abs(d) >= 5) signals.push(`Recovery ${d > 0 ? "+" : ""}${d.toFixed(0)}%`);
  }

  if (signals.length === 0) return { skipped: "no_signal" };

  // Phase cross-check: skin temp ↑ + HRV ↓ + RHR ↑ → luteal pattern
  const skinUp = skin && skin.recent.length && skin.baseline.length && (mean(skin.recent) - mean(skin.baseline)) >= 0.15;
  const hrvDown = hrv && hrv.recent.length && hrv.baseline.length && (mean(hrv.recent) - mean(hrv.baseline)) < 0;
  const rhrUp = rhr && rhr.recent.length && rhr.baseline.length && (mean(rhr.recent) - mean(rhr.baseline)) > 1;
  let inferred: Phase = "unknown";
  if (skinUp && (hrvDown || rhrUp)) inferred = "luteal";
  else if (!skinUp && hrv && hrv.recent.length && hrv.baseline.length && (mean(hrv.recent) > mean(hrv.baseline))) inferred = "follicular";

  const agreement = inferred !== "unknown" && expected !== "unknown"
    ? (inferred === expected ? "matches" : "differs from")
    : null;

  const prompt = [
    `Whoop biometric signals from the last 5 days vs prior 30: ${signals.join("; ")}.`,
    expected !== "unknown" ? `Calendar says she's around day ${day} (${expected} phase).` : "",
    inferred !== "unknown" ? `Biometric pattern looks ${inferred}, which ${agreement} the calendar.` : "",
    `Tell her in 2-4 sentences: what her body is showing, whether biometrics agree with her tracked phase, and one thing to do today to optimize (training intensity, sleep, food, or recovery — pick whichever the data points to).`,
  ].filter(Boolean).join(" ");

  const aiText = await callLovableAI(prompt);
  if (!aiText) return { skipped: "ai_empty" };

  await admin.from("chat_messages").insert({
    user_id: userId,
    role: "assistant",
    content: aiText,
    message_type: "text",
    metadata: {
      source: "whoop_cycle_brief",
      expected_phase: expected,
      expected_day: day,
      inferred_phase: inferred,
      signals,
    },
  });
  return { posted: true, expected, inferred, signals };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (authHeader !== `Bearer ${SERVICE_KEY}`) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const userId = body?.user_id;
    if (!userId) return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    const result = await analyzeUser(admin, String(userId));
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-whoop-cycle error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
