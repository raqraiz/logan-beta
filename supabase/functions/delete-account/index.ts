import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller identity from their JWT
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Require explicit confirmation token in body
    let body: any = {};
    try { body = await req.json(); } catch (_) {}
    if (body?.confirm !== "DELETE") {
      return new Response(
        JSON.stringify({ error: "Confirmation required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = caller.id;
    const userEmail = caller.email;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Block admins and super admins from self-deleting
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (isAdmin) {
      return new Response(
        JSON.stringify({ error: "Admin accounts can't be deleted this way. Contact Raquella directly." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up participant display name for the confirmation email
    let displayName: string | null = null;
    if (userEmail) {
      const { data: p } = await supabaseAdmin
        .from("participants")
        .select("full_name")
        .eq("email", userEmail)
        .maybeSingle();
      displayName = (p as any)?.full_name ?? null;
    }

    // Send deletion confirmation email BEFORE deleting the account,
    // so we still have the address and the queue can look it up.
    if (userEmail) {
      try {
        await supabaseAdmin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "account-deleted",
            recipientEmail: userEmail,
            idempotencyKey: `account-deleted-${userId}`,
            templateData: { name: displayName },
          },
        });
      } catch (e) {
        console.warn("account-deleted email invoke failed:", (e as any)?.message);
      }
    }

    // Delete user-owned rows (best-effort; ignore errors)
    const tablesByUserId = [
      "chat_messages",
      "notification_preferences",
      "user_roles",
      "tracker_logs",
      "symptom_logs",
      "custom_trackers",
      "home_widget_preferences",
      "user_credits",
      "credit_transactions",
      "user_integrations",
      "lab_markers",
      "lab_panels",
      "meals",
      "nutrition_goals",
      "user_dietary_prefs",
      "user_resources",
      "resource_feedback",
      "user_activity_events",
      "feature_events",
      "weight_logs",
      "user_feedback",
      "history_imports",
      "email_opens",
      "attribution_events",
    ];
    await Promise.all(
      tablesByUserId.map((t) =>
        supabaseAdmin.from(t as any).delete().eq("user_id", userId).then(
          ({ error }) => error && console.warn(`del ${t}:`, error.message)
        )
      )
    );

    // Delete linked participant + children (matched by email)
    if (userEmail) {
      const { data: participant } = await supabaseAdmin
        .from("participants")
        .select("id")
        .eq("email", userEmail)
        .maybeSingle();

      if (participant) {
        const pid = (participant as any).id;
        await supabaseAdmin.from("cycle_history").delete().eq("participant_id", pid);
        await supabaseAdmin.from("cycle_updates").delete().eq("participant_id", pid);
        await supabaseAdmin.from("feedback").delete().eq("participant_id", pid);
        await supabaseAdmin.from("insights").delete().eq("participant_id", pid);
        await supabaseAdmin.from("participants").delete().eq("id", pid);
      }
    }

    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    // Finally delete auth user
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      const msg = authError.message?.toLowerCase() ?? "";
      if (!msg.includes("not found") && !msg.includes("database error")) {
        return new Response(
          JSON.stringify({ error: "Failed to delete account: " + authError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Self-deleted account ${userId}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Delete account error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
