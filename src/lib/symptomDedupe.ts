// Client-side mirror of the fuzzy symptom dedup used in the chat edge function.
// Manual "add to shared list" entries used to bypass it entirely, which is how
// near-duplicates ("cranky" / "crankiness", "chin hair" / "chin hairs") kept
// landing in the community library.

const SYMPTOM_SYNONYM_ROOTS: Record<string, string> = {
  tired: "fatigue", tiredness: "fatigue", exhausted: "fatigue", exhaustion: "fatigue",
  fatigued: "fatigue", drained: "fatigue", sleepy: "fatigue", knackered: "fatigue",
  lethargy: "fatigue", lethargic: "fatigue", wiped: "fatigue", worn: "fatigue",
  ache: "pain", aching: "pain", achy: "pain", achey: "pain", sore: "pain", soreness: "pain",
  painful: "pain", hurting: "pain", hurt: "pain", hurts: "pain",
  nauseous: "nausea", nauseated: "nausea", queasy: "nausea", sick: "nausea",
  anxious: "anxiety", anxiousness: "anxiety", nervy: "anxiety", worried: "anxiety",
  worry: "anxiety", panicky: "anxiety",
  sad: "low mood", sadness: "low mood", depressed: "low mood", depression: "low mood",
  down: "low mood", blue: "low mood", low: "low mood", weepy: "low mood", tearful: "low mood",
  irritable: "irritability", irritated: "irritability", cranky: "irritability",
  crankiness: "irritability", angry: "irritability", anger: "irritability",
  rage: "irritability", snappy: "irritability",
  bloated: "bloating", bloat: "bloating", puffy: "bloating",
  cramp: "cramps", cramping: "cramps", crampy: "cramps",
  dizzy: "dizziness", lightheaded: "dizziness", woozy: "dizziness",
  headachy: "headache", migraine: "headache", migraines: "headache",
  insomnia: "poor sleep", sleepless: "poor sleep", restless: "poor sleep",
  foggy: "brain fog", fog: "brain fog", fuzzy: "brain fog", unfocused: "brain fog",
  craving: "cravings", hungry: "cravings", hunger: "cravings",
  munchies: "cravings", munchy: "cravings",
  happier: "brighter", happy: "brighter", happiness: "brighter", bright: "brighter",
};

function stemWord(w: string): string {
  let x = w.toLowerCase();
  if (SYMPTOM_SYNONYM_ROOTS[x]) return SYMPTOM_SYNONYM_ROOTS[x];
  for (const suf of ["iness", "ness", "ings", "ing", "ies", "ied", "eds", "ed", "es", "s"]) {
    if (x.length - suf.length >= 4 && x.endsWith(suf)) {
      x = x.slice(0, x.length - suf.length);
      if (suf === "ies" || suf === "ied") x += "y";
      break;
    }
  }
  if (/([bdgklmnprt])\1$/.test(x)) x = x.slice(0, -1);
  return SYMPTOM_SYNONYM_ROOTS[x] ?? x;
}

const DEDUP_FILLER_WORDS = new Set([
  "feeling", "feel", "felt", "a", "an", "the", "of", "my", "some", "very", "really",
  "so", "too", "being", "is", "are", "and", "in", "on", "at", "lots", "lot",
]);

export function canonicalSymptomKey(name: string): string {
  const words = String(name || "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .filter((w) => !DEDUP_FILLER_WORDS.has(w))
    .map(stemWord)
    .flatMap((w) => w.split(/\s+/));
  const uniq = Array.from(new Set(words)).sort();
  return (uniq.length ? uniq : [String(name || "").trim().toLowerCase()]).join(" ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (!longest) return 1;
  return 1 - levenshtein(a, b) / longest;
}

/** Returns the existing library name this candidate duplicates, or null. */
export function findNearDuplicate(candidate: string, existing: string[]): string | null {
  const key = canonicalSymptomKey(candidate);
  if (!key) return null;
  for (const e of existing) {
    const ek = canonicalSymptomKey(e);
    if (!ek) continue;
    if (ek === key) return e;
    if (Math.abs(ek.length - key.length) <= 4 && similarity(ek, key) >= 0.85) return e;
    if (!ek.includes(" ") && !key.includes(" ") && (ek.startsWith(key) || key.startsWith(ek))
      && Math.min(ek.length, key.length) >= 5) return e;
  }
  return null;
}
