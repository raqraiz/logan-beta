// Saves a short second-person note when she taps "That's right" on an insight.
// The full insight text is never stored; one note per insight.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { extractConfirmedPattern } from "../_shared/memoryNotes.ts";
import { logMessageFailure } from "../_shared/messageFailures.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({ message_id: z.string().uuid() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let userId: string | null = null;
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: { user } } = await service.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);
    userId = user.id;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "invalid body" }, 400);
    const messageId = parsed.data.message_id;

    const { data: existing } = await service.from("user_memory_notes").select("id")
      .eq("user_id", user.id).eq("source", "insight_confirmed").eq("source_message_id", messageId).maybeSingle();
    if (existing) return json({ saved: true, duplicate: true });

    const { data: msg } = await service.from("chat_messages").select("content")
      .eq("id", messageId).eq("user_id", user.id).eq("role", "assistant").maybeSingle();
    if (!msg) throw new Error("insight not found");

    const note = await extractConfirmedPattern(msg.content, Deno.env.get("LOVABLE_API_KEY") ?? "");
    if (!note) throw new Error("could not summarise insight");

    const { error } = await service.from("user_memory_notes").insert({
      user_id: user.id, note, source: "insight_confirmed", source_message_id: messageId, active: true,
    });
    if (error && error.code !== "23505") throw error;
    return json({ saved: true });
  } catch (e) {
    await logMessageFailure(service, userId, "insight_confirmed_note", "confirm-insight-memory", e);
    return json({ saved: false });
  }
});
