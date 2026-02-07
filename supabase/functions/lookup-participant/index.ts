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
    const { phone, action, participantId, chatId, participantData } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Action: register participant
    if (action === "register") {
      if (!participantData) {
        return new Response(
          JSON.stringify({ error: "Missing participant data" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Registering participant:", participantData.full_name);

      // Check if phone already exists
      const normalizedPhone = participantData.whatsapp_number.replace(/[\s\-\(\)]/g, "");
      const { data: existing } = await supabase
        .from("participants")
        .select("id, telegram_chat_id")
        .eq("whatsapp_number", normalizedPhone)
        .single();

      if (existing) {
        console.log("Participant already exists:", existing.id);
        return new Response(
          JSON.stringify({ 
            success: true, 
            participantId: existing.id,
            alreadyExists: true,
            telegramConnected: !!existing.telegram_chat_id
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert new participant
      const { data: participant, error } = await supabase
        .from("participants")
        .insert({
          full_name: participantData.full_name,
          whatsapp_number: normalizedPhone,
          email: participantData.email || null,
          age: participantData.age || null,
          cycle_length_days: participantData.cycle_length_days || 28,
          last_period_start: participantData.last_period_start || null,
          cycle_regularity: participantData.cycle_regularity || "regular",
          typical_symptoms: participantData.typical_symptoms || [],
          goals: participantData.goals || [],
          anchor_symptom: participantData.anchor_symptom || null,
          consent_given: participantData.consent_given || false,
          consent_given_at: participantData.consent_given_at || null,
          additional_notes: participantData.additional_notes || null,
          preferred_channel: participantData.preferred_channel || "telegram",
          telegram_chat_id: null,
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

    // Action: connect telegram
    if (action === "connect-telegram") {
      if (!participantId || !chatId) {
        return new Response(
          JSON.stringify({ error: "Missing participantId or chatId" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Connecting Telegram for participant:", participantId);

      const { error } = await supabase
        .from("participants")
        .update({ telegram_chat_id: chatId })
        .eq("id", participantId);

      if (error) {
        console.error("Update error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to connect Telegram" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default action: lookup by phone
    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Phone number is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize phone number - remove spaces, dashes, keep only digits and +
    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, "");
    
    console.log("Looking up participant with phone:", normalizedPhone);

    // Look up participant by phone number
    const { data: participant, error } = await supabase
      .from("participants")
      .select("id, full_name, telegram_chat_id, consent_given")
      .eq("whatsapp_number", normalizedPhone)
      .single();

    if (error || !participant) {
      console.log("No participant found for phone:", normalizedPhone);
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Found participant:", participant.id, "Telegram connected:", !!participant.telegram_chat_id);

    // Return limited info - don't expose full participant data
    return new Response(
      JSON.stringify({
        found: true,
        participantId: participant.id,
        firstName: participant.full_name.split(" ")[0],
        telegramConnected: !!participant.telegram_chat_id,
        consentGiven: participant.consent_given,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Lookup error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
