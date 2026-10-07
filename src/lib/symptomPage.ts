import { sameSymptom } from "@/lib/symptomCatalog";
import { DAY, groupCycles, symptomPoints, type LogRow } from "@/lib/patternCycles";

const DEFINITIONS: Record<string, string> = {
  cramps: "Cramps are a squeezing or aching feeling, often in your lower belly. During a period, they can happen as the womb's muscles tighten.",
  bloating: "Bloating is a feeling of fullness, pressure or swelling in your belly. Changes in digestion and fluid retention can play a part.",
  fatigue: "Fatigue is feeling unusually tired or drained, even when you have had some rest. Sleep, stress and hormone changes can all affect it.",
  "low energy": "Low energy is feeling less able to get going or keep going than usual. Sleep, daily demands and hormone changes can all play a part.",
  "high energy": "High energy is feeling more awake and ready to move or get things done than usual.",
  "lots of energy": "This is feeling more awake and ready to move or get things done than usual.",
  headache: "A headache is pain or pressure in your head. Sleep, tension, hydration and hormone changes can all play a part.",
  migraine: "A migraine is a type of headache that can come with nausea or sensitivity to light and sound. Some people also notice changes in their vision.",
  "breast tenderness": "Breast tenderness is soreness or sensitivity in the breasts. Changes in hormones and fluid retention can make them feel fuller or more sensitive.",
  "back pain": "Back pain is aching, stiffness or discomfort in your back. Muscles, posture and pain felt during a period can all play a part.",
  "joint pain": "Joint pain is soreness or stiffness where two bones meet. Movement, strain and inflammation can affect how it feels.",
  acne: "Acne is spots that form when skin pores become blocked. Oil production and hormone changes can influence when spots appear.",
  nausea: "Nausea is feeling as though you might be sick. Digestion, stress and hormone changes can all play a part.",
  anxiety: "Anxiety is feeling worried, tense or on edge. It can show up in your thoughts and in your body.",
  "brain fog": "Brain fog is feeling less clear mentally than usual. You may find it harder to focus, remember things or find the words you want.",
  "poor focus": "Poor focus is finding it harder to keep your attention on something. Sleep, stress and daily demands can all affect concentration.",
  "sharp focus": "Sharp focus is feeling able to concentrate and think clearly.",
  "clear head": "A clear head is feeling able to concentrate and think clearly.",
  irritability: "Irritability is feeling more easily bothered or frustrated than usual. Sleep, stress and hormone changes can affect your tolerance for things.",
  "mood swings": "Mood swings are changes in how you feel emotionally. Your mood may shift more quickly or feel stronger than usual.",
  sadness: "Sadness is feeling low, upset or heavy emotionally. How long it lasts and how much it affects your day matter more than any cycle timing.",
  overwhelm: "Overwhelm is feeling that more is being asked of you than you can comfortably manage right now.",
  restlessness: "Restlessness is finding it hard to settle, relax or stay still. You may feel it in your body or your thoughts.",
  "low motivation": "Low motivation is finding it harder to start or follow through on things, even when they matter to you.",
  "feeling confident": "Feeling confident is feeling more comfortable with yourself and more able to trust your choices.",
  insomnia: "Insomnia is difficulty falling asleep, staying asleep or getting back to sleep. It can leave you feeling less rested during the day.",
  "sleeping well": "Sleeping well means your sleep feels restful and you wake feeling reasonably refreshed.",
  "hot flashes": "Hot flashes are sudden waves of warmth, often felt in your face, neck or chest. They can come with flushing or sweating.",
  "night sweats": "Night sweats are sweating during sleep, sometimes enough to dampen your clothes or bedding.",
  spotting: "Spotting is a small amount of vaginal bleeding outside your usual period flow. It can have several causes, so new or unexplained spotting is worth discussing with a doctor.",
  cravings: "Cravings are a strong desire for a particular food. Hunger, sleep, stress and hormone changes can influence them.",
  thirst: "Thirst is your body's signal that it needs more fluid. Persistent or unusual thirst is worth checking with a doctor.",
  "dry skin": "Dry skin can feel tight, rough, flaky or itchy. Moisture loss and changes in skin oil can play a part.",
  "dehydrated skin": "Dehydrated skin is skin that feels short of moisture, often tight or less supple than usual.",
  "hearing loss": "Hearing loss is a change in how clearly you hear sounds or speech. It may affect one ear or both.",
  "muffled hearing": "Muffled hearing is when sounds seem quieter or less clear than usual. It may affect one ear or both.",
  tinnitus: "Tinnitus is hearing a sound, such as ringing or buzzing, when there is no outside source for it.",
};

