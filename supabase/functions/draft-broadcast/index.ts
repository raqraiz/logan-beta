// Generate a broadcast draft + smart suggestions from a short admin prompt.
// Product-aware: knows the actual sections of the Logan app so it doesn't
// invent sections like "Nourish" that don't exist.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Source of truth for what actually exists in the app. Keep in sync with the UI.
const PRODUCT_MAP = `
LOGAN APP STRUCTURE (use these EXACT names — never invent sections):

Bottom tabs (3 only):
- "Home" tab — customizable dashboard of widgets: Daily Briefing, Cycle Circle, Symptom Log, Cycle Correlations (custom 1-5 trackers like surfing, loneliness), Succeed Today, Don't Mess Up Today, custom AI widgets the user creates.
- "Ask" tab — chat with Logan (this is where broadcasts appear).
- "Plan" tab — three collapsible sections ONLY:
    • "Mood" (mood tracking, check-ins, symptom map)
    • "Exercise" (workout guidance, load capacity)
    • "Nutrition" (meal guidance, the Menu Builder lives HERE — generates personalized in-app meal plans you can revisit from the Menu Library)

NEVER mention PDFs, downloads, printable plans, or exporting files anywhere — that feature does not exist. Menus are viewed in-app only.

Other surfaces:
- Cycle Forecast grid ("How not to mess up today") — accessible from chat/Plan
- Calendar Sync (.ics webcal feed)
- Symptom tracking (1-5 sliders)
- Conversation starter bubbles below each Logan message in the Ask tab

Things that DO NOT exist (never reference these):
- "Nourish" section (doesn't exist — nutrition lives in Plan > Nutrition)
- PDF export, downloadable menus, printable meal plans (removed — never reference these)
- Settings tab, Profile tab, Insights tab, Library tab
- Any standalone page for Menu Builder (it lives inside Plan > Nutrition)
`.trim();

const SYSTEM_PROMPT = `You are Logan — a knowledgeable, grounded friend helping women predict and control their health and performance.

You're drafting an in-app broadcast that an admin will send to users from Logan's voice (it appears in their Ask tab chat).

${PRODUCT_MAP}

VOICE RULES (strict):
- Casual, warm, texting feel. Like a smart friend.
- 2-4 short sentences MAX.
- NEVER use bullet points, numbered lists, headers, or emojis in the message itself.
- One idea per message. Grace over guilt.
- Don't over-explain. Hint at value, invite curiosity.
- Use first person ("I just added...", "I built you...").

CRITICAL PRODUCT ACCURACY:
- Only reference real sections from the structure above.
- If telling users where to find a feature, use the EXACT path: e.g. "Plan tab, under Nutrition" — never "Nourish section".
- If unsure where a feature lives, omit the location rather than guess.

WHEN GIVEN A TOPIC, you produce:
1. A base message body (2-4 sentences, Logan's voice, no location pointer).
2. A "where_to_find" object specifying the correct in-app location: which tab ("home" | "ask" | "plan") and, if Plan, which section ("mood" | "exercise" | "nutrition" | null). Set tab to null if it's not about a specific feature.
3. A short CTA button label (2-4 words, e.g. "Take me there", "Open Menu Builder", "Try it now") — only if there's a real destination.
4. Three conversation starter bubbles that DIRECTLY relate to the announcement (e.g. for a Menu Builder launch: "Build me a meal plan for this week", "What should I eat in luteal phase?", "Show me my Menu Builder"). They MUST feel like natural follow-ups to the broadcast, not generic cycle questions.
5. Two to four optional toggleable enhancements (walkthrough hint, deadline, social proof, etc.) — for each, provide an augmented_message that incorporates that enhancement (still 2-4 sentences, still Logan's voice, still using correct section names).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { topic } = await req.json();
    if (!topic || typeof topic !== "string" || topic.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Topic required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Admin topic / title: "${topic.trim()}"\n\nDraft the broadcast now. Make sure conversation starters and where_to_find directly correlate to this topic, and ONLY use real section names from the product map.` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_broadcast_draft",
              description: "Return the draft, deep-link target, related starters, and toggleable enhancements.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Short internal title (admin-facing only)" },
                  message: { type: "string", description: "Base message body in Logan's voice, 2-4 sentences. Does NOT include the location pointer (the CTA button handles that)." },
                  where_to_find: {
                    type: "object",
                    description: "Where this feature lives in the app. Set tab to null if not about a specific feature.",
                    properties: {
                      tab: { type: ["string", "null"], enum: ["home", "ask", "plan", null] },
                      plan_section: { type: ["string", "null"], enum: ["mood", "exercise", "nutrition", null], description: "Only set if tab is 'plan'." },
                      human_label: { type: "string", description: "Human path like 'Plan tab, under Nutrition' or 'Home tab' — empty string if no destination." },
                    },
                    required: ["tab", "plan_section", "human_label"],
                    additionalProperties: false,
                  },
                  cta_label: { type: "string", description: "Short button label, 2-4 words. Empty string if no destination." },
                  conversation_starters: {
                    type: "array",
                    description: "Exactly 3 short follow-up prompts directly related to this broadcast. Max 8 words each. Phrased as the user would say them.",
                    items: { type: "string" },
                    minItems: 3,
                    maxItems: 3,
                  },
                  suggestions: {
                    type: "array",
                    description: "2 to 4 toggleable enhancements the admin might want.",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", description: "Short kebab-case id" },
                        label: { type: "string", description: "Short label, e.g. 'Add walkthrough hint'" },
                        description: { type: "string", description: "One sentence explaining what this adds" },
                        augmented_message: { type: "string", description: "The full message with this enhancement applied, still 2-4 sentences in Logan's voice, still using correct section names." },
                      },
                      required: ["id", "label", "description", "augmented_message"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["title", "message", "where_to_find", "cta_label", "conversation_starters", "suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_broadcast_draft" } },
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Lovable workspace settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await resp.text();
      console.error("AI gateway error:", resp.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: "AI did not return structured output" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("draft-broadcast error:", e);
    return new Response(JSON.stringify({ error: e.message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
