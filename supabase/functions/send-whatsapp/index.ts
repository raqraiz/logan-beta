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
    const { insightId, phoneNumber, message } = await req.json();

    if (!insightId) {
      return new Response(
        JSON.stringify({ error: "insightId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify insight exists and is approved
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: insight, error: insightError } = await supabase
      .from("insights")
      .select("*, participants(whatsapp_number)")
      .eq("id", insightId)
      .single();

    if (insightError || !insight) {
      console.error("Insight not found:", insightError);
      return new Response(
        JSON.stringify({ error: "Insight not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if insight is approved
    if (insight.status !== "approved") {
      console.error("Insight not approved. Current status:", insight.status);
      return new Response(
        JSON.stringify({ 
          error: "Insight must be approved before sending",
          currentStatus: insight.status 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const recipientPhone = phoneNumber || insight.participants?.whatsapp_number;
    const messageContent = message || insight.content;

    if (!recipientPhone || !messageContent) {
      return new Response(
        JSON.stringify({ error: "Phone number and message content are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      console.error("Twilio credentials not configured");
      return new Response(
        JSON.stringify({ error: "WhatsApp service not configured. Please add Twilio credentials." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Logan's WhatsApp number from Twilio sandbox
    const fromNumber = "whatsapp:+14155238886";
    
    // Format the recipient number
    let formattedTo = recipientPhone.replace(/\s+/g, "").replace(/-/g, "");
    if (!formattedTo.startsWith("+")) {
      formattedTo = "+" + formattedTo;
    }
    const toNumber = `whatsapp:${formattedTo}`;

    console.log(`Sending WhatsApp message from ${fromNumber} to ${toNumber} for insight ${insightId}`);

    // Add Logan's signature to the message
    const fullMessage = `${messageContent}\n\n💕 Logan\n\n_Reply to share your feedback or tell me about any changes in your cycle!_`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

    const formData = new URLSearchParams();
    formData.append("To", toNumber);
    formData.append("From", fromNumber);
    formData.append("Body", fullMessage);

    const response = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      },
      body: formData.toString(),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Twilio error:", result);
      return new Response(
        JSON.stringify({ 
          error: `WhatsApp send failed: ${result.message || "Unknown error"}`,
          code: result.code 
        }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update insight status to sent
    await supabase
      .from("insights")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", insightId);

    console.log("WhatsApp message sent successfully:", result.sid);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageSid: result.sid,
        status: result.status 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send WhatsApp error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
