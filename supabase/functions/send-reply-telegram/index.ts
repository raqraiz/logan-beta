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
    const { chatId, message, feedbackId } = await req.json();

    if (!chatId || !message) {
      console.error("Missing required fields:", { chatId: !!chatId, message: !!message });
      return new Response(
        JSON.stringify({ error: "chatId and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    
    if (!TELEGRAM_BOT_TOKEN) {
      console.error("Telegram bot token not configured");
      return new Response(
        JSON.stringify({ error: "Telegram bot not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending reply to chat ${chatId}`);

    // Format message with line breaks between sentences for better readability
    const formatWithBreaks = (text: string): string => {
      return text
        .replace(/([.!?])\s+(?=[A-Z])/g, "$1\n\n")
        .trim();
    };

    // Ensure we never append or re-send a signature/sign-off
    const cleanedMessage = message
      .replace(/\n?\s*💕\s*Logan\s*$/i, "")
      .trim();

    const fullMessage = `${formatWithBreaks(cleanedMessage)}`;

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: fullMessage,
          parse_mode: "Markdown",
        }),
      }
    );

    const result = await telegramResponse.json();

    if (!result.ok) {
      console.error("Telegram API error:", JSON.stringify(result, null, 2));
      
      let userMessage = result.description || "Unknown error";
      if (result.error_code === 403) {
        userMessage = "Bot was blocked by the user or chat not found.";
      } else if (result.error_code === 400) {
        userMessage = "Invalid chat ID or message format.";
      }
      
      return new Response(
        JSON.stringify({ 
          error: userMessage,
          telegramError: result.description,
          errorCode: result.error_code
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update feedback as sent if feedbackId provided
    if (feedbackId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase
        .from("feedback")
        .update({ admin_reply_sent: true })
        .eq("id", feedbackId);
    }

    console.log("Reply sent successfully:", result.result.message_id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: result.result.message_id
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send reply error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
