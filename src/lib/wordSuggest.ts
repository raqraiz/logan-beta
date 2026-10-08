import { supabase } from "@/integrations/supabase/client";
import { GROUPED, SYMPTOM_GROUPS, aliasesOf, normSymptom, togetherNorm } from "@/lib/symptomCatalog";
import { suggestExistingSymptoms, type LibraryEntryLike } from "@/lib/symptomModeration";
import { loadWords, wordLabel, type TogetherWord } from "@/lib/togetherWords";

/** One "Did you mean" row. The label is the approved count label, or null when we have none. */
export interface WordSuggestion { name: string; label: string | null }

const MAX_ROWS = 3;
const SERVER_WAIT_MS = 7000;

/** Labels come from the server's own label for each shared word, never worked out here. */
function labelFor(name: string, words: TogetherWord[]): string | null {
  const k = togetherNorm(name);
  const w = words.find((x) => togetherNorm(x.word) === k);
  return w ? wordLabel(w) : null;
}

/**
 * Close matches on this device: the symptom list, its aliases and shared words, using the same
 * fuzzy match as the duplicate check. `extra` is where cross-language entries plug in.
 */
export function localSuggestions(word: string, words: TogetherWord[], extra: LibraryEntryLike[] = []): WordSuggestion[] {
  const q = normSymptom(word);
  if (q.length < 2) return [];
  const entries: LibraryEntryLike[] = [];
  for (const g of SYMPTOM_GROUPS) for (const n of GROUPED[g]) entries.push({ name: n, aliases: aliasesOf(n) });
  const known = new Set(entries.map((e) => togetherNorm(e.name)));
  for (const w of words) if (!known.has(togetherNorm(w.word))) entries.push({ name: w.word, aliases: [] });
  entries.push(...extra);
  return suggestExistingSymptoms(word, entries, MAX_ROWS + 1)
    .filter((e) => togetherNorm(e.name) !== togetherNorm(word))
    .slice(0, MAX_ROWS)
    .map((e) => ({ name: e.name, label: labelFor(e.name, words) }));
}

/** The existing word check, in suggest mode. Saves nothing. Any failure just means no suggestions. */
async function serverSuggestions(word: string, words: TogetherWord[]): Promise<WordSuggestion[]> {
  try {
    const call = supabase.functions.invoke("together-tip-submit", { body: { mode: "word", suggest: true, word } });
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), SERVER_WAIT_MS));
    const res = await Promise.race([call, timeout]);
    const matches = (res as { data?: { matches?: unknown } } | null)?.data?.matches;
    if (!Array.isArray(matches)) return [];
    return matches.filter((m): m is string => typeof m === "string").slice(0, MAX_ROWS).map((name) => ({ name, label: labelFor(name, words) }));
  } catch { return []; }
}

/** Local match first. The server is asked only when nothing matched locally. */
export async function findCloseWords(word: string): Promise<WordSuggestion[]> {
  const value = word.replace(/\s+/g, " ").trim();
  if (value.length < 2) return [];
  let words: TogetherWord[] = [];
  try { words = await loadWords(); } catch { /* shared words are optional */ }
  const local = localSuggestions(value, words);
  if (local.length) return local;
  return serverSuggestions(value, words);
}
