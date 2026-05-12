// Sync Whoop data into Logan's tracker_logs
// Called manually after connect, by cron hourly, or by the user.
// Body: { user_id?: string, backfill_days?: number }
//   - user_id: sync just this user (used post-connect). Otherwise syncs all active.
//   - backfill_days: how far back to pull (default 2 for cron, 30 for initial)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const WHOOP_TOKEN = "https://api.prod.whoop.com/oauth/oauth2/token";
const WHOOP_API = "https://api.prod.whoop.com/developer/v1";

interface Integration {
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
}

async function ensureFreshToken(
  admin: ReturnType<typeof createClient>,
  integ: Integration,
): Promise<string> {
  const expiresAt = integ.expires_at ? Date.parse(integ.expires_at) : 0;
  if (expiresAt - 60_000 > Date.now()) return integ.access_token;
  if (!integ.refresh_token) throw new Error("No refresh token");

  const CLIENT_ID = Deno.env.get("WHOOP_CLIENT_ID")!;
  const CLIENT_SECRET = Deno.env.get("WHOOP_CLIENT_SECRET")!;
  const res = await fetch(WHOOP_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: integ.refresh_token,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "offline",
    }),
  });
  if (!res.ok) {
    await admin.from("user_integrations")
      .update({ status: "reauth_required" })
      .eq("user_id", integ.user_id).eq("provider", "whoop");
    throw new Error(`Refresh failed (${res.status})`);
  }
  const tok = await res.json();
  const newExpiry = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();
  await admin.from("user_integrations").update({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? integ.refresh_token,
    expires_at: newExpiry,
    status: "active",
  }).eq("user_id", integ.user_id).eq("provider", "whoop");
  return tok.access_token;
}

