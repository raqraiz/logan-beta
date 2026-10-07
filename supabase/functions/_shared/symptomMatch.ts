// Server-side symptom matching against the full symptom list + symptom_aliases.
// Mirrors canonicalSymptom() in src/lib/symptomCatalog.ts: every alias maps to
// one main name. No separate keyword list.

export type AliasRow = { alias: string; main_name: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function buildCatalog(aliases: AliasRow[], mainNames: string[] = []): Map<string, string> {
  const m = new Map<string, string>();
  for (const n of mainNames) if (n && norm(n).length >= 3) m.set(norm(n), n.trim());
  for (const r of aliases) {
    if (!r?.alias || !r?.main_name) continue;
    const main = m.get(norm(r.main_name)) ?? r.main_name.trim();
    m.set(norm(r.main_name), main);
    if (norm(r.alias).length >= 3) m.set(norm(r.alias), main);
  }
  return m;
}

const NEG_BEFORE = /\b(no|not|never|without|nor|zero|free of|isn'?t|wasn'?t|don'?t have|didn'?t have|no more)\b[^.!?;]*$/i;
const CONTRAST = /^.*\b(but|though|however|yet|still|except)\b/i;
function negated(before: string): boolean {
  const tail = before.replace(CONTRAST, "");
  return NEG_BEFORE.test(tail);
}

/** Symptoms named in the text, canonical main names, longest phrase first, negated mentions skipped. */
export function matchSymptoms(text: string, catalog: Map<string, string>): string[] {
  const low = text.toLowerCase();
  const keys = [...catalog.keys()].sort((a, b) => b.length - a.length);
  const taken: [number, number][] = [];
  const out: string[] = [];
  for (const k of keys) {
    const rx = new RegExp(`(^|[^a-z])(${esc(k)})(e?s)?(?![a-z])`, "g");
    let mm: RegExpExecArray | null;
    while ((mm = rx.exec(low)) !== null) {
      const start = mm.index + mm[1].length;
      const end = start + mm[2].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      if (negated(low.slice(Math.max(0, start - 50), start))) continue;
      const main = catalog.get(k)!;
      if (!out.includes(main)) out.push(main);
    }
  }
  return out;
}

/** Loads the catalog once per invocation from symptom_aliases (main names are rows too). */
// deno-lint-ignore no-explicit-any
export async function loadCatalog(supabase: any): Promise<Map<string, string>> {
  try {
    const { data } = await supabase.from("symptom_aliases").select("alias, main_name").limit(5000);
    return buildCatalog((data ?? []) as AliasRow[]);
  } catch {
    return new Map();
  }
}
