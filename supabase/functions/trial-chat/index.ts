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
    return "You know that thing where you get your period and suddenly realize oh, that's why the world was falling apart for the past few days? That's luteal. It's the 10-14 days before your period where progesterone rises and your stress tolerance drops. The good news: once you know it's coming, you can plan for it instead of getting blindsided. Want to know what to actually do during luteal?";
  }

  if (isAbout(["follicular"])) {
    return "You know those days after your period ends where you suddenly feel like yourself again? Like you can actually think clearly and want to do things? That's follicular. Estrogen is climbing back up and it's basically your body's way of saying go time. It's the best window for starting new things, hard conversations, or big workouts. Does that match what you notice?";
  }

  if (isAbout(["ovulation", "ovulate", "ovulating"])) {
    return "Ever have a few days where you feel weirdly confident, social, and just... on? That's usually ovulation. Estrogen peaks, you get a little testosterone bump, and your brain is firing on all cylinders. It's a short window though, usually just 2-3 days. Some people also get a weird dip right after. Are you trying to figure out when yours happens?";
  }

  if (isAbout(["menstrual", "period", "bleeding"])) {
    return "Your period gets a bad reputation, but it's actually a reset. Yes, energy can be lower at the start, but a lot of people feel a sense of clarity once the hormonal noise of luteal finally quiets down. Your body is literally starting fresh. The key is not forcing productivity on Day 1 if you don't feel it. What's your period usually like for you?";
  }

  // Common questions
  if (isAbout(["pms", "pmdd"])) {
    return "Here's the thing about PMS: it's not you being dramatic. Late luteal is when both progesterone and estrogen drop, and that crash affects everything from your mood to your sleep to how much patience you have for literally anyone. The frustrating part is most people only realize what happened after the fact. What if you could see it coming a few days early?";
  }

  if (isAbout(["energy", "most energy", "peak energy", "strongest"])) {
    return "Most people feel their best energy in late follicular and around ovulation, when estrogen is high. Then luteal hits and suddenly everything takes more effort. It's not a motivation problem. It's hormones. The trick is scheduling your hardest stuff during your high-energy windows and giving yourself permission to ease up when your body needs it. When do you usually feel the crash?";
  }

  if (isAbout(["workout", "workouts", "training", "lift", "lifting", "run", "running"])) {
    return "Your body literally responds to training differently depending on where you are in your cycle. Around ovulation you can push harder and recover faster. In luteal, your body runs hotter, fatigues quicker, and needs more recovery time. It's not about doing less, it's about doing the right thing at the right time. What kind of training do you do?";
  }

  if (isAbout(["cycle", "phases", "hormone", "hormones"])) {
    return "Think of your cycle like four different seasons in one month. You've got your period (winter, slow down and reset), follicular (spring, energy builds), ovulation (summer, you're on fire), and luteal (autumn, things wind down and get heavier). Each one changes how you think, move, and handle stress. Which part do you struggle with most?";
  }

  // Fallback
  return "Everyone's cycle hits differently. Some people notice energy crashes, some get blindsided by mood shifts, others wonder why their workouts feel impossible some weeks. Tell me what you notice and I'll tell you what's probably driving it.";
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
        response: "Something went wrong. Try asking about a specific phase like luteal or follicular.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
