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
    const body = await req.json();
    const { email, action, participantData } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Action: register participant (web-based signup)
    if (action === "register") {
      if (!participantData) {
        return new Response(
          JSON.stringify({ error: "Missing participant data" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Registering participant:", participantData.full_name, participantData.email);

      // Check if email already exists
      const { data: existing } = await supabase
        .from("participants")
        .select("id, email")
        .eq("email", participantData.email)
        .single();

      if (existing) {
        console.log("Participant already exists:", existing.id);
        return new Response(
          JSON.stringify({ 
            success: true, 
            participantId: existing.id,
            alreadyExists: true,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert new participant
      const { data: participant, error } = await supabase
        .from("participants")
        .insert({
          full_name: participantData.full_name,
          email: participantData.email,
          whatsapp_number: participantData.email, // Using email as fallback for required field
          consent_given: participantData.consent_given || false,
          consent_given_at: participantData.consent_given_at || null,
          preferred_channel: "web",
          is_active: true,
        })
        .select("id")
        .single();

      if (error) {
        console.error("Insert error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to register participant", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Registered new participant:", participant.id);
      return new Response(
        JSON.stringify({ success: true, participantId: participant.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: lookup by email
    if (action === "lookup") {
      if (!email) {
        return new Response(
          JSON.stringify({ error: "Email is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Looking up participant with email:", email);

      const { data: participant, error } = await supabase
        .from("participants")
        .select("id, full_name, consent_given")
        .eq("email", email)
        .single();

      if (error || !participant) {
        console.log("No participant found for email:", email);
        return new Response(
          JSON.stringify({ found: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Found participant:", participant.id);
      return new Response(
        JSON.stringify({
          found: true,
          participantId: participant.id,
          firstName: participant.full_name.split(" ")[0],
          consentGiven: participant.consent_given,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Lookup error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});