// One-off: writes the cleaned copy for feedback sent before the consent question existed. Super admin only.
// mode "count" changes nothing and returns how many rows still need a cleaned copy.
// mode "run" cleans one small batch. health_consent, consent_copy_version and consent_at are never touched
// (they stay null, meaning "sent before the question"). A row whose check fails is left alone and shows to admins as [health detail].
// Logs never contain feedback text.
import { createClient } from "npm:@supabase/supabase-js@2";
import { cleanFeedback } from "../_shared/feedbackClean.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BATCH = 12;
const PARALLEL = 4;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: role } = await service.from("user_roles").select("role").eq("user_id", user.id).eq("role", "super_admin").maybeSingle();
  if (!role) return json({ error: "forbidden" }, 403);

  let mode = "count";
  try { mode = (await req.json())?.mode === "run" ? "run" : "count"; } catch { /* count */ }

  const remaining = async () => {
    const { count } = await service.from("user_feedback").select("id", { count: "exact", head: true }).is("message_clean", null);
    return count ?? 0;
  };
  if (mode === "count") return json({ waiting: await remaining() });

  const { data: rows, error } = await service.rpc("_feedback_needing_clean", { _limit: BATCH });
  if (error) { console.error("[backfill-feedback-clean] read failed", error.code ?? "unknown"); return json({ error: "read_failed" }, 500); }
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  let cleaned = 0, failed = 0;
  const list = (rows ?? []) as { id: string; message: string }[];
  for (let i = 0; i < list.length; i += PARALLEL) {
    await Promise.all(list.slice(i, i + PARALLEL).map(async (r) => {
      const res = await cleanFeedback(r.message, apiKey);
      if (!res.ok) { failed++; return; }
      const { error: upErr } = await service.from("user_feedback")
        .update({ message_clean: res.clean, health_detected: res.healthDetected })
        .eq("id", r.id).is("message_clean", null);
      if (upErr) failed++; else cleaned++;
    }));
  }
  return json({ cleaned, failed, waiting: await remaining() });
});
