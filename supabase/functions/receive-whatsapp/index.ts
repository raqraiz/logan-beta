import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate an AI response and store it as a pending insight for admin approval
async function generateResponseForApproval(
  supabase: SupabaseClient,
  participantId: string,
  participantName: string,
  userMessage: string
) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.log("LOVABLE_API_KEY not configured, skipping AI response generation");
    return;
  }

  // Get participant data for context
  const { data: participant } = await supabase
    .from("participants")
    .select("*")
    .eq("id", participantId)
    .single();

  // Get recent conversation context
  const { data: recentUpdates } = await supabase
    .from("cycle_updates")
    .select("*")
    .eq("participant_id", participantId)
    .order("created_at", { ascending: false })
    .limit(5);

  // Get recent insights sent to this participant
  const { data: recentInsights } = await supabase
    .from("insights")
    .select("content, sent_at")
    .eq("participant_id", participantId)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(3);

  const systemPrompt = `You are Logan, a warm, empathetic, and knowledgeable women's health companion. You're responding to a message from a participant via WhatsApp.

Guidelines:
- Be warm and conversational, like a caring friend
- Use emojis sparingly but meaningfully (1-2 per message)
- Keep responses concise for WhatsApp (under 150 words)
- Acknowledge what they said and respond helpfully
- If they ask questions, answer clearly and supportively
- If they share symptoms or updates, validate their experience
- End with something encouraging or an open invitation to share more`;

  const conversationContext = recentInsights?.length 
    ? `Recent messages you sent them:\n${recentInsights.map(i => `- ${i.content?.substring(0, 100)}...`).join("\n")}`
    : "";

  const userPrompt = `${participantName} just sent you this WhatsApp message:

"${userMessage}"

Their profile:
- Age: ${participant?.age || "not specified"}
- Cycle length: ${participant?.cycle_length_days || 28} days
- Common symptoms: ${participant?.typical_symptoms?.join(", ") || "none specified"}
- Goals: ${participant?.goals?.join(", ") || "general wellness"}

${conversationContext}

Generate a warm, helpful response to their message. Remember to keep it concise for WhatsApp.`;

  console.log("Generating AI response for:", participantName);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI gateway error:", response.status, errorText);
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const aiResponse = await response.json();
  const content = aiResponse.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content in AI response");
  }

  // Store as pending insight for admin approval
  const { error: insertError } = await supabase
    .from("insights")
    .insert({
      participant_id: participantId,
      content: content,
      insight_type: "reply",
      status: "pending",
      admin_notes: `Auto-generated reply to: "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}"`,
    });

  if (insertError) {
    console.error("Error storing generated insight:", insertError);
    throw insertError;
  }

  console.log("Generated response stored for admin approval");
}

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

    // Generate AI response for admin approval
    try {
      await generateResponseForApproval(supabase, participant.id, participant.full_name, body);
    } catch (genError) {
      console.error("Error generating response:", genError);
      // Don't fail the webhook if AI generation fails
    }

    // Return empty TwiML response (no auto-reply - admin must approve)
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
