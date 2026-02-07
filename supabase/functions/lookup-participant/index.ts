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
    const { phone, action, participantId, chatId } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
