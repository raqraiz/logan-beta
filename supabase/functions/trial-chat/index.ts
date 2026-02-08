import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type TrialMsg = { role: "user" | "assistant"; content: string };

function normalize(input: string) {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function pickResponse(lastUserMessage: string) {
  const q = normalize(lastUserMessage);

  const isAbout = (terms: string[]) => terms.some((t) => q.includes(t));

  // Phase definitions
  if (isAbout(["luteal"])) {
    return "The luteal phase is the part of your cycle after ovulation and before your next period, usually about 12-14 days. Progesterone rises during this phase, and many people notice more fatigue, cravings, lower stress tolerance, or PMS-like symptoms. Do you want a simple guide for how to train and plan during luteal?";
  }

  if (isAbout(["follicular"])) {
    return "The follicular phase starts on day 1 of your period and runs up to ovulation. Estrogen tends to rise, and many people feel more energetic, optimistic, and resilient as they get closer to ovulation. Are you asking because your mood or training feels different at certain times of the month?";
  }

  if (isAbout(["ovulation", "ovulate", "ovulating"])) {
    return "Ovulation is when an egg is released, typically mid-cycle, and it often coincides with higher estrogen (and sometimes a brief testosterone bump). Many people feel stronger and more social around this window, though some notice ovulation pain or a slight dip the day after. Are you trying to time workouts, productivity, or symptoms?";
  }

  if (isAbout(["menstrual", "period", "bleeding"])) {
    return "The menstrual phase is when you bleed, marking day 1 of your cycle. Energy can be lower early on for some people, then gradually improves as bleeding tapers. Do you want tips for training and recovery during your period, or are you trying to understand symptoms?";
  }

  // Common questions
  if (isAbout(["pms", "pmdd"])) {
    return "PMS symptoms often show up in the late luteal phase, when progesterone and estrogen drop before your period. That shift can affect mood, sleep, appetite, and how sensitive you feel to stress. Which symptom is most disruptive for you: mood, fatigue, cravings, or irritability?";
  }

  if (isAbout(["energy", "most energy", "peak energy", "strongest"])) {
    return "Many people feel their best energy and training capacity in the late follicular phase and around ovulation, when estrogen is higher. The luteal phase can feel more variable, with a higher need for recovery, especially late luteal. When you say 'most energy', do you mean workouts, focus, mood, or all three?";
  }

  if (isAbout(["workout", "workouts", "training", "lift", "lifting", "run", "running"])) {
    return "A simple pattern is: push harder in late follicular and around ovulation, then adjust volume and recovery needs more during luteal. During your period, some prefer lighter intensity early on and build back as energy returns. What kind of training are you doing right now?";
  }

  if (isAbout(["cycle", "phases", "hormone", "hormones"])) {
    return "The cycle is commonly described in four phases: menstrual, follicular, ovulation, and luteal. Hormones shift across these phases, which can change energy, mood, appetite, and recovery needs. Do you want a quick overview, or guidance for a specific goal like training or focus?";
  }

  // Fallback
  return "I can help explain cycle phases and how they tend to affect energy, mood, and training. What are you trying to understand right now: a specific phase (like luteal), a symptom (like cravings or irritability), or performance (like workouts and focus)?";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const typed = messages as TrialMsg[];
    const lastUser = [...typed].reverse().find((m) => m.role === "user");
    const lastUserContent = lastUser?.content?.toString?.() ?? "";

    const response = pickResponse(lastUserContent);

    return new Response(JSON.stringify({ response }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Trial chat error:", error);
    return new Response(
      JSON.stringify({
        response:
          "I can help explain cycle phases and how they affect energy and symptoms. What would you like to understand: luteal, ovulation, PMS, or training?",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
