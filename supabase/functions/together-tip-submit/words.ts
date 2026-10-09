// Together words: checks and saves a woman's own symptom word. Same function as tips (one gate),
// separate mode. A word is never rewritten: it is shared as typed or it stays private.
import { MAX_NEW_WORDS_PER_DAY, guardWord, togetherNorm } from "../_shared/togetherWordGuard.ts";

export const CONSENT_V2 = "together-v2";
const BATCH = 6;
const AI_TIMEOUT_MS = 12000;
// Private for these reasons means "try again later". Everything else is final until she changes the word.
const RETRY_NOW = ["not_consented", "left", "no_logs"];
const RETRY_LATER = ["check_failed", "daily_limit"];
// Tracker widgets save structured names like "Discharge: Watery". Those are never her own words.
const TRACKER_VALUE = /^[^:]{1,40}:\s*\S/;

type Svc = any; // deno-lint-ignore no-explicit-any
interface LibEntry { canonical: string; retired: boolean }
export type WordOutcome = { status: "shared" | "private" | "rejected" | "library" | "pending"; reason?: string };

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["decision", "category", "library_match"],
  properties: {
    decision: { type: "string", enum: ["approve", "reject"] },
    category: { type: "string", enum: ["ok", "name", "place", "number", "link", "contact", "slur", "gibberish", "other"] },
    library_match: { type: "string" },
  },
};
const MATCH_SCHEMA = {
  type: "object", additionalProperties: false, required: ["library_match"],
  properties: { library_match: { type: "string" } },
};
const INSTRUCTIONS = `You check one short word or phrase a woman typed to name a symptom or feeling in a women's health app. Return JSON.
Never rewrite, shorten or clean it. Only decide.
decision "reject" when it contains a person's name, a place name, a number, a link, an email, a phone number or other contact detail, a slur or insult, or is gibberish (random letters, keyboard mashing, no meaning).
Use category "name", "place", "number", "link", "contact", "slur", "gibberish", or "other" for any other reason.
Words in any language and script are valid. Hebrew, Arabic, Russian, Spanish and every other language must never be called gibberish just because they are not English. Slang, misspellings and made-up but readable feelings are fine ("heavy legs", "can't sleep", "wired and tired").
decision "approve" with category "ok" otherwise.`;
const MATCH_RULES = `library_match: if the word clearly means exactly the same symptom as one entry in the library list below, return that entry's name exactly as written in the list. Otherwise return "".
Map only when the meaning is clearly the same. Do not map to a broader, narrower or merely related entry: "headache" is not Migraine, Fatigue is not Low energy, Sadness is not Low mood, Hot flashes is not fever. When unsure, return "".
Library list (one per line):`;

type Verdict = { decision: string; category: string; library_match: string };

// One gateway call for both jobs (checking a word, suggesting an existing one). Returns the parsed JSON or null.
async function runAi(instructions: string, schemaName: string, schema: unknown, input: string): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST", signal: ctrl.signal,
      headers: { "Lovable-API-Key": Deno.env.get("LOVABLE_API_KEY") ?? "", "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra", instructions, input, stream: true, store: false, reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
      }),
    });
    if (!r.ok || !r.body) { console.error("[word] gateway", r.status); return null; }
    let out = ""; let buf = "";
    const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.startsWith("data:")) continue;
        try { const ev = JSON.parse(l.slice(5).trim()); if (ev.type === "response.output_text.delta") out += ev.delta ?? ""; } catch { /* ignore */ }
      }
    }
    return JSON.parse(out);
  } catch (e) {
    console.error("[word] check failed", (e as Error).name);
    return null;
  } finally { clearTimeout(timer); }
}

/** Safety check plus "which library entry does this mean". Nothing from the word or the answer is logged. */
async function checkWord(word: string, names: string[]): Promise<Verdict | null> {
  const parsed = await runAi(`${INSTRUCTIONS}\n${MATCH_RULES}\n${names.join("\n")}`, "word_check", SCHEMA, word);
  return parsed && (parsed.decision === "approve" || parsed.decision === "reject")
    ? { decision: parsed.decision, category: String(parsed.category), library_match: typeof parsed.library_match === "string" ? parsed.library_match : "" }
    : null;
}

/** For words that already passed the safety check: only the library meaning. */
async function matchOnly(word: string, names: string[]): Promise<string | null> {
  const parsed = await runAi(`You match one short symptom word, in any language, to the symptom library of a women's health app. Return JSON.\n${MATCH_RULES}\n${names.join("\n")}`, "word_match", MATCH_SCHEMA, word);
  return parsed && typeof parsed.library_match === "string" ? parsed.library_match : null;
}

