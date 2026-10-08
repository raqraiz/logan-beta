// Saves one piece of in-app feedback. The woman is taken from her login token, never from the request body.
// The text is checked for health details first; if the check fails, it is saved hidden. Feedback is always saved.
// Logs never contain feedback text.
import { createClient } from "npm:@supabase/supabase-js@2";
import { COPY_VERSION, cleanFeedback, type Theme } from "../_shared/feedbackClean.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CATEGORIES = ["bug", "feature", "general", "content"];
const THEME_FROM_CATEGORY: Record<string, Theme> = { bug: "bug", feature: "feature", content: "content", general: "other" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user }, error: authError } = await service.auth.getUser(token);
  if (authError || !user) return json({ error: "unauthorized" }, 401);

  let body: { message?: unknown; category?: unknown };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 2000) return json({ error: "bad_request" }, 400);
  const category = typeof body.category === "string" && CATEGORIES.includes(body.category) ? body.category : "general";

  const result = await cleanFeedback(message, Deno.env.get("LOVABLE_API_KEY"));
  const row = {
    user_id: user.id, // always from the token
    category,
    message,
    message_clean: result.clean,
    health_detected: result.healthDetected,
    // Hidden until she says yes. Saying nothing keeps it hidden. null only when there is nothing to ask about.
    health_consent: result.healthDetected ? false : null,
    consent_copy_version: COPY_VERSION,
    theme: result.theme ?? THEME_FROM_CATEGORY[category],
    channel: "in_app",
    topic: result.topic, // from the cleaned text only; null when it failed
  };
  let { data, error } = await service.from("user_feedback").insert(row).select("id").single();
  if (error) {
    // Her feedback comes first: if the save failed (for example before the topic column exists), try once more without the topic.
    const { topic: _topic, ...withoutTopic } = row;
    ({ data, error } = await service.from("user_feedback").insert(withoutTopic).select("id").single());
  }
  if (error || !data) { console.error("[submit-feedback] save failed", error?.code ?? "unknown"); return json({ error: "save_failed" }, 500); }
  return json({ id: data.id, health_detected: result.healthDetected });
});
