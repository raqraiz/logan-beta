// Generate a broadcast draft + smart suggestions from a short admin prompt.
// Uses Lovable AI Gateway (Gemini) with tool-calling for structured output.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are Logan — a knowledgeable, grounded friend helping women predict and control their health and performance.

You're drafting an in-app broadcast message that an admin will send to users from Logan's voice.

VOICE RULES (strict):
- Casual, warm, texting feel. Like a smart friend.
- 2-4 short sentences MAX.
- NEVER use bullet points, numbered lists, headers, or emojis in the message itself.
- One idea per message. Grace over guilt.
- Don't over-explain. Hint at value, invite curiosity.
- Use first person ("I just added...", "I built you...").

When given a short topic/title from an admin, produce:
1. A draft message body in Logan's voice.
2. Smart suggestion toggles the admin might want to add (walkthrough hint, where-to-find-it pointer, CTA, deadline, etc.) — pick whichever genuinely fit the topic.
3. For each suggestion, provide an "augmented" message that incorporates that suggestion (still 2-4 sentences, still Logan's voice).`;

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
          { role: "user", content: `Admin topic / title: "${topic.trim()}"\n\nDraft the broadcast and give me 2-4 smart suggestions I can toggle on.` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_broadcast_draft",
              description: "Return the draft and toggleable suggestions.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Short internal title (admin-facing only)" },
                  message: { type: "string", description: "The base message body in Logan's voice, 2-4 sentences." },
                  suggestions: {
                    type: "array",
                    description: "2 to 4 toggleable enhancements the admin might want.",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", description: "Short kebab-case id" },
                        label: { type: "string", description: "Short label, e.g. 'Add walkthrough hint'" },
                        description: { type: "string", description: "One sentence explaining what this adds" },
                        augmented_message: { type: "string", description: "The full message with this enhancement applied, still 2-4 sentences in Logan's voice." },
                      },
                      required: ["id", "label", "description", "augmented_message"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["title", "message", "suggestions"],
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
