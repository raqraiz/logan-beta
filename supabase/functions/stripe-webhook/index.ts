import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET is not configured");
      return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    if (!sig) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const event: Stripe.Event = stripe.webhooks.constructEvent(body, sig, webhookSecret);

    console.log("Stripe webhook event:", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id || session.client_reference_id;
      const credits = parseInt(session.metadata?.credits || "0");
      const type = session.metadata?.type || "one_time";

      if (userId && credits > 0) {
        // Get or create credits record
        const { data: existing } = await supabase
          .from("user_credits")
          .select("paid_credits")
          .eq("user_id", userId)
          .single();

        if (existing) {
          await supabase
            .from("user_credits")
            .update({ paid_credits: existing.paid_credits + credits })
            .eq("user_id", userId);
        } else {
          await supabase
            .from("user_credits")
            .insert({ user_id: userId, paid_credits: credits, free_credits: 5 });
        }

        await supabase.from("credit_transactions").insert({
          user_id: userId,
          amount: credits,
          type: type === "subscription" ? "subscription" : "purchase",
          description: `${credits} credits — ${type === "subscription" ? "monthly subscription" : "credit pack purchase"}`,
        });

        console.log(`Added ${credits} credits for user ${userId}`);
      }
    }

    // Handle subscription renewal
    if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      // Only handle subscription renewals, not the first payment
      if (invoice.billing_reason === "subscription_cycle") {
        const customerId = invoice.customer as string;
        
        // Find user by Stripe customer email
        const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
        if (customer.email) {
          // Look up the Supabase user by email
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", customer.email)
            .limit(1);

          if (profiles && profiles.length > 0) {
            const userId = profiles[0].id;
            
            const { data: existing } = await supabase
              .from("user_credits")
              .select("paid_credits")
              .eq("user_id", userId)
              .single();

            const newCredits = 100;
            if (existing) {
              await supabase
                .from("user_credits")
                .update({ paid_credits: existing.paid_credits + newCredits })
                .eq("user_id", userId);
            }

            await supabase.from("credit_transactions").insert({
              user_id: userId,
              amount: newCredits,
              type: "subscription",
              description: "Monthly subscription renewal — 100 credits",
            });

            console.log(`Renewed ${newCredits} credits for user ${userId}`);
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