/** Names the AI may map to: live, non-retired canonical entries (merges already followed by the library map). */
function libraryNames(lib: Map<string, LibEntry>): string[] {
  return [...new Set([...lib.values()].filter((e) => !e.retired).map((e) => e.canonical))].sort();
}

/** Returns the exact library name only if it is on the list. Anything else counts as no match. */
function validMatch(match: string, names: string[]): string | null {
  const k = togetherNorm(match);
  return k ? names.find((n) => togetherNorm(n) === k) ?? null : null;
}

/** Saves a mapping unless this word was switched off by hand. Returns whether the word is mapped. */
async function saveMapping(service: Svc, wordKey: string, canonical: string): Promise<boolean> {
  const { data: cur } = await service.from("together_word_map").select("disabled").eq("word_key", wordKey).maybeSingle();
  if (cur?.disabled) return false;
  if (cur) return true;
  const { error } = await service.from("together_word_map").insert({ word_key: wordKey, canonical_name: canonical });
  if (error && error.code !== "23505") { console.error("[word] map", error.code); return false; }
  return true;
}

const SUGGEST_SCHEMA = {
  type: "object", additionalProperties: false, required: ["matches"],
  properties: { matches: { type: "array", maxItems: 3, items: { type: "string" } } },
};
const SUGGEST_INSTRUCTIONS = `A woman typed her own word for a symptom or feeling in a women's health app. You get her word, then a numbered list of words that already exist.
Return JSON with "matches": up to 3 words from the list that mean the same thing as hers, best first. Copy each one exactly as written in the list.
Consider typos and every language (Hebrew, Spanish, Arabic and others): a word in another language matches its meaning.
Only include a word when it plainly means the same thing. Return an empty list when nothing does. Never invent a word.`;

async function loadLibrary(service: Svc): Promise<Map<string, LibEntry>> {
  const { data } = await service.rpc("together_library_map");
  const m = new Map<string, LibEntry>();
  for (const r of (data ?? []) as { src: string; canonical: string; retired: boolean }[]) m.set(r.src, { canonical: r.canonical, retired: r.retired });
  return m;
}

export async function isV2Member(service: Svc, userId: string) {
  const { data } = await service.from("profiles").select("together_consent, together_consent_version, together_consent_at").eq("id", userId).maybeSingle();
  const ok = !!data?.together_consent && data?.together_consent_version === CONSENT_V2;
  return { ok, consentAt: data?.together_consent_at ? Date.parse(data.together_consent_at) : Date.now() };
}

const event = (service: Svc, name: string, reason?: string) =>
  service.rpc("_log_together_event", { _event: name, _reason: reason ?? null }).then(() => {}, () => {});

