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

    const { code } = await req.json();
    if (!code || typeof code !== "string") throw new Error("Code is required");

    const normalizedCode = code.trim().toUpperCase();

    // Find the promo code
    const { data: promo, error: promoError } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", normalizedCode)
      .eq("is_active", true)
      .single();

    if (promoError || !promo) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired promo code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (promo.uses_remaining <= 0) {
      return new Response(
        JSON.stringify({ error: "This code has been fully redeemed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already redeemed this code
    const { data: existingRedemption } = await supabase
      .from("promo_redemptions")
      .select("id")
      .eq("user_id", user.id)
      .eq("promo_code_id", promo.id)
      .maybeSingle();

    if (existingRedemption) {
      return new Response(
        JSON.stringify({ error: "You've already redeemed this code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Atomic decrement — returns the row only if a use was successfully claimed.
    const { data: claimed, error: claimErr } = await supabase
      .rpc("redeem_promo_code_atomic", { _promo_id: promo.id });

    if (claimErr || !claimed) {
      return new Response(
        JSON.stringify({ error: "This code has been fully redeemed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add credits + record redemption
    const { data: credits } = await supabase
      .from("user_credits")
      .select("paid_credits")
      .eq("user_id", user.id)
      .maybeSingle();

    if (credits) {
      await supabase
        .from("user_credits")
        .update({ paid_credits: credits.paid_credits + promo.credits_per_use })
        .eq("user_id", user.id);
    } else {
      await supabase
        .from("user_credits")
        .insert({ user_id: user.id, paid_credits: promo.credits_per_use, free_credits: 5 });
    }

    await supabase.from("promo_redemptions").insert({
      user_id: user.id,
      promo_code_id: promo.id,
    });

    await supabase.from("credit_transactions").insert({
      user_id: user.id,
      amount: promo.credits_per_use,
      type: "promo",
      description: `Promo code ${normalizedCode} — ${promo.credits_per_use} credits`,
    });

    // Get updated balance
    const { data: updated } = await supabase
      .from("user_credits")
      .select("free_credits, paid_credits")
      .eq("user_id", user.id)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        creditsAdded: promo.credits_per_use,
        totalCredits: updated ? updated.free_credits + updated.paid_credits : promo.credits_per_use,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("redeem-promo error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
