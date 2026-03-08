import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatDateICS(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

interface PhaseEvent {
  name: string;
  startDay: number; // 1-based cycle day
  endDay: number;   // inclusive
  description: string;
  emoji: string;
}

function getPhases(cycleLength: number): PhaseEvent[] {
  // Luteal phase is fixed at 14 days before next period
  const ovulationDay = cycleLength - 14;
  const follicularEnd = ovulationDay - 2;

  return [
    {
      name: "🩸 Menstrual Phase",
      startDay: 1,
      endDay: 5,
      description: "Inner Winter — rest, reflect, and restore. Energy is lowest.",
      emoji: "🩸",
    },
    {
      name: "🌱 Follicular Phase",
      startDay: 6,
      endDay: follicularEnd,
      description: "Inner Spring — rising energy, creativity, and motivation.",
      emoji: "🌱",
    },
    {
      name: "🌕 Ovulation Window",
      startDay: ovulationDay - 1,
      endDay: ovulationDay + 2,
      description: "Inner Summer — peak energy, confidence, and social connection.",
      emoji: "🌕",
    },
    {
      name: "🍂 Luteal Phase",
      startDay: ovulationDay + 3,
      endDay: cycleLength,
      description: "Inner Autumn — winding down, nesting, and preparing.",
      emoji: "🍂",
    },
  ];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response("Missing token", { status: 401 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Look up the token
    const { data: calToken, error: tokenErr } = await adminClient
      .from("calendar_tokens")
      .select("user_id")
      .eq("token", token)
      .single();

    if (tokenErr || !calToken) {
      return new Response("Invalid token", { status: 401 });
    }

    const userId = calToken.user_id;

    // Find the participant linked to this user's email
    const { data: profile } = await adminClient
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .single();

    if (!profile?.email) {
      return new Response("Profile not found", { status: 404 });
    }

    const { data: participant } = await adminClient
      .from("participants")
      .select("id, cycle_length_days, last_period_start, full_name")
      .eq("email", profile.email)
      .single();

    if (!participant || !participant.last_period_start) {
      return new Response(generateEmptyCalendar(), {
        headers: { "Content-Type": "text/calendar; charset=utf-8", ...corsHeaders },
      });
    }

    const cycleLength = participant.cycle_length_days || 28;
    const lastPeriodStart = new Date(participant.last_period_start + "T12:00:00Z");
    const phases = getPhases(cycleLength);
    const now = new Date();

    // Generate events for ~6 months back and 6 months forward
    const events: string[] = [];
    const startRange = addDays(now, -180);
    const endRange = addDays(now, 180);

    // Find the cycle start closest to our range start
    let cycleStart = new Date(lastPeriodStart);
    // Walk backwards if needed
    while (cycleStart > startRange) {
      cycleStart = addDays(cycleStart, -cycleLength);
    }
    // Walk forward to the first cycle in range
    while (addDays(cycleStart, cycleLength) < startRange) {
      cycleStart = addDays(cycleStart, cycleLength);
    }

    // Generate phase events for each cycle in range
    while (cycleStart < endRange) {
      for (const phase of phases) {
        const eventStart = addDays(cycleStart, phase.startDay - 1);
        const eventEnd = addDays(cycleStart, phase.endDay); // +1 for DTEND exclusive

        if (eventEnd < startRange || eventStart > endRange) continue;

        const uid = `logan-${formatDateICS(eventStart)}-${phase.startDay}@logan-app`;
        events.push(
          `BEGIN:VEVENT\r\n` +
          `DTSTART;VALUE=DATE:${formatDateICS(eventStart)}\r\n` +
          `DTEND;VALUE=DATE:${formatDateICS(eventEnd)}\r\n` +
          `SUMMARY:${phase.name}\r\n` +
          `DESCRIPTION:${phase.description}\r\n` +
          `UID:${uid}\r\n` +
          `TRANSP:TRANSPARENT\r\n` +
          `END:VEVENT`
        );
      }
      cycleStart = addDays(cycleStart, cycleLength);
    }

    const ics =
      `BEGIN:VCALENDAR\r\n` +
      `VERSION:2.0\r\n` +
      `PRODID:-//Logan//Cycle Calendar//EN\r\n` +
      `CALSCALE:GREGORIAN\r\n` +
      `METHOD:PUBLISH\r\n` +
      `X-WR-CALNAME:My Cycle Phases (Logan)\r\n` +
      `X-WR-TIMEZONE:UTC\r\n` +
      `REFRESH-INTERVAL;VALUE=DURATION:PT6H\r\n` +
      `X-PUBLISHED-TTL:PT6H\r\n` +
      events.join("\r\n") + "\r\n" +
      `END:VCALENDAR`;

    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        ...corsHeaders,
      },
    });
  } catch (err) {
    console.error("Calendar feed error:", err);
    return new Response("Internal error", { status: 500 });
  }
});

function generateEmptyCalendar(): string {
  return (
    `BEGIN:VCALENDAR\r\n` +
    `VERSION:2.0\r\n` +
    `PRODID:-//Logan//Cycle Calendar//EN\r\n` +
    `CALSCALE:GREGORIAN\r\n` +
    `METHOD:PUBLISH\r\n` +
    `X-WR-CALNAME:My Cycle Phases (Logan)\r\n` +
    `REFRESH-INTERVAL;VALUE=DURATION:PT6H\r\n` +
    `X-PUBLISHED-TTL:PT6H\r\n` +
    `END:VCALENDAR`
  );
}
