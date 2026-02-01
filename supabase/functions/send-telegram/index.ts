import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { differenceInDays } from "https://esm.sh/date-fns@3.6.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type CyclePhase = "Menstruation" | "Follicular" | "Ovulation" | "Luteal";

interface PhaseColors {
  main: string;
  track: string;
}

const phaseColors: Record<CyclePhase, PhaseColors> = {
  Menstruation: { main: "#e11d48", track: "#3E4348" },
  Follicular: { main: "#059669", track: "#3E4348" },
  Ovulation: { main: "#d97706", track: "#3E4348" },
  Luteal: { main: "#7c3aed", track: "#3E4348" },
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

async function generateCycleImage(day: number, phase: CyclePhase, cycleLengthDays: number): Promise<ArrayBuffer | null> {
  const colors = phaseColors[phase];
  const progress = day;
  const remaining = cycleLengthDays - day;
  
  const chartConfig = {
    version: "2",
    format: "png",
    width: 600,
    height: 300,
    devicePixelRatio: 2,
    backgroundColor: "#1C1E22",
    chart: {
      type: "doughnut",
      data: {
        datasets: [{
          data: [progress, remaining],
          backgroundColor: [colors.main, colors.track],
          borderWidth: 0,
        }]
      },
      options: {
        cutoutPercentage: 75,
        rotation: Math.PI * 1.5,
        circumference: Math.PI * 2,
        legend: { display: false },
        title: { display: false },
        plugins: {
          datalabels: { display: false },
          doughnutlabel: {
            labels: [
              {
                text: day.toString(),
                font: { size: 48, weight: "bold" },
                color: colors.main
              },
              {
                text: phase,
                font: { size: 14 },
                color: colors.main
              },
            ]
          }
        },
      }
    }
  };

  try {
    console.log("Calling QuickChart POST API...");
    const response = await fetch("https://quickchart.io/chart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chartConfig),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("QuickChart error:", response.status, errorText);
      return null;
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.error("Error generating chart:", error);
    return null;
  }
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

  try {
    console.log(`Generating cycle image: Day ${cycleInfo.day}, ${cycleInfo.phase} phase`);
    
    const imageBuffer = await generateCycleImage(cycleInfo.day, cycleInfo.phase, cycleLengthDays || 28);
    
    if (!imageBuffer) {
      console.error("Failed to generate chart image");
      return null;
    }
    
    const imageData = new Uint8Array(imageBuffer);
    const timestamp = Date.now();
    const filename = `${participantId}/${timestamp}.png`;
    
    const { error } = await supabase.storage
      .from("cycle-images")
      .upload(filename, imageData, {
        contentType: "image/png",
        upsert: true,
      });
    
    if (error) {
      console.error("Error uploading cycle image:", error);
      return null;
    }
    
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
    const { insightId, chatId, message, includeCycleImage } = await req.json();

    if (!insightId) {
      return new Response(
        JSON.stringify({ error: "insightId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: insight, error: insightError } = await supabase
      .from("insights")
      .select("*, participants(id, telegram_chat_id, last_period_start, cycle_length_days)")
      .eq("id", insightId)
      .single();

    if (insightError || !insight) {
      console.error("Insight not found:", insightError);
      return new Response(
        JSON.stringify({ error: "Insight not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    const recipientChatId = chatId || participant?.telegram_chat_id;
    const messageContent = message || insight.content;

    if (!recipientChatId || !messageContent) {
      return new Response(
        JSON.stringify({ error: "Telegram chat ID and message content are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    
    if (!TELEGRAM_BOT_TOKEN) {
      console.error("Telegram bot token not configured");
      return new Response(
        JSON.stringify({ error: "Telegram bot not configured. Please add TELEGRAM_BOT_TOKEN." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate cycle circle image if requested
    let cycleImageUrl: string | null = null;
    if (includeCycleImage && participant?.id && participant?.last_period_start) {
      cycleImageUrl = await generateAndUploadCycleImage(
        supabase,
        participant.id,
        participant.last_period_start,
        participant.cycle_length_days
      );
    }

    // Send the insight content directly - the AI-generated message already includes a personalized engagement prompt
    const fullMessage = messageContent;

    console.log(`Sending Telegram message to chat ${recipientChatId} for insight ${insightId}`);

    // Send photo with caption if cycle image is available, otherwise send text message
    let telegramResponse;
    
    if (cycleImageUrl) {
      console.log(`Including cycle image: ${cycleImageUrl}`);
      telegramResponse = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: recipientChatId,
            photo: cycleImageUrl,
            caption: fullMessage,
            parse_mode: "Markdown",
          }),
        }
      );
    } else {
      telegramResponse = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: recipientChatId,
            text: fullMessage,
            parse_mode: "Markdown",
          }),
        }
      );
    }

    const result = await telegramResponse.json();

    if (!result.ok) {
      console.error("Telegram API error:", JSON.stringify(result, null, 2));
      
      let userMessage = result.description || "Unknown error";
      if (result.error_code === 403) {
        userMessage = "Bot was blocked by the user or chat not found. User needs to start a conversation with the bot first.";
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

    // Update insight status to sent
    await supabase
      .from("insights")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", insightId);

    console.log("Telegram message sent successfully:", result.result.message_id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: result.result.message_id,
        imageIncluded: !!cycleImageUrl
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send Telegram error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
