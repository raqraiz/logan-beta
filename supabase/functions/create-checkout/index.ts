import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Credit pack and subscription price IDs
const PRICES: Record<string, { priceId: string; credits: number; isSubscription: boolean }> = {
  monthly_250: { priceId: "price_1T9BCaGhXycJLrIN0gWfjvTd", credits: 250, isSubscription: true },
  monthly_600: { priceId: "price_1T9BCxGhXycJLrIN1LLYDEZd", credits: 600, isSubscription: true },
  booster_50: { priceId: "price_1T9BDIGhXycJLrINRif07PLy", credits: 50, isSubscription: false },
  booster_150: { priceId: "price_1T9BFRGhXycJLrINRSaJgpJU", credits: 150, isSubscription: false },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");


    const { priceKey } = await req.json();
    const price = PRICES[priceKey];
    if (!price) throw new Error("Invalid price key");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      client_reference_id: user.id,
      line_items: [{ price: price.priceId, quantity: 1 }],
      mode: price.isSubscription ? "subscription" : "payment",
      success_url: `https://asklogan.ai/?purchase=success&credits=${price.credits}`,
      cancel_url: `https://asklogan.ai/`,
      metadata: {
        user_id: user.id,
        credits: String(price.credits),
        type: price.isSubscription ? "subscription" : "one_time",
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
