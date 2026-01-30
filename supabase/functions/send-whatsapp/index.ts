import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { differenceInDays } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type CyclePhase = "Menstruation" | "Follicular" | "Ovulation" | "Luteal";

interface PhaseColors {
  stroke: string;
  fill: string;
  text: string;
}

const phaseColors: Record<CyclePhase, PhaseColors> = {
  Menstruation: { stroke: "#e11d48", fill: "#ffe4e6", text: "#be123c" },
  Follicular: { stroke: "#059669", fill: "#d1fae5", text: "#047857" },
  Ovulation: { stroke: "#d97706", fill: "#fef3c7", text: "#b45309" },
  Luteal: { stroke: "#7c3aed", fill: "#ede9fe", text: "#6d28d9" },
};

function getCycleInfo(lastPeriodStart: string | null, cycleLengthDays: number | null): { day: number; phase: CyclePhase } | null {
  if (!lastPeriodStart || !cycleLengthDays) return null;

  const today = new Date();
  const periodStart = new Date(lastPeriodStart);
  const daysSinceStart = differenceInDays(today, periodStart);
  
  const currentDay = ((daysSinceStart % cycleLengthDays) + cycleLengthDays) % cycleLengthDays + 1;

  const menstruationEnd = 5;
  const ovulationDay = cycleLengthDays - 14;
  const ovulationStart = ovulationDay - 1;
  const ovulationEnd = ovulationDay + 2;

  let phase: CyclePhase;

  if (currentDay <= menstruationEnd) {
    phase = "Menstruation";
  } else if (currentDay < ovulationStart) {
    phase = "Follicular";
  } else if (currentDay <= ovulationEnd) {
    phase = "Ovulation";
  } else {
    phase = "Luteal";
  }

  return { day: currentDay, phase };
}

function generateCycleCircleSVG(day: number, phase: CyclePhase, cycleLengthDays: number): string {
  const colors = phaseColors[phase];
  const progress = (day / cycleLengthDays) * 100;
  const size = 200;
  const r = 80;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 40}" viewBox="0 0 ${size} ${size + 40}">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.fill};stop-opacity:0.8" />
      <stop offset="100%" style="stop-color:${colors.fill};stop-opacity:0.4" />
    </linearGradient>
  </defs>
  
  <!-- Background circle -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="12" />
  
  <!-- Progress arc -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors.stroke}" stroke-width="12" 
    stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}"
    transform="rotate(-90 ${cx} ${cy})" />
  
  <!-- Center circle with gradient -->
  <circle cx="${cx}" cy="${cy}" r="${r - 15}" fill="url(#bgGradient)" />
  
  <!-- Day number -->
  <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="${colors.text}">
    ${day}
  </text>
  
  <!-- Phase label below -->
  <text x="${cx}" y="${size + 25}" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="600" fill="${colors.text}">
    ${phase}
  </text>
</svg>`;
}

async function generateAndUploadCycleImage(
  supabase: SupabaseClient,
  participantId: string,
  lastPeriodStart: string | null,
  cycleLengthDays: number | null
): Promise<string | null> {
  const cycleInfo = getCycleInfo(lastPeriodStart, cycleLengthDays);
  if (!cycleInfo) {
    console.log("No cycle info available for image generation");
    return null;
  }

  const svg = generateCycleCircleSVG(cycleInfo.day, cycleInfo.phase, cycleLengthDays || 28);
  
  // Convert SVG to PNG using resvg-wasm
  try {
    const { Resvg, initWasm } = await import("@aspect-dev/resvg-wasm");
    
    // Initialize WASM
    await initWasm();
    
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: 400 },
    });
    
    const pngData = resvg.render().asPng();
    
    // Create unique filename
    const timestamp = Date.now();
    const filename = `${participantId}/${timestamp}.png`;
    
    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from("cycle-images")
      .upload(filename, pngData, {
        contentType: "image/png",
        upsert: true,
      });
    
    if (error) {
      console.error("Error uploading cycle image:", error);
      return null;
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from("cycle-images")
      .getPublicUrl(filename);
    
    console.log("Cycle image uploaded:", urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error("Error generating cycle image:", error);
    return null;
  }
}

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
      .select("*, participants(id, whatsapp_number, last_period_start, cycle_length_days)")
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

    const participant = insight.participants;
    const recipientPhone = phoneNumber || participant?.whatsapp_number;
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

    // Generate cycle circle image if participant data is available
    let cycleImageUrl: string | null = null;
    if (participant?.id && participant?.last_period_start) {
      cycleImageUrl = await generateAndUploadCycleImage(
        supabase,
        participant.id,
        participant.last_period_start,
        participant.cycle_length_days
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
    if (cycleImageUrl) {
      console.log(`Including cycle image: ${cycleImageUrl}`);
    }

    // Add Logan's signature to the message
    const fullMessage = `${messageContent}\n\n💕 Logan\n\n_Reply to share your feedback or tell me about any changes in your cycle!_`;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

    const formData = new URLSearchParams();
    formData.append("To", toNumber);
    formData.append("From", fromNumber);
    formData.append("Body", fullMessage);
    
    // Add image if available
    if (cycleImageUrl) {
      formData.append("MediaUrl", cycleImageUrl);
    }

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
      console.error("Twilio error details:", JSON.stringify({
        status: response.status,
        code: result.code,
        message: result.message,
        moreInfo: result.more_info,
        fullResponse: result
      }, null, 2));
      
      // Provide helpful error messages for common issues
      let userMessage = result.message || "Unknown error";
      if (result.code === 63007) {
        userMessage = "Twilio sandbox not configured for this From number. Check that the Account SID/Auth Token match the sandbox owner.";
      } else if (result.code === 21608) {
        userMessage = "Participant hasn't joined the Twilio sandbox. They need to send 'join night-shadow' to +1 415 523 8886.";
      }
      
      return new Response(
        JSON.stringify({ 
          error: userMessage,
          twilioCode: result.code,
          twilioMessage: result.message,
          moreInfo: result.more_info
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
        status: result.status,
        imageIncluded: !!cycleImageUrl
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
