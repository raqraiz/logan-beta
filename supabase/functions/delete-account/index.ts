import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAppEmail } from "../_shared/send-app-email.ts";
import { deleteAccountData } from "../_shared/accountDeletion.ts";


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
    {
      const { data: p } = await supabaseAdmin
        .from("participants")
        .select("full_name")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      displayName = (p as any)?.full_name ?? null;
    }

    // Send deletion confirmation email BEFORE deleting the account,
    // so we still have the address and the queue can look it up.
    if (userEmail) {
      try {
        await sendAppEmail("account-deleted", userEmail, {
          templateData: { name: displayName },
          idempotencyKey: `account-deleted-${userId}`,
        });
      } catch (e) {
        console.warn("account-deleted email send failed:", (e as any)?.message);
      }
    }


    // One shared list of tables, so this and delete-user can never drift apart.
    const result = await deleteAccountData(supabaseAdmin, userId, userEmail ?? null);
    if (!result.ok) {
      console.error(`Self-delete failed at "${result.stage}":`, result.failures.join("; "), JSON.stringify(result.leftover));
      return new Response(
        JSON.stringify({ error: "We couldn't finish deleting your account. Please contact us so we can complete it.", stage: result.stage }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
