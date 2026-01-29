import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Twilio sends webhooks as form-urlencoded
    const formData = await req.formData();
    
    const from = formData.get("From")?.toString() || "";
    const body = formData.get("Body")?.toString() || "";
    const messageSid = formData.get("MessageSid")?.toString() || "";
    
    // Extract phone number (remove "whatsapp:" prefix)
    const phoneNumber = from.replace("whatsapp:", "");
    
    console.log(`Received WhatsApp from ${phoneNumber}: ${body}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find participant by phone number
    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .select("id, full_name")
      .or(`whatsapp_number.eq.${phoneNumber},whatsapp_number.eq.${phoneNumber.replace("+", "")}`)
      .maybeSingle();

    if (participantError) {
      console.error("Error finding participant:", participantError);
    }

    if (!participant) {
      console.log("No participant found for phone:", phoneNumber);
      // Return TwiML response acknowledging receipt
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
        { 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "text/xml" 
          } 
        }
      );
    }

    console.log(`Message from participant: ${participant.full_name}`);

    // Find the most recent sent insight for this participant
    const { data: recentInsight } = await supabase
      .from("insights")
      .select("id")
      .eq("participant_id", participant.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Store as cycle update (user feedback/response)
    const { error: updateError } = await supabase
      .from("cycle_updates")
      .insert({
        participant_id: participant.id,
        update_type: "whatsapp_reply",
        description: body,
        category: "user_response",
      });

    if (updateError) {
      console.error("Error storing cycle update:", updateError);
    }

    // If there's a recent insight, store feedback
    if (recentInsight) {
      const { error: feedbackError } = await supabase
        .from("feedback")
        .insert({
          participant_id: participant.id,
          insight_id: recentInsight.id,
          free_form_text: body,
        });

      if (feedbackError) {
        console.error("Error storing feedback:", feedbackError);
      }
    }

    console.log("Stored WhatsApp reply successfully");

    // Return empty TwiML response (no auto-reply for now)
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "text/xml" 
        } 
      }
    );
  } catch (error) {
    console.error("Receive WhatsApp error:", error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "text/xml" 
        } 
      }
    );
  }
});
