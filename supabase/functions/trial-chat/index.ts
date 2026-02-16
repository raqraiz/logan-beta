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
    return `The **luteal phase** is the 10-14 days before your period. Here's what happens:

- **Progesterone** rises and your stress tolerance drops
- Energy, patience, and focus all take a hit
- That "everything is falling apart" feeling? That's luteal

The good news: once you see the pattern, you can **plan around it** instead of getting blindsided. Want to know what actually helps during luteal?`;
  }

  if (isAbout(["follicular"])) {
    return `The **follicular phase** starts right after your period ends. It's your body's "spring."

- **Estrogen** climbs back up, bringing energy and clarity
- Motivation feels natural instead of forced
- Best window for: new projects, hard conversations, challenging workouts

This is your **go time**. Does that match what you notice after your period?`;
  }

  if (isAbout(["ovulation", "ovulate", "ovulating"])) {
    return `**Ovulation** is your peak — usually 2-3 days mid-cycle.

- **Estrogen** peaks, plus a small testosterone bump
- You're at your sharpest: verbal fluency, confidence, social energy
- Physical performance hits its max too

It's a short window, but it's your **superpower phase**. Some people also feel a dip right after. Are you trying to figure out when yours happens?`;
  }

  if (isAbout(["menstrual", "period", "bleeding"])) {
    return `Your **period** is actually a reset, not a setback.

- Hormones are at their lowest — a clean slate
- Energy may dip, especially days 1-2
- Many people feel **mental clarity** once the luteal noise quiets down

The key: don't force productivity on Day 1 if you don't feel it. What's your period usually like?`;
  }

  // Common questions
  if (isAbout(["pms", "pmdd"])) {
    return `**PMS** happens in late luteal when both progesterone and estrogen crash.

- **Mood**: irritability, anxiety, emotional sensitivity
- **Body**: bloating, fatigue, cravings, disrupted sleep
- **Brain**: focus drops, patience thins

The frustrating part: most people only realize what happened **after** their period starts. What if you could see it coming 3-4 days early?`;
  }

  if (isAbout(["energy", "most energy", "peak energy", "strongest"])) {
    return `Your energy follows a predictable pattern each cycle:

- **Follicular** (after period): energy builds, motivation returns
- **Ovulation** (mid-cycle): peak performance, highest energy
- **Luteal** (pre-period): energy drops, everything takes more effort
- **Period**: lowest point, then the cycle resets

The trick: **schedule your hardest work during follicular and ovulation**, and give yourself permission to ease up in luteal. When do you usually feel the crash?`;
  }

  if (isAbout(["workout", "workouts", "training", "lift", "lifting", "run", "running"])) {
    return `Your body responds to training differently across your cycle:

- **Follicular + Ovulation**: push harder, recover faster, build strength
- **Luteal**: body runs hotter, fatigues quicker, needs more recovery
- **Period**: light movement (walks, yoga) beats pushing through

It's not about doing **less** — it's about doing the **right thing** at the right time. What kind of training do you do?`;
  }

  if (isAbout(["cycle", "phases", "hormone", "hormones"])) {
    return `Think of your cycle as **four seasons** in one month:

- **Period** (winter): slow down and reset
- **Follicular** (spring): energy builds, creativity peaks
- **Ovulation** (summer): you're on fire
- **Luteal** (autumn): things wind down, get heavier

Each one changes how you **think, move, and handle stress**. Which part do you struggle with most?`;
  }

  // Fallback
  return "Everyone's cycle hits differently — energy crashes, mood shifts, or workouts that suddenly feel impossible. Tell me what you notice and I'll show you **what's probably driving it** and when to expect it.";

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
