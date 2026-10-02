// Things she has told Logan about herself (e.g. corrections to an insight).
// Fed into every AI surface so a correction sticks.
// deno-lint-ignore no-explicit-any
type Client = any;

export const CORRECTION_PREFIX_RE = /^\s*that'?s not quite right\s*:/i;

export async function fetchMemoryNotes(client: Client, userId: string): Promise<string[]> {
  try {
    const { data } = await client
      .from("user_memory_notes")
      .select("note")
      .eq("user_id", userId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(15);
    return (data ?? []).map((r: { note: string }) => r.note);
  } catch {
    return [];
  }
}

export function buildMemoryBlock(notes: string[]): string {
  if (!notes.length) return "";
  return `\n\nWHAT SHE HAS TOLD YOU ABOUT HERSELF (her own corrections; these override general cycle patterns, never contradict them):\n${notes.map((n) => `- ${n}`).join("\n")}`;
}

/** Turns her correction into a short note, or flags that it's unclear. */
export async function extractCorrection(
  insight: string,
  correction: string,
  apiKey: string,
): Promise<{ clear: true; note: string } | { clear: false } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        temperature: 0,
        max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "A woman's health assistant showed her an insight about her body. She replied that it isn't quite right.",
              'Return json {"clear":true,"note":"..."} or {"clear":false}.',
              "note: one plain sentence in third person about what is true for her, max 25 words, e.g. \"Her energy dips before her period, not after.\"",
              "Only use what she actually said. No medication. If her reply doesn't say what is actually true for her, return clear:false.",
            ].join("\n"),
          },
          { role: "user", content: `INSIGHT:\n${insight.slice(0, 1200)}\n\nHER REPLY:\n${correction.slice(0, 800)}` },
        ],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) { console.warn("[correction] gateway", res.status, await res.text()); return null; }
    const json = await res.json();
    const raw = String(json?.choices?.[0]?.message?.content ?? "");
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const p = JSON.parse(m[0]);
    if (p?.clear === true && typeof p.note === "string" && p.note.trim()) {
      return { clear: true, note: p.note.trim().slice(0, 300) };
    }
    return { clear: false };
  } catch (e) {
    console.warn("[correction] failed", (e as Error).message);
    return null;
  }
}