async function getOrCreateTracker(
  admin: ReturnType<typeof createClient>,
  userId: string,
  name: string,
  emoji: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("custom_trackers")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await admin
    .from("custom_trackers")
    .insert({ user_id: userId, name, emoji, description: "Auto-synced from Whoop" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function fetchAllPages(
  url: string,
  token: string,
  start: string,
  end: string,
): Promise<any[]> {
  const out: any[] = [];
  let nextToken: string | null = null;
  for (let i = 0; i < 20; i++) {
    const u = new URL(url);
    u.searchParams.set("start", start);
    u.searchParams.set("end", end);
    u.searchParams.set("limit", "25");
    if (nextToken) u.searchParams.set("nextToken", nextToken);
    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.error("Whoop fetch failed", url, res.status, await res.text());
      break;
    }
    const json = await res.json();
    out.push(...(json.records ?? []));
    nextToken = json.next_token ?? null;
    if (!nextToken) break;
  }
  return out;
}

function clamp1to5(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 3;
  const norm = (value - min) / (max - min);
  return Math.max(1, Math.min(5, Math.round(norm * 4) + 1));
}

async function syncOne(
  admin: ReturnType<typeof createClient>,
  integ: Integration & { provider_user_id: string | null },
  backfillDays: number,
) {
  const token = await ensureFreshToken(admin, integ);
  const end = new Date().toISOString();
  const start = new Date(Date.now() - backfillDays * 86400_000).toISOString();

  const [
    recoveryT, sleepScoreT, sleepHoursT, sleepEffT, hrvT, restingHrT,
    skinTempT, respRateT, spo2T, strainT, workoutsT,
  ] = await Promise.all([
    getOrCreateTracker(admin, integ.user_id, "Recovery", "🔋"),
    getOrCreateTracker(admin, integ.user_id, "Sleep score", "😴"),
    getOrCreateTracker(admin, integ.user_id, "Sleep hours", "🛌"),
    getOrCreateTracker(admin, integ.user_id, "Sleep efficiency", "💤"),
    getOrCreateTracker(admin, integ.user_id, "HRV", "💗"),
    getOrCreateTracker(admin, integ.user_id, "Resting HR", "❤️"),
    getOrCreateTracker(admin, integ.user_id, "Skin temperature", "🌡️"),
    getOrCreateTracker(admin, integ.user_id, "Respiratory rate", "🫁"),
    getOrCreateTracker(admin, integ.user_id, "SpO2", "🩸"),
    getOrCreateTracker(admin, integ.user_id, "Day strain", "⚡"),
    getOrCreateTracker(admin, integ.user_id, "Workouts", "🏋️"),
  ]);

  type LogRow = {
    user_id: string; tracker_id: string; intensity: number;
    logged_at: string; notes: string | null;
  };
  const rows: LogRow[] = [];

  // Recovery (HRV, resting HR, skin temp, SpO2)
  const recoveries = await fetchAllPages(`${WHOOP_API}/recovery`, token, start, end);
  for (const r of recoveries) {
    const score = r.score ?? {};
    const at = r.created_at ?? r.updated_at ?? new Date().toISOString();
    const cid = r.cycle_id ?? at;
    if (typeof score.recovery_score === "number") {
      rows.push({ user_id: integ.user_id, tracker_id: recoveryT,
        intensity: clamp1to5(score.recovery_score, 0, 100),
        logged_at: at, notes: `whoop:recovery:${cid}|raw=${score.recovery_score}` });
    }
    if (typeof score.hrv_rmssd_milli === "number") {
      rows.push({ user_id: integ.user_id, tracker_id: hrvT,
        intensity: clamp1to5(score.hrv_rmssd_milli, 20, 100),
        logged_at: at, notes: `whoop:hrv:${cid}|raw=${score.hrv_rmssd_milli}` });
    }
    if (typeof score.resting_heart_rate === "number") {
      rows.push({ user_id: integ.user_id, tracker_id: restingHrT,
        intensity: clamp1to5(80 - score.resting_heart_rate, 20, 60),
        logged_at: at, notes: `whoop:rhr:${cid}|raw=${score.resting_heart_rate}` });
    }
    if (typeof score.skin_temp_celsius === "number") {
      // scale around typical 33-35C; we keep raw for analyzer
      rows.push({ user_id: integ.user_id, tracker_id: skinTempT,
        intensity: clamp1to5(score.skin_temp_celsius, 32, 36),
        logged_at: at, notes: `whoop:skin_temp:${cid}|raw=${score.skin_temp_celsius}` });
    }
    if (typeof score.spo2_percentage === "number") {
      rows.push({ user_id: integ.user_id, tracker_id: spo2T,
        intensity: clamp1to5(score.spo2_percentage, 92, 100),
        logged_at: at, notes: `whoop:spo2:${cid}|raw=${score.spo2_percentage}` });
    }
  }

  // Sleep (score, hours, efficiency, respiratory rate)
  const sleeps = await fetchAllPages(`${WHOOP_API}/activity/sleep`, token, start, end);
  for (const s of sleeps) {
    const score = s.score ?? {};
    const at = s.end ?? s.start ?? new Date().toISOString();
    if (typeof score.sleep_performance_percentage === "number") {
      rows.push({ user_id: integ.user_id, tracker_id: sleepScoreT,
        intensity: clamp1to5(score.sleep_performance_percentage, 0, 100),
        logged_at: at, notes: `whoop:sleep_score:${s.id}|raw=${score.sleep_performance_percentage}` });
    }
    if (typeof score.sleep_efficiency_percentage === "number") {
      rows.push({ user_id: integ.user_id, tracker_id: sleepEffT,
        intensity: clamp1to5(score.sleep_efficiency_percentage, 70, 100),
        logged_at: at, notes: `whoop:sleep_eff:${s.id}|raw=${score.sleep_efficiency_percentage}` });
    }
    if (typeof score.respiratory_rate === "number") {
      rows.push({ user_id: integ.user_id, tracker_id: respRateT,
        intensity: clamp1to5(score.respiratory_rate, 12, 20),
        logged_at: at, notes: `whoop:resp_rate:${s.id}|raw=${score.respiratory_rate}` });
    }
    const stage = score.stage_summary ?? {};
    const totalMs = (stage.total_in_bed_time_milli ?? 0) - (stage.total_awake_time_milli ?? 0);
    if (totalMs > 0) {
      const hours = totalMs / 3_600_000;
      rows.push({ user_id: integ.user_id, tracker_id: sleepHoursT,
        intensity: clamp1to5(hours, 4, 9),
        logged_at: at, notes: `whoop:sleep_hours:${s.id}|raw=${hours.toFixed(2)}` });
    }
  }

  // Cycles (day strain, avg/max HR)
  const cycles = await fetchAllPages(`${WHOOP_API}/cycle`, token, start, end);
  for (const c of cycles) {
    const at = c.end ?? c.start ?? new Date().toISOString();
    const strain = c.score?.strain;
    if (typeof strain === "number") {
      rows.push({ user_id: integ.user_id, tracker_id: strainT,
        intensity: clamp1to5(strain, 0, 21),
        logged_at: at, notes: `whoop:day_strain:${c.id}|raw=${strain.toFixed(2)}` });
    }
  }

  // Workouts
  const workouts = await fetchAllPages(`${WHOOP_API}/activity/workout`, token, start, end);
  for (const w of workouts) {
    const at = w.end ?? w.start ?? new Date().toISOString();
    const strain = w.score?.strain;
    rows.push({ user_id: integ.user_id, tracker_id: workoutsT,
      intensity: typeof strain === "number" ? clamp1to5(strain, 0, 21) : 3,
      logged_at: at, notes: `whoop:workout:${w.id}${strain ? `|strain=${strain.toFixed(1)}` : ""}` });
  }

  // Dedupe against existing rows by notes prefix
  const tagPrefixes = Array.from(new Set(rows.map((r) => r.notes!.split("|")[0])));
  const existingTags = new Set<string>();
  for (let i = 0; i < tagPrefixes.length; i += 100) {
    const batch = tagPrefixes.slice(i, i + 100);
    const { data } = await admin
      .from("tracker_logs")
      .select("notes")
      .eq("user_id", integ.user_id)
      .or(batch.map((t) => `notes.like.${t}%`).join(","));
    for (const row of data ?? []) {
      if (row.notes) existingTags.add((row.notes as string).split("|")[0]);
    }
  }
  const fresh = rows.filter((r) => !existingTags.has(r.notes!.split("|")[0]));

  let inserted = 0;
  if (fresh.length > 0) {
    for (let i = 0; i < fresh.length; i += 200) {
      const batch = fresh.slice(i, i + 200);
      const { error } = await admin.from("tracker_logs").insert(batch);
      if (error) console.error("Insert tracker_logs failed", error);
      else inserted += batch.length;
    }
  }

  await admin.from("user_integrations")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", integ.user_id).eq("provider", "whoop");

  // Trigger cycle analyzer (fire and forget) — only when we got fresh data
  if (inserted > 0) {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    fetch(`${SUPABASE_URL}/functions/v1/analyze-whoop-cycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ user_id: integ.user_id }),
    }).catch((e) => console.error("Analyzer trigger failed", e));
  }

  return { user_id: integ.user_id, inserted, recoveries: recoveries.length, sleeps: sleeps.length, workouts: workouts.length, cycles: cycles.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let userId: string | null = null;
    let backfillDays = 2;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.user_id) userId = String(body.user_id);
        if (typeof body.backfill_days === "number") backfillDays = body.backfill_days;
      } catch (_) { /* no body */ }
    }

    let q = admin.from("user_integrations")
      .select("user_id, access_token, refresh_token, expires_at, provider_user_id")
      .eq("provider", "whoop")
      .eq("status", "active");
    if (userId) q = q.eq("user_id", userId);
    const { data: integs, error } = await q;
    if (error) throw error;

    const results = [];
    for (const integ of integs ?? []) {
      try {
        results.push(await syncOne(admin, integ as any, backfillDays));
      } catch (e) {
        console.error("Sync failed for", integ.user_id, e);
        results.push({ user_id: integ.user_id, error: e instanceof Error ? e.message : "unknown" });
      }
    }

    return new Response(JSON.stringify({ synced: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-whoop error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
