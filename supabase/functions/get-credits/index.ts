import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user) throw new Error("Not authenticated");

    // Get or create credits
    let { data: credits } = await supabase
      .from("user_credits")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!credits) {
      const { data: newCredits } = await supabase
        .from("user_credits")
        .insert({ user_id: user.id, free_credits: 5, paid_credits: 0 })
        .select()
        .single();
      credits = newCredits;
    }

    if (!credits) {
      return new Response(
        JSON.stringify({ free: 5, paid: 0, total: 5 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if free credits should reset
    const resetAt = new Date(credits.free_credits_reset_at);
    const now = new Date();
    const hoursSinceReset = (now.getTime() - resetAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceReset >= 24) {
      await supabase
        .from("user_credits")
        .update({ free_credits: 5, free_credits_reset_at: now.toISOString() })
        .eq("user_id", user.id);
      credits.free_credits = 5;
    }

    // Calculate hours until reset
    const hoursUntilReset = Math.max(0, 24 - hoursSinceReset);

    return new Response(
      JSON.stringify({
        free: credits.free_credits,
        paid: credits.paid_credits,
        total: credits.free_credits + credits.paid_credits,
        hoursUntilReset: Math.ceil(hoursUntilReset),
        bonusAwarded: credits.bonus_credits_awarded,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("get-credits error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
