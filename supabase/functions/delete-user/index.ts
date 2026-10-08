import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deleteAccountData } from "../_shared/accountDeletion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get the authorization header to verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("delete-user: no Authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized: missing token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use admin client to validate JWT directly (works regardless of key system)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    const caller = userData?.user;
    if (userErr || !caller) {
      console.error("delete-user: getUser failed", userErr?.message);
      return new Response(JSON.stringify({ error: "Unauthorized: invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if caller is a super_admin by querying user_roles directly with service role
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Super admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Get user to delete from request
    const { userId } = await req.json();
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent admin from deleting themselves
    if (userId === caller.id) {
      return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // supabaseAdmin already created above for auth validation

    // Never delete staff accounts from here.
    const { data: targetRoles, error: targetRolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (targetRolesErr) {
      console.error("delete-user: role lookup failed", targetRolesErr.message);
      return new Response(JSON.stringify({ error: "Could not check this account's role. Nothing was deleted." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if ((targetRoles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "super_admin")) {
      return new Response(JSON.stringify({ error: "Admin accounts can't be deleted here. Remove the admin role first." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    // One shared list of tables, so this and delete-account can never drift apart.
    const result = await deleteAccountData(supabaseAdmin, userId, profile?.email ?? null);
    if (!result.ok) {
      console.error(`delete-user: failed at "${result.stage}" for ${userId}:`, result.failures.join("; "));
      return new Response(
        JSON.stringify({
          error: `Delete did not finish (${result.stage}). Some of her data may already be removed. Try again, or check the details.`,
          stage: result.stage,
          failures: result.failures,
          leftover: result.leftover,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`User ${userId} fully deleted by admin ${caller.id}`);

    return new Response(JSON.stringify({ success: true, unlinkedParticipants: result.unlinkedParticipants }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Delete user error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