/** Checks one word and saves the result. Counts only, no word text, go to analytics. */
export async function processWord(
  service: Svc, userId: string, lib: Map<string, LibEntry>,
  input: { source: string; word: string; kind: "log" | "existing" | "rename" },
): Promise<WordOutcome> {
  const source = String(input.source ?? "").replace(/\s+/g, " ").trim();
  const guard = guardWord(input.word);
  const word = guard.value;
  const sourceKey = togetherNorm(source || word);
  const wordKey = togetherNorm(word);
  if (!sourceKey || !wordKey) return { status: "private", reason: "not_words" };

  // 1. Symptom library first: canonical entries, aliases and retired ones, by name.
  const hit = lib.get(wordKey);
  if (hit && !hit.retired) {
    await service.from("together_words").delete().eq("user_id", userId).eq("source_key", sourceKey);
    return { status: "library" };
  }

  const { data: existing } = await service.from("together_words").select("*").eq("user_id", userId).eq("source_key", sourceKey).maybeSingle();
  const sameWord = existing && existing.word_key === wordKey;
  if (sameWord && (existing.status === "shared" || existing.status === "rejected")) {
    return { status: existing.status, reason: existing.reject_category ?? undefined };
  }
  if (sameWord && existing.status === "private" && existing.reject_category === "removed") return { status: "private", reason: "removed" };

  const base = { user_id: userId, source_key: sourceKey, original_word: source || word, word, word_key: wordKey, kind: input.kind, updated_at: new Date().toISOString() };
  const save = async (status: string, category: string | null, checked: boolean) => {
    const row = { ...base, status, reject_category: category, checked_at: checked ? new Date().toISOString() : null, ...(status === "shared" ? { map_checked_at: new Date().toISOString() } : {}) };
    const { error } = await service.from("together_words").upsert(row, { onConflict: "user_id,source_key" });
    if (error) console.error("[word] save", error.code);
  };
  if (!existing || existing.status === "pending") await event(service, "word_submitted");

  if (hit?.retired) { await save("private", "retired", false); await event(service, "word_rejected", "retired"); return { status: "private", reason: "retired" }; }

  const { data: rv } = await service.from("together_word_review").select("blocked").eq("word_key", wordKey).maybeSingle();
  if (rv?.blocked) { await save("rejected", "removed_by_review", true); await event(service, "word_rejected", "removed_by_review"); return { status: "rejected", reason: "removed_by_review" }; }

  // 2. Library guardrails: length, all caps, blocklist, links, numbers. Refused words stay private.
  if (!guard.ok) { await save("rejected", guard.reason, false); await event(service, "word_rejected", guard.reason); return { status: "rejected", reason: guard.reason }; }

  // 3. New unmatched words: 3 per day. Words she already had before the change are exempt.
  if (input.kind !== "existing") {
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count } = await service.from("together_words").select("id", { count: "exact", head: true })
      .eq("user_id", userId).neq("kind", "existing").neq("source_key", sourceKey).gte("checked_at", since);
    if ((count ?? 0) >= MAX_NEW_WORDS_PER_DAY) { await save("private", "daily_limit", false); await event(service, "word_rejected", "daily_limit"); return { status: "private", reason: "daily_limit" }; }
  }

  // 4. AI check. A failed or timed out check never shares the word.
  const names = libraryNames(lib);
  const verdict = await checkWord(word, names);
  if (!verdict) { await save("private", "check_failed", false); await event(service, "word_rejected", "check_failed"); return { status: "private", reason: "check_failed" }; }
  if (verdict.decision !== "approve") {
    // A rejected word is never mapped, even if the AI also named a library entry.
    const cat = ["name", "place", "number", "link", "contact", "slur", "gibberish"].includes(verdict.category) ? verdict.category : "other";
    await save("rejected", cat, true); await event(service, "word_rejected", cat);
    return { status: "rejected", reason: cat };
  }
  // 5. Passed the safety check. If it clearly means a library entry, it counts toward that entry in Together.
  // Only when the word is exactly what is in her logs (a renamed word has no matching log text to count).
  const match = verdict.category === "ok" && wordKey === sourceKey ? validMatch(verdict.library_match, names) : null;
  if (match && await saveMapping(service, wordKey, match)) {
    await service.from("together_words").delete().eq("user_id", userId).eq("source_key", sourceKey);
    return { status: "library" };
  }
  await save("shared", null, true);
  await event(service, "word_shared");
  return { status: "shared" };
}

export async function handleWord(service: Svc, userId: string, body: { source?: string; word?: string; rename?: boolean }) {
  const word = String(body.word ?? "").trim();
  if (!word) return { status: 400, body: { error: "invalid" } };
  const member = await isV2Member(service, userId);
  if (!member.ok) return { status: 200, body: { status: "private", reason: "not_consented" } };
  const lib = await loadLibrary(service);
  const out = await processWord(service, userId, lib, { source: body.source || word, word, kind: body.rename ? "rename" : "log" });
  return { status: 200, body: out };
}

