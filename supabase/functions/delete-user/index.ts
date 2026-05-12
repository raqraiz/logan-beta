import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create client with user's token to verify they're admin
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if caller is admin
    const { data: isAdmin } = await supabaseUser.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
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

    // Create admin client to delete user
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Look up user's email to find linked participant
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .single();

    const userEmail = profile?.email;

    // Delete chat messages first
    const { error: messagesError } = await supabaseAdmin
      .from("chat_messages")
      .delete()
      .eq("user_id", userId);

    if (messagesError) {
      console.error("Error deleting messages:", messagesError);
    }

    // Delete notification preferences
    const { error: notifError } = await supabaseAdmin
      .from("notification_preferences")
      .delete()
      .eq("user_id", userId);

    if (notifError) {
      console.error("Error deleting notification preferences:", notifError);
    }

    // Delete linked participant and related data (matched by email)
    if (userEmail) {
      const { data: participant } = await supabaseAdmin
        .from("participants")
        .select("id")
        .eq("email", userEmail)
        .single();

      if (participant) {
        // Delete cycle history, cycle updates, feedback, insights for this participant
        await supabaseAdmin.from("cycle_history").delete().eq("participant_id", participant.id);
        await supabaseAdmin.from("cycle_updates").delete().eq("participant_id", participant.id);
        await supabaseAdmin.from("feedback").delete().eq("participant_id", participant.id);
        await supabaseAdmin.from("insights").delete().eq("participant_id", participant.id);
        await supabaseAdmin.from("participants").delete().eq("id", participant.id);
        console.log(`Deleted participant ${participant.id} for email ${userEmail}`);
      }
    }

    // Delete profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileError) {
      console.error("Error deleting profile:", profileError);
    }

    // Delete user roles
    const { error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);

    if (rolesError) {
      console.error("Error deleting roles:", rolesError);
    }

    // Delete auth user
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authError) {
      console.error("Error deleting auth user:", authError);
      // If user doesn't exist in auth or there's a database error (user already gone), treat as success
      const errorMsg = authError.message?.toLowerCase() || "";
      if (errorMsg.includes("not found") || errorMsg.includes("user not found") || errorMsg.includes("database error")) {
        console.log(`User ${userId} - auth deletion failed but treating as deleted (error: ${authError.message})`);
      } else {
        return new Response(
          JSON.stringify({ error: "Failed to delete user: " + authError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    console.log(`User ${userId} fully deleted by admin ${caller.id}`);

    return new Response(JSON.stringify({ success: true }), {
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
