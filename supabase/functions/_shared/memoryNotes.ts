// Things she has told Logan about herself (e.g. corrections to an insight).
// Fed into every AI surface so a correction sticks.
// deno-lint-ignore no-explicit-any
type Client = any;

export const CORRECTION_PREFIX_RE = /^\s*that'?s not quite right\s*:/i;

export interface MemoryNotes { corrections: string[]; confirmed: string[] }

export async function fetchMemoryNotes(client: Client, userId: string): Promise<MemoryNotes> {
  try {
    const { data } = await client
      .from("user_memory_notes")
      .select("note, source")
      .eq("user_id", userId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(25);
    const rows = (data ?? []) as { note: string; source: string }[];
    return {
      corrections: rows.filter((r) => r.source !== "insight_confirmed").map((r) => r.note).slice(0, 15),
      confirmed: rows.filter((r) => r.source === "insight_confirmed").map((r) => r.note).slice(0, 10),
    };
  } catch {
    return { corrections: [], confirmed: [] };
  }
}

export function buildMemoryBlock(notes: MemoryNotes): string {
  let out = "";
  if (notes.corrections.length) {
    out += `\n\nWHAT SHE HAS TOLD YOU ABOUT HERSELF (her own corrections; these override everything else, including confirmed patterns below, any pattern you inferred from her data, and general cycle patterns. Never contradict them, and never resurface a pattern she corrected unless she brings it up):\n${notes.corrections.map((n) => `- ${n}`).join("\n")}`;
  }
  if (notes.confirmed.length) {
    out += `\n\nPATTERNS SHE CONFIRMED ARE TRUE FOR HER (treat as reliable, lower priority than her corrections above; refer to them naturally, don't repeat them every time):\n${notes.confirmed.map((n) => `- ${n}`).join("\n")}`;
  }
  return out;
}

/** Turns an insight she confirmed into a short second-person note. */
export async function extractConfirmedPattern(insight: string, apiKey: string): Promise<string | null> {
  const raw = await streamModel(
    [
      "A woman's health assistant showed her an insight about her body and she confirmed it is right.",
      'Return only json {"note":"..."} or {"note":null} if the insight states no pattern about her.',
      'note: one plain sentence in second person stating the pattern, max 25 words, no em dashes, no medication, e.g. "Headaches tend to show up about two days before your period."',
    ].join("\n"),
    `INSIGHT:\n${insight.slice(0, 1200)}`,
    apiKey,
  );
  if (!raw) return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[0]);
    return typeof p?.note === "string" && p.note.trim() ? p.note.trim().replace(/\s*\u2014\s*/g, ", ").slice(0, 300) : null;
  } catch { return null; }
}

async function streamModel(instructions: string, input: string, apiKey: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra", instructions, input, stream: true, store: false,
        reasoning: { effort: "low", summary: "auto" }, include: ["reasoning.encrypted_content"],
      }),
    });
    if (!res.ok || !res.body) { console.warn("[memory] gateway", res.status, await res.text()); return null; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", raw = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          if (ev.type === "response.output_text.delta") raw += ev.delta ?? "";
          if (ev.type === "response.failed" || ev.type === "error") return null;
        } catch { /* partial line */ }
      }
    }
    return raw;
  } catch (e) {
    console.warn("[memory] model failed", (e as Error).message);
    return null;
  } finally { clearTimeout(timer); }
}

/** Turns her correction into a short note, or flags that it's unclear. */
export async function extractCorrection(
  insight: string,
  correction: string,
  apiKey: string,
): Promise<{ clear: true; note: string } | { clear: false } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const system = [
      "A woman's health assistant showed her an insight about her body. She replied that it isn't quite right.",
      'Return only json {"clear":true,"note":"..."} or {"clear":false}.',
      "note: one plain sentence in third person about what is true for her, max 25 words, e.g. \"Her energy dips before her period, not after.\"",
      "Only use what she actually said. No medication. If her reply doesn't say what is actually true for her, return clear:false.",
    ].join("\n");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        instructions: system,
        input: `INSIGHT:\n${insight.slice(0, 1200)}\n\nHER REPLY:\n${correction.slice(0, 800)}`,
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
      }),
    });
    if (!res.ok || !res.body) { clearTimeout(timer); console.warn("[correction] gateway", res.status, await res.text()); return null; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", raw = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          if (ev.type === "response.output_text.delta") raw += ev.delta ?? "";
          if (ev.type === "response.failed" || ev.type === "error") { clearTimeout(timer); return null; }
        } catch { /* partial line */ }
      }
    }
    clearTimeout(timer);
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

/**
 * After a new note is saved, deactivates older active notes about the same topic
 * (e.g. a confirmed pattern she later corrected, or vice versa) so only her latest version stays active.
 * Never throws; on any failure the older notes are simply left as they are.
 */
export async function supersedeSameTopic(client: Client, userId: string, newNoteId: string, newNote: string, apiKey: string): Promise<void> {
  try {
    const { data } = await client.from("user_memory_notes").select("id, note")
      .eq("user_id", userId).eq("active", true).in("source", ["insight_confirmed", "insight_correction"])
      .neq("id", newNoteId).order("created_at", { ascending: false }).limit(30);
    const older = (data ?? []) as { id: string; note: string }[];
    if (!older.length) return;
    const raw = await streamModel(
      [
        "You compare short notes about one woman's body and cycle.",
        "Given a NEW note and a numbered list of OLDER notes, return the numbers of older notes about the SAME topic (same symptom or experience and timing question), which the new note replaces.",
        "Different symptoms or unrelated topics are NOT the same topic. When unsure, leave it out.",
        'Return only json {"same":[numbers]}.',
      ].join("\n"),
      `NEW:\n${newNote}\n\nOLDER:\n${older.map((o, i) => `${i + 1}. ${o.note}`).join("\n")}`,
      apiKey,
    );
    const m = raw?.match(/\{[\s\S]*\}/);
    if (!m) return;
    const nums: unknown = JSON.parse(m[0])?.same;
    if (!Array.isArray(nums)) return;
    const ids = nums.map((n) => older[Number(n) - 1]?.id).filter(Boolean) as string[];
    if (!ids.length) return;
    const { error } = await client.from("user_memory_notes").update({ active: false }).eq("user_id", userId).in("id", ids);
    if (error) console.warn("[memory] supersede update failed", error.message);
  } catch (e) {
    console.warn("[memory] supersede failed", (e as Error).message);
  }
}
