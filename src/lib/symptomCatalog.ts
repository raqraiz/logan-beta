/** One name per symptom, three groups shared by the Log sheet and Together. */
export type SymptomGroup = "Body" | "Mood & mind" | "Sleep & energy";
export const SYMPTOM_GROUPS: SymptomGroup[] = ["Body", "Mood & mind", "Sleep & energy"];

export const GROUPED: Record<SymptomGroup, string[]> = {
  Body: ["Acne", "Back pain", "Belly pressure", "Blebs", "Bloating", "Blood clots", "Body aches", "Body odor changes", "Breast tenderness", "Burning sensation", "Cervical position", "Chills", "Chin hairs", "Congestion", "Constipation", "Cough", "Cramps", "Cystic acne", "Diarrhea", "Discharge", "Dry skin", "Ear fullness", "Ear itchiness", "Eating habits", "Feeling faint", "Feverish", "Frequent urination", "Gas", "Gum sensitivity", "Hair shedding", "Hand pain (CTS)", "Headache", "Hearing loss", "Heartburn", "Heavy legs", "High fever", "Hot ear", "Hot flashes", "Hunger", "Inflammation", "Itchy eyes", "Itchy scalp", "Itchy skin", "Joint pain", "Libido", "Mastitis", "Muffled hearing", "Muscle tension", "Musky", "Nausea", "Ovulation", "Ovulation discharge", "Ovulation pain", "Pelvic floor heaviness", "Period flu", "Phantom bites", "Prickly throat", "Reaction to mosquito bites", "Redness", "Sensitive to smells", "Shaking", "Shortness of breath", "Skin flare", "Sneezing", "Sore throat", "Spotting", "Stabbing pain", "Stomach pain", "Swollen glands", "Thirst", "Tingly hands", "Tooth sensitivity", "Vaginal dryness", "Vaginal itching", "Vertigo", "Vulvar itchiness"],
  "Mood & mind": ["Anhedonia", "Anxiety", "Brain fog", "Confident", "Cravings", "Dissociative", "Emotional intensity", "Feeling alone", "Feeling fat", "Feeling hurt", "Feeling in body", "Feeling incompetent", "Feeling stuck", "Feeling surge", "Feeling thoughtful", "Feeling underwhelmed", "Guilt", "Irritability", "Low mood", "Low motivation", "Memory loss", "Mood swings", "Overwhelm", "Poor focus", "Positive shift", "Restlessness", "Shame", "Sharp focus", "Stress", "Sudden rage"],
  "Sleep & energy": ["Dreams and nightmares", "Fatigue", "High energy", "Night sweats", "Rested", "Sleepy", "Trouble sleeping"],
};

