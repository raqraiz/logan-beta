// Send a broadcast message to a segmented set of users by inserting an
// assistant message into each recipient's chat_messages table.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SegmentFilters {
  life_stage?: string[]; // cycling | postpartum | menopause
  activity?: "today" | "week" | "month" | "dormant" | null;
  most_active?: number | null; // top N
  cycle_phase?: string[]; // menstrual | follicular | ovulation | luteal
  timezone?: string[]; // exact timezone strings
  credits?: "out" | "free_only" | "paid" | null;
  participant_ids?: string[]; // specific participants (overrides other filters)
}

interface BroadcastPayload {
  action: "preview" | "send";
  broadcast_id?: string; // if sending an existing draft
  title?: string;
  content: string;
  filters: SegmentFilters;
}

// Compute current cycle phase from last_period_start + cycle_length.
// Mirrors the rule: 14-day fixed luteal, ovulation = day cycle_len-14.
function currentPhase(
  lastPeriod: string | null,
  cycleLen: number | null,
): string | null {
  if (!lastPeriod || !cycleLen) return null;
  const start = new Date(lastPeriod + "T12:00:00Z");
  const today = new Date();
  const day = Math.floor((today.getTime() - start.getTime()) / 86400000) % cycleLen;
  const cycleDay = day < 0 ? day + cycleLen : day;
  if (cycleDay < 5) return "menstrual";
  const ovDay = cycleLen - 14;
  if (cycleDay < ovDay - 1) return "follicular";
  if (cycleDay <= ovDay + 1) return "ovulation";
  return "luteal";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as BroadcastPayload;
    const filters = body.filters || {};

    // 1. Pull candidate participants (joined to profiles for user_id)
    let q = admin
      .from("participants")
      .select("id, email, life_stage, last_period_start, cycle_length_days, timezone")
      .eq("is_active", true);

    const hasSpecific = filters.participant_ids && filters.participant_ids.length > 0;
    if (hasSpecific) {
      q = q.in("id", filters.participant_ids!);
    } else {
      if (filters.life_stage && filters.life_stage.length > 0) {
        q = q.in("life_stage", filters.life_stage);
      }
      if (filters.timezone && filters.timezone.length > 0) {
        q = q.in("timezone", filters.timezone);
      }
    }

    const { data: participants, error: pErr } = await q;
    if (pErr) throw pErr;

    // Map participants → profile user_ids (chat_messages are keyed by auth user.id)
    const emails = (participants ?? []).map((p) => p.email).filter(Boolean) as string[];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email")
      .in("email", emails);

    const profileByEmail = new Map((profiles ?? []).map((p) => [p.email, p.id]));

    let candidates = (participants ?? [])
      .map((p) => ({
        ...p,
        user_id: profileByEmail.get(p.email!) ?? null,
      }))
      .filter((p) => p.user_id);

    // Cycle-phase filter (in-memory)
    if (filters.cycle_phase && filters.cycle_phase.length > 0) {
      candidates = candidates.filter((p) => {
        const phase = currentPhase(p.last_period_start, p.cycle_length_days);
        return phase && filters.cycle_phase!.includes(phase);
      });
    }

    // Activity filter
    if (filters.activity) {
      const now = Date.now();
      const windows: Record<string, number> = {
        today: 86400000,
        week: 7 * 86400000,
        month: 30 * 86400000,
      };
      const userIds = candidates.map((c) => c.user_id!);
      if (filters.activity === "dormant") {
        const cutoff = new Date(now - 30 * 86400000).toISOString();
        const { data: recent } = await admin
          .from("chat_messages")
          .select("user_id")
          .in("user_id", userIds)
          .gte("created_at", cutoff);
        const activeIds = new Set((recent ?? []).map((r) => r.user_id));
        candidates = candidates.filter((c) => !activeIds.has(c.user_id!));
      } else {
        const ms = windows[filters.activity];
        const cutoff = new Date(now - ms).toISOString();
        const { data: recent } = await admin
          .from("chat_messages")
          .select("user_id")
          .in("user_id", userIds)
          .gte("created_at", cutoff);
        const activeIds = new Set((recent ?? []).map((r) => r.user_id));
        candidates = candidates.filter((c) => activeIds.has(c.user_id!));
      }
    }

    // Most active (top N by message count last 30 days)
    if (filters.most_active && filters.most_active > 0) {
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      const userIds = candidates.map((c) => c.user_id!);
      const { data: recent } = await admin
        .from("chat_messages")
        .select("user_id")
        .in("user_id", userIds)
        .gte("created_at", cutoff);
      const counts = new Map<string, number>();
      (recent ?? []).forEach((r) => {
        counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
      });
      const topIds = new Set(
        [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, filters.most_active)
          .map(([id]) => id),
      );
      candidates = candidates.filter((c) => topIds.has(c.user_id!));
    }

    // Credits filter
    if (filters.credits) {
      const userIds = candidates.map((c) => c.user_id!);
      const { data: credits } = await admin
        .from("user_credits")
        .select("user_id, free_credits, paid_credits")
        .in("user_id", userIds);
      const creditMap = new Map(
        (credits ?? []).map((c) => [c.user_id, c]),
      );
      candidates = candidates.filter((c) => {
        const cr = creditMap.get(c.user_id!);
        if (!cr) return filters.credits === "out";
        const total = (cr.free_credits ?? 0) + (cr.paid_credits ?? 0);
        if (filters.credits === "out") return total <= 0;
        if (filters.credits === "paid") return (cr.paid_credits ?? 0) > 0;
        if (filters.credits === "free_only") return (cr.paid_credits ?? 0) === 0;
        return true;
      });
    }

    const recipientCount = candidates.length;

    // PREVIEW — just return the count
    if (body.action === "preview") {
      return new Response(
        JSON.stringify({ count: recipientCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // SEND — insert assistant messages in batches
    if (recipientCount === 0) {
      return new Response(
        JSON.stringify({ count: 0, message: "No recipients matched" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const rows = candidates.map((c) => ({
      user_id: c.user_id!,
      role: "assistant",
      content: body.content,
      message_type: "broadcast",
      metadata: {
        broadcast: true,
        broadcast_title: body.title ?? null,
        broadcast_id: body.broadcast_id ?? null,
      },
    }));

    // Chunk inserts to stay under request size limits
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error: insErr } = await admin.from("chat_messages").insert(chunk);
      if (insErr) throw insErr;
    }

    // Persist broadcast record
    if (body.broadcast_id) {
      await admin
        .from("admin_broadcasts")
        .update({
          status: "sent",
          recipient_count: recipientCount,
          sent_at: new Date().toISOString(),
          content: body.content,
          title: body.title ?? null,
          segment_filters: filters as any,
        })
        .eq("id", body.broadcast_id);
    } else {
      await admin.from("admin_broadcasts").insert({
        created_by: user.id,
        title: body.title ?? null,
        content: body.content,
        segment_filters: filters as any,
        status: "sent",
        recipient_count: recipientCount,
        sent_at: new Date().toISOString(),
      });
    }

    return new Response(
      JSON.stringify({ count: recipientCount, success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("send-broadcast error:", e);
    return new Response(JSON.stringify({ error: e.message ?? "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
