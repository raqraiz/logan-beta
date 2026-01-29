import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Verify the requesting user is an admin
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
    
    if (claimsError || !claims?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestingUserId = claims.claims.sub;

    // Use service role to check admin status and perform operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check if requesting user is an admin
    const { data: isAdmin } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", requestingUserId)
      .eq("role", "admin")
      .single();

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Only admins can add other admins" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find user by email using admin API
    const { data: users, error: userError } = await adminClient.auth.admin.listUsers();
    
    if (userError) {
      console.error("Error listing users:", userError);
      return new Response(
        JSON.stringify({ error: "Failed to search users" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetUser = users.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!targetUser) {
      return new Response(
        JSON.stringify({ error: "No user found with that email. They must sign up first." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already an admin
    const { data: existingRole } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", targetUser.id)
      .eq("role", "admin")
      .single();

    if (existingRole) {
      return new Response(
        JSON.stringify({ error: "This user is already an admin" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add admin role
    const { error: insertError } = await adminClient
      .from("user_roles")
      .insert({
        user_id: targetUser.id,
        role: "admin",
      });

    if (insertError) {
      console.error("Error inserting role:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to add admin role" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Admin role added for user ${targetUser.email}`);

    return new Response(
      JSON.stringify({ success: true, userId: targetUser.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Add admin error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