/** Collects her custom words from her logs (with her renames and removals), checks a batch, reports what is left. */
export async function handleSync(service: Svc, userId: string) {
  const member = await isV2Member(service, userId);
  if (!member.ok) return { status: 200, body: { status: "not_consented", processed: 0, remaining: 0 } };
  const lib = await loadLibrary(service);

  const seen = new Map<string, { text: string; first: number }>();
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await service.from("symptom_logs").select("symptoms, logged_at").eq("user_id", userId).order("logged_at", { ascending: true }).range(from, from + 999);
    if (error) return { status: 500, body: { error: "failed" } };
    for (const l of data ?? []) {
      const t = Date.parse(l.logged_at);
      for (const e of Array.isArray(l.symptoms) ? l.symptoms : []) {
        const name = typeof e === "string" ? e : e?.name;
        if (!name || typeof name !== "string" || (typeof e?.severity === "number" && e.severity < 0)) continue;
        if (TRACKER_VALUE.test(name.trim())) continue;
        const k = togetherNorm(name);
        if (!k || lib.get(k) && !lib.get(k)!.retired) continue;
        const cur = seen.get(k);
        if (!cur) seen.set(k, { text: name.trim(), first: t }); else cur.first = Math.min(cur.first, t);
      }
    }
    if ((data ?? []).length < 1000) break;
  }

  const [{ data: prefs }, { data: rows }] = await Promise.all([
    service.from("user_word_prefs").select("original_word, new_name, removed").eq("user_id", userId),
    service.from("together_words").select("source_key, word_key, word, status, reject_category, updated_at, map_checked_at").eq("user_id", userId),
  ]);
  const prefBy = new Map<string, { new_name: string | null; removed: boolean }>((prefs ?? []).map((p: any) => [togetherNorm(p.original_word), p]));
  const rowBy = new Map<string, any>((rows ?? []).map((r: any) => [r.source_key, r]));
  const hourAgo = Date.now() - 3600000;

  const todo: { source: string; word: string; kind: "existing" | "log" }[] = [];
  for (const [k, v] of seen) {
    const pref = prefBy.get(k);
    if (pref?.removed) continue;
    const word = pref?.new_name?.trim() || v.text;
    const wk = togetherNorm(word);
    const libHit = lib.get(wk);
    if (libHit && !libHit.retired) continue;
    const row = rowBy.get(k);
    if (row && row.word_key === wk) {
      if (row.status === "shared" || row.status === "rejected") continue;
      if (row.status === "private") {
        if (RETRY_LATER.includes(row.reject_category) && Date.parse(row.updated_at) > hourAgo) continue;
        if (![...RETRY_NOW, ...RETRY_LATER].includes(row.reject_category)) continue;
      }
    }
    todo.push({ source: v.text, word, kind: v.first < member.consentAt ? "existing" : "log" });
  }
  // Oldest words first so a long list drains in order.
  const batch = todo.slice(0, BATCH);
  let shared = 0;
  await Promise.all(batch.map(async (w) => { const o = await processWord(service, userId, lib, w); if (o.status === "shared") shared++; }));
  // One-time cross-language check of words she already shared (pending ones get it when checked above).
  const todoKeys = new Set(todo.map((t) => togetherNorm(t.source)));
  const recheck = (rows ?? []).filter((r: any) => r.status === "shared" && !r.map_checked_at && !todoKeys.has(r.source_key));
  const recheckBatch = recheck.slice(0, BATCH);
  if (recheckBatch.length) {
    const names = libraryNames(lib);
    await Promise.all(recheckBatch.map(async (r: any) => {
      const hit = lib.get(r.word_key);
      if (hit && !hit.retired) { await service.from("together_words").delete().eq("user_id", userId).eq("source_key", r.source_key); return; }
      if (r.word_key !== r.source_key) { await service.from("together_words").update({ map_checked_at: new Date().toISOString() }).eq("user_id", userId).eq("source_key", r.source_key); return; }
      const found = await matchOnly(r.word, names);
      if (found === null) return; // check failed: try again next time
      const match = validMatch(found, names);
      if (match && await saveMapping(service, r.word_key, match)) {
        await service.from("together_words").delete().eq("user_id", userId).eq("source_key", r.source_key);
      } else {
        await service.from("together_words").update({ map_checked_at: new Date().toISOString() }).eq("user_id", userId).eq("source_key", r.source_key);
      }
    }));
  }
  const remaining = Math.max(0, todo.length - batch.length) + Math.max(0, recheck.length - recheckBatch.length);
  return { status: 200, body: { status: "ok", processed: batch.length + recheckBatch.length, shared, remaining } };
}


/** Suggests up to 3 existing words that mean the same as hers. Saves nothing and logs no word text. */
export async function handleSuggest(service: Svc, userId: string, body: { word?: string }) {
  const none = { status: 200, body: { status: "suggest", matches: [] as string[] } };
  const guard = guardWord(String(body.word ?? ""));
  if (!guard.ok) return none;
  const member = await isV2Member(service, userId);
  if (!member.ok) return none;
  const lib = await loadLibrary(service);
  const names = new Map<string, string>(); // togetherNorm -> display name
  for (const v of lib.values()) if (!v.retired) names.set(togetherNorm(v.canonical), v.canonical);
  const { data: shared } = await service.from("together_words").select("word").eq("status", "shared").limit(400);
  for (const r of (shared ?? []) as { word: string }[]) if (!names.has(togetherNorm(r.word))) names.set(togetherNorm(r.word), r.word);
  names.delete(togetherNorm(guard.value));
  const list = [...names.values()];
  if (!list.length) return none;
  const out = await runAi(SUGGEST_INSTRUCTIONS, "word_suggest", SUGGEST_SCHEMA, `Her word: ${guard.value}\n\nExisting words:\n${list.map((w, i) => `${i + 1}. ${w}`).join("\n")}`);
  const picked = Array.isArray(out?.matches) ? (out.matches as unknown[]) : [];
  const matches: string[] = [];
  for (const m of picked) {
    const hit = typeof m === "string" ? names.get(togetherNorm(m)) : undefined;
    if (hit && !matches.includes(hit)) matches.push(hit);
  }
  return { status: 200, body: { status: "suggest", matches: matches.slice(0, 3) } };
}