/** Main name to aliases (merges from the approved plan). */
export const MERGES: Record<string, string[]> = {
  Fatigue: ["Tiredness", "Tired", "Low energy", "Depleted", "Always tired", "Exceptionally tired", "Deep exhaustion", "Burnt out", "Muscle fatigue", "Weakness"],
  "Trouble sleeping": ["Insomnia", "Sleep deprived", "Poor sleep", "Difficulty sleeping", "Inability to sleep", "Lack of sleep"],
  Irritability: ["Short fuse", "Feeling reactive", "Short tempered", "Little patience", "Bitchy"],
  "Sudden rage": ["Shaking from anger", "Rage", "Yelling"],
  "Low mood": ["Sadness", "Bad mood", "Depressed", "Feeling crappy", "Feeling awful", "Dislike self", "Melancholy days"],
  "Low motivation": ["Lack of motivation", "Unmotivated"],
  Overwhelm: ["Feeling of overload", "Overstimulated"],
  Restlessness: ["Jittery", "Wired"],
  "Stomach pain": ["Abdominal pain", "Stomach cramps"],
  Acne: ["Breakouts", "Back breakout", "Shoulder breakout"],
  "Dry skin": ["Dehydrated skin"],
  "Itchy skin": ["Back itchiness"],
  "Breast tenderness": ["Nipples hurting", "Sensitive nipples", "Swollen breasts", "Nipple tenderness while nursing", "Painful breast"],
  Spotting: ["Spotty bleeding", "Breakthrough bleeding", "Bleeding"],
  Feverish: ["Low grade fever"],
  "Hot flashes": ["Hot", "Overheating"],
  Hunger: ["Starving"],
  Diarrhea: ["Soft stools", "Loose stool"],
  "Ovulation discharge": ["Egg white", "Slippery cervical fluid", "Ewcm"],
  "Ovulation pain": ["Mittelschmerz", "Ovulation cramps"],
  Cramps: ["Crampy", "Slight cramping", "Mild cramp", "Heavy cramping", "Back cramps"],
  Vertigo: ["Dizzy", "Room spinning", "Dizzy spells"],
  "Sensitive to smells": ["Sensitivity to smell", "Highly sensitive smell"],
  "Body aches": ["Achey", "Throbbing feet", "Achy hips"],
  "Hand pain (CTS)": ["🖐🏻CTS pain", "CTS pain"],
  "Emotional intensity": ["Emotional", "Random crying", "Super emotional"],
  Anxiety: ["Feeling scared", "Dread"],
  Stress: ["Feeling stressed"],
  Headache: ["Pain above eye", "Head hurts"],
  Cravings: ["Sugar craving", "Carb craving", "Salt craving", "Feeling snacky"],
  "Joint pain": ["Knee pain"],
  Heartburn: ["Indigestion"],
  Thirst: ["Dehydrated"],
  Libido: ["Horny"],
  "Positive shift": ["Feeling steady", "Feeling lighter", "Feeling brighter", "Feeling relieved", "Physically lighter"],
  Dissociative: ["Feeling of spiraling", "Feeling out there", "Feeling quiet"],
  "Body odor changes": ["Ammonia smell"],
};

export const normSymptom = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
export const sentenceCase = (s: string) => { const t = s.trim().replace(/\s+/g, " "); return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t; };

const ALIAS = new Map<string, string>();
const GROUP_OF = new Map<string, SymptomGroup>();
const MAIN = new Map<string, string>();
for (const g of SYMPTOM_GROUPS) for (const n of GROUPED[g]) { GROUP_OF.set(normSymptom(n), g); MAIN.set(normSymptom(n), n); }
for (const [main, aliases] of Object.entries(MERGES)) for (const a of aliases) ALIAS.set(normSymptom(a), main);

/** Server aliases loaded at runtime extend the built-in ones. */
export function registerAliases(rows: { alias: string; main_name: string }[]) {
  for (const r of rows) {
    const main = MAIN.get(normSymptom(r.main_name)) ?? sentenceCase(r.main_name);
    if (normSymptom(r.alias) !== normSymptom(main)) ALIAS.set(normSymptom(r.alias), main);
  }
}

/** Display main name for any logged or typed name. Unknown names come back in sentence case. */
export function canonicalSymptom(name: string): string {
  const k = normSymptom(name);
  return ALIAS.get(k) ?? MAIN.get(k) ?? sentenceCase(name);
}
export const isKnownSymptom = (name: string) => { const k = normSymptom(name); return ALIAS.has(k) || MAIN.has(k); };
export const groupOf = (name: string): SymptomGroup | null => GROUP_OF.get(normSymptom(canonicalSymptom(name))) ?? null;
export const sameSymptom = (a: string, b: string) => normSymptom(canonicalSymptom(a)) === normSymptom(canonicalSymptom(b));
/** Aliases that lead to a main name, for search. */
export function aliasesOf(main: string): string[] {
  const out: string[] = [];
  ALIAS.forEach((m, a) => { if (normSymptom(m) === normSymptom(main)) out.push(a); });
  return out;
}

let loaded: Promise<void> | null = null;
export function loadAliases(): Promise<void> {
  if (!loaded) loaded = import("@/integrations/supabase/client").then(async ({ supabase }) => {
    const { data } = await supabase.from("symptom_aliases").select("alias, main_name");
    registerAliases((data ?? []) as any);
  }).catch(() => {});
  return loaded;
}