export const SAFETY_NOTE = "If this is new or came on suddenly, check with a doctor soon.";
const SAFETY_RE = /\b(hearing|muffled|tinnitus|deaf|ear ringing|ringing in (my |the )?ears?|vision|sight|blurr|seeing spots|double vision|chest|severe headache|worst headache|migraine|faint|dizzy spells|pass(ed)? out|heavy bleeding|soak|hemorrhag|clots?\b|self.?harm|suicid|hurt myself|pregnan|swelling (in|of) (face|hands)|reduced (baby )?movement)/i;
/** Symptoms that always carry the doctor note (hearing or vision changes, chest pain, severe headache, heavy bleeding, fainting, pregnancy warning signs). */
export function isSafetySymptom(name: string): boolean { return SAFETY_RE.test(name.trim()); }

/** Only the written symptom page description, or null when there is none. */
export function knownSymptomDefinition(name: string): string | null {
  return DEFINITIONS[name.trim().toLowerCase()] ?? null;
}

export function symptomDefinition(name: string): { text: string; safety: string | null } {
  const key = name.trim().toLowerCase();
  const safety = isSafetySymptom(name) ? SAFETY_NOTE : null;
  return { safety, text: DEFINITIONS[key] ?? `“${name}” is the name you're using for this experience. What it feels like can vary from person to person.` };
}

export type SymptomPageLog = LogRow & { notes?: string | null };

/** Display complete short sentences only; never truncate medical advice or a biological claim. */
export function symptomCardInsights(texts: (string | null)[]) {
  const insights: string[] = [];
  let doctorAdvice: string | null = null;
  for (const text of texts) {
    for (const sentence of text?.match(/[^.!?]+[.!?]*/g) ?? []) {
      const clean = sentence.trim();
      if (!clean) continue;
      const short = !clean.includes(";") && clean.split(/\s+/).length <= 15;
      if (/\b(doctor|urgent care|medical care|emergency)\b/i.test(clean)) {
        doctorAdvice = short ? clean : /\b(sudden|today|urgent|emergency)\b/i.test(clean)
          ? "Seek medical care today if symptoms are sudden, severe or getting worse."
          : "See a doctor if symptoms are new, severe or lasting.";
      } else if (short && !insights.includes(clean)) insights.push(clean);
    }
  }
  return { insights: insights.slice(0, 3), doctorAdvice };
}

/** Read-only presentation: count all positive logs, but derive cycles with the same grouping as Your patterns. */
export function symptomPageData(logs: SymptomPageLog[], name: string, lastPeriodStart?: string, now = Date.now()) {
  const lower = name.trim().toLowerCase();
  const matching = logs.filter((r) => Array.isArray(r.symptoms) && r.symptoms.some((s: unknown) => {
    if (typeof s === "string") return sameSymptom(s, lower);
    if (!s || typeof s !== "object" || !("name" in s)) return false;
    return sameSymptom(String(s.name), lower) && (!("severity" in s) || typeof s.severity !== "number" || s.severity > 0);
  }));
  const points = symptomPoints(matching)[lower] ?? [];
  const groups = groupCycles(points);
  let trend: "Less" | "More" | "Same" | null = null;
  if (lastPeriodStart && groups.length >= 2) {
    const start = new Date(`${lastPeriodStart}T12:00:00Z`).getTime();
    const elapsed = Math.floor((now - start) / DAY) + 1;
    const current = groups.findIndex((g) => Math.abs(g.start - start) <= 10 * DAY);
    if (current === groups.length - 1 && current > 0 && elapsed > 0) {
      const a = groups[current].days.filter((d) => d <= elapsed).length;
      const b = groups[current - 1].days.filter((d) => d <= elapsed).length;
      if (a > 0 && b > 0) trend = a < b ? "Less" : a > b ? "More" : "Same";
    }
  }
  // Never infer that a generic note was helpful; require her explicit wording.
  const helped = matching.map((r) => r.notes?.match(/(?:^|[.!?]\s+)(?:what helped(?: me)?|helped by|what helped you):\s*([^.!?\n]+)/i)?.[1]?.trim()).find(Boolean) ?? null;
  return { count: matching.length, cycles: groups.length, trend, helped };
}