import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Suppress the big inline cycle circle card when the triggering user message
// is long or emotionally loaded — the visual should not dominate a support moment.
// Home tab ring / cycle data logic are untouched; only the inline chat visual is gated.
function isEmotionalOrHeavyMessage(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  const words = t.trim().split(/\s+/).filter(Boolean).length;
  if (words > 100) return true;
  if (/\b(worried|anxious|scared|overwhelmed|exhausted|struggling|hoping|bated breath|kinda scared|kinda worried)\b/.test(t)) return true;
  if (/\b(postpartum|post-partum|pregnancy|pregnant|miscarriage|pregnancy loss|iud|coil)\b/.test(t)) return true;
  return false;
}

function cycleVisualMeta(userMessage: string) {
  if (isEmotionalOrHeavyMessage(userMessage)) {
    return { has_cycle_visual: false, cycle_visual_suppressed_emotional: true } as const;
  }
  return { has_cycle_visual: true, visual_type: "cycle_circle" } as const;
}



function parseExplicitCalendarDate(dateStr: string, referenceDate = new Date()): Date | null {
  const raw = dateStr.trim().replace(/\s+/g, " ");
  if (!raw) return null;

  if (/^today$/i.test(raw)) return new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate(), 12));
  if (/^yesterday$/i.test(raw)) {
    const d = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate(), 12));
    d.setUTCDate(d.getUTCDate() - 1);
    return d;
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const result = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], 12));
    return result.getUTCFullYear() === +iso[1] && result.getUTCMonth() === +iso[2] - 1 && result.getUTCDate() === +iso[3]
      ? result
      : null;
  }

  const dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const day = +dmy[1];
    const month = +dmy[2];
    let year = +dmy[3];
    if (year < 100) year += 2000;
    const result = new Date(Date.UTC(year, month - 1, day, 12));
    return result.getUTCFullYear() === year && result.getUTCMonth() === month - 1 && result.getUTCDate() === day
      ? result
      : null;
  }

  const monthMap: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };
  const mdy = raw.match(/^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s*(\d{2,4}))?$/i);
  if (mdy) {
    const month = monthMap[mdy[1].toLowerCase()];
    const day = +mdy[2];
    let year = mdy[3] ? +mdy[3] : referenceDate.getUTCFullYear();
    if (year < 100) year += 2000;
    let result = new Date(Date.UTC(year, month, day, 12));
    if (!mdy[3] && result.getTime() > referenceDate.getTime()) {
      result = new Date(Date.UTC(year - 1, month, day, 12));
    }
    return result.getUTCMonth() === month && result.getUTCDate() === day ? result : null;
  }

  return null;
}

function dateOnly(date: Date): string {
  return date.toISOString().split("T")[0];
}

function parseDateOnly(dateStr: string): Date | null {
  return parseExplicitCalendarDate(dateStr);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatUtcDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toISOString().slice(0, 10);
}

function getReferencedMonthRanges(message: string, referenceDate = new Date()) {
  const monthIndex: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };
  const ranges = new Map<string, { label: string; start: Date; end: Date }>();
  const addMonth = (month: number, year: number) => {
    const start = new Date(Date.UTC(year, month, 1, 0, 0, 0));
    const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0));
    ranges.set(`${year}-${month}`, { label: `${MONTH_NAMES[month]} ${year}`, start, end });
  };

  const monthRx = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = monthRx.exec(message)) !== null) {
    const month = monthIndex[match[1].toLowerCase()];
    let year = match[2] ? +match[2] : referenceDate.getUTCFullYear();
    if (!match[2] && month > referenceDate.getUTCMonth()) year -= 1;
    addMonth(month, year);
  }

  if (/\blast month\b/i.test(message)) {
    const month = referenceDate.getUTCMonth() === 0 ? 11 : referenceDate.getUTCMonth() - 1;
    const year = referenceDate.getUTCMonth() === 0 ? referenceDate.getUTCFullYear() - 1 : referenceDate.getUTCFullYear();
    addMonth(month, year);
  }

  return Array.from(ranges.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
}

const SYMPTOM_KEYWORDS: { name: string; patterns: RegExp[] }[] = [
  { name: "Cramps", patterns: [/\bcramp(s|ing|y)?\b/i, /\bperiod pain\b/i] },
  { name: "Bloating", patterns: [/\bbloat(ed|ing)?\b/i] },
  { name: "Headache", patterns: [/\bheadache(s)?\b/i, /\bmigraine(s)?\b/i] },
  { name: "Fatigue", patterns: [/\bfatigue(d)?\b/i, /\bexhaust(ed|ion)\b/i, /\bso tired\b/i, /\bwiped out\b/i, /\bdrained\b/i] },
  { name: "Back pain", patterns: [/\bback pain\b/i, /\bbackache\b/i, /\blower back\b/i] },
  { name: "Breast tenderness", patterns: [/\bbreast(s)?\s+(tender|sore|hurt)/i, /\bsore breasts?\b/i, /\btender breasts?\b/i] },
  { name: "Nausea", patterns: [/\bnausea(ted|ous)?\b/i, /\bqueasy\b/i, /\bnauseous\b/i] },
  { name: "Acne", patterns: [/\bacne\b/i, /\bbreak(ing )?out\b/i, /\bpimples?\b/i, /\bzits?\b/i, /\bwhiteheads?\b/i, /\bblemishes\b/i] },
  { name: "Joint pain", patterns: [/\bjoint(s)? (pain|ache|hurt)/i, /\bachy joints\b/i] },
  { name: "Insomnia", patterns: [/\binsomnia\b/i, /\bcan'?t sleep\b/i, /\btrouble sleeping\b/i, /\bsleepless\b/i, /\blay in bed for hours\b/i, /\bslept\s+(?:for\s+)?\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?)?\b/i] },
  { name: "Mood swings", patterns: [/\bmood swing(s)?\b/i, /\bmoody\b/i, /\bemotional roller ?coaster\b/i] },
  { name: "Anxiety", patterns: [/\banxious\b/i, /\banxiety\b/i, /\bon edge\b/i, /\bpanick(y|ing)\b/i] },
  { name: "Irritability", patterns: [/\birritabl(e|y)\b/i, /\birritated\b/i, /\bsnappy\b/i, /\bshort temper(ed)?\b/i, /\bcranky\b/i] },
  { name: "Brain fog", patterns: [/\bbrain fog(gy)?\b/i, /\bfoggy\b/i, /\bcan'?t (think|focus|concentrate)\b/i] },
  { name: "Low motivation", patterns: [/\blow motivation\b/i, /\bunmotivated\b/i, /\bno motivation\b/i, /\bcan'?t get going\b/i] },
  { name: "Sadness", patterns: [/\b(feeling|feel|so|really|been)\s+sad\b/i, /\bsadness\b/i, /\bcrying\b/i, /\btearful\b/i, /\b(feeling|feel|been)\s+down\b/i, /\b(feeling|feel)\s+blue\b/i] },
  { name: "Restlessness", patterns: [/\brestless\b/i, /\bantsy\b/i, /\bcan'?t sit still\b/i] },
  { name: "Overwhelm", patterns: [/\boverwhelmed\b/i, /\boverwhelm\b/i, /\btoo much\b/i] },
  { name: "High energy", patterns: [/\bhigh energy\b/i, /\benergized\b/i, /\bso much energy\b/i] },
  { name: "Low energy", patterns: [/\blow energy\b/i, /\bno energy\b/i, /\bsluggish\b/i, /\blethargic\b/i] },
  { name: "Sharp focus", patterns: [/\bsharp focus\b/i, /\blaser focus(ed)?\b/i, /\bvery focused\b/i] },
  { name: "Poor focus", patterns: [/\bpoor focus\b/i, /\bcan'?t focus\b/i, /\bdistracted\b/i, /\bunfocused\b/i] },
  { name: "Cravings", patterns: [/\bcravings?\b/i, /\bcraving (sugar|chocolate|carbs|salt)/i] },
  { name: "Hot flashes", patterns: [/\bhot flash(es)?\b/i, /\bhot flush(es)?\b/i] },
  { name: "Night sweats", patterns: [/\bnight sweats?\b/i, /\bsweating at night\b/i] },
  { name: "Spotting", patterns: [/\bspotting\b/i, /\blight bleeding\b/i] },
  { name: "Dehydrated skin", patterns: [/\bdehydrated skin\b/i, /\bskin (feels |is )?dehydrated\b/i] },
  { name: "Dry skin", patterns: [/\bdry skin\b/i, /\bskin (feels |is )?(really |very )?dry\b/i, /\bflaky skin\b/i] },
  { name: "Thirst", patterns: [/\bvery thirsty\b/i, /\bso thirsty\b/i, /\bcan'?t stop drinking\b/i] },
];

// Stopwords that must never be treated as symptom names, even if a community
// library entry happens to contain them or a token match would otherwise fire.
// "about" appears in nearly every conversational question ("what about X",
// "how about Y", "what's that about") and was causing the symptom-question
// early return to render "About can sometimes make sense..." — invalid output.
const SYMPTOM_STOPWORDS = new Set<string>([
  "about", "it", "this", "that", "things", "stuff", "something", "anything",
  "today", "phase", "cycle", "period", "body", "food", "mentally", "generally",
]);

function isSymptomStopword(name: string | null | undefined): boolean {
  if (!name) return true;
  return SYMPTOM_STOPWORDS.has(String(name).trim().toLowerCase());
}

function detectSymptomMentions(text: string): { name: string; severity: number }[] {
  const detected: { name: string; severity: number }[] = [];
  for (const { name, patterns } of SYMPTOM_KEYWORDS) {
    if (patterns.some(p => p.test(text))) {
      let severity = 3;
      if (/\b(mild|minor|slight|tiny|barely|a bit|a little)\b/i.test(text)) severity = 2;
      if (/\b(very mild|barely)\b/i.test(text)) severity = 1;
      if (/\b(bad|strong|heavy|really|pretty|quite)\b/i.test(text)) severity = 4;
      if (/\b(severe|terrible|awful|worst|excruciating|unbearable|killing me|so bad)\b/i.test(text)) severity = 5;
      detected.push({ name, severity });
    }
  }
  return detected;
}

function normalizeSymptomText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function mentionsKnownLibrarySymptom(text: string, knownLibraryNames: string[]): boolean {
  const normalizedText = ` ${normalizeSymptomText(text)} `;
  if (!normalizedText.trim()) return false;

  return knownLibraryNames.some((rawName) => {
    const normalizedName = normalizeSymptomText(String(rawName || ""));
    if (!normalizedName) return false;
    if (isSymptomStopword(normalizedName)) return false;

    // Exact multi-word library names, e.g. "mood swings".
    if (normalizedText.includes(` ${normalizedName} `)) return true;

    // Community names may be stored as variants like "Sudden Rage" while the
    // user asks "what about rage". For question-framing only, allow a strong
    // single-token match so every known symptom library term gets the same veto.
    const strongTokens = normalizedName
      .split(" ")
      .filter((token) => token.length >= 4 && !isSymptomStopword(token));
    return strongTokens.some((token) => normalizedText.includes(` ${token} `));
  });
}

function getKnownLibrarySymptomLabel(text: string, knownLibraryNames: string[]): string | null {
  const detected = detectSymptomMentions(text);
  if (detected.length > 0 && !isSymptomStopword(detected[0].name)) {
    return detected[0].name.toLowerCase();
  }

  const normalizedText = ` ${normalizeSymptomText(text)} `;
  for (const rawName of knownLibraryNames) {
    const normalizedName = normalizeSymptomText(String(rawName || ""));
    if (!normalizedName || isSymptomStopword(normalizedName)) continue;
    if (normalizedText.includes(` ${normalizedName} `)) return normalizedName;

    const strongToken = normalizedName
      .split(" ")
      .find((token) => token.length >= 4 && !isSymptomStopword(token) && normalizedText.includes(` ${token} `));
    if (strongToken) return strongToken;
  }

  return null;
}


function isSymptomQuestionOrHypothetical(text: string): boolean {
  const t = text.trim();
  return (
    /\?\s*$/.test(t) ||
    /^\s*(what|whats|what's|why|how|when|where|does|do|is|are|can|could|would|should|will|did|was|were|any|anyone|tell\s+me)\b/i.test(t) ||
    /\b(what\s+about|how\s+about|what\s+if|what\s+causes?|why\s+do(?:es)?|is\s+it\s+normal|is\s+that\s+normal|can\s+(?:you|i)|does\s+(?:this|that|\w+)\s+(?:make|mean|happen|cause|fit|indicate)|tell\s+me\s+about|what\s+(?:does|do|phase|kind|else))\b/i.test(t) ||
    /\b(if\s+i|in\s+general|generally|typically|usually\s+happen|some\s+(?:women|people)|other\s+(?:women|people)|might\s+(?:i|that)|supposed\s+to|normal\s+to)\b/i.test(t)
  );
}

function hasPersonalSymptomContext(text: string): boolean {
  const t = text.trim();
  // First-person experience language that makes a symptom question a real report
  // rather than a pure hypothetical question.
  return (
    // I'm / I am / I've been / I feel / I have / I get / I got + experience marker
    /\b(?:i['']?m|i\s+am|i['']?ve\s+been|i\s+feel|i\s+have|i\s+had|i\s+get|i\s+got)\b[^.?!]*\b(?:feeling|craving|crave|having|getting|experiencing|dealing\s+with|going\s+through|noticing|struggling\s+with|battling|a\s+little|a\s+bit|somewhat|slightly|mild|minor|bad|terrible|awful|so|really|very|pretty|quite|constantly|still|also|just|always|often|today|lately|recently|currently|now|super|extremely)\b/i.test(t) ||
    // my [body part / state]
    /\bmy\s+(?:head|back|breasts?|chest|stomach|belly|abdomen|gut|joints?|muscles?|body|skin|period|cycle|mood|sleep|energy|focus|motivation|cravings?|bloating?|digestion|pms|hormones|uterus|ovaries|libido|bowels?|progesterone|estrogen)\b/i.test(t) ||
    // conjunction + am + experience verb (e.g., "I eat healthy and am craving")
    /\b(?:and|but|so|yet)\s+(?:am|i['']?m)\s+(?:feeling|craving|having|getting|experiencing|dealing\s+with|going\s+through|noticing|struggling\s+with|battling)\b/i.test(t) ||
    // Forecast questions about her own state ("what's my energy like today",
    // "what will my mood be like", "how's my focus going to be tomorrow") —
    // these ask Logan for a phase-based forecast, not a symptom report, and
    // should route to the LLM, not the generic symptom-question early return.
    /\bwhat(?:'?s|\s+is)\s+my\s+\w+(?:\s+\w+)?\s+(?:like|going\s+to\s+be|gonna\s+be)\b/i.test(t) ||
    /\bwhat\s+will\s+my\s+\w+(?:\s+\w+)?\s+(?:be|feel|look)\b/i.test(t) ||
    /\bhow(?:'?s|\s+is|\s+will)\s+my\s+\w+(?:\s+\w+)?\s+(?:be|going|feel|today|tomorrow)\b/i.test(t)
  );
}


function isSymptomNegationOrCorrection(text: string): boolean {
  const t = text.trim();
  return /\b(i\s+(?:did\s+not|didn't|do\s+not|don't|never)\s+(?:log|track|record|note|say|report|have|had)|i\s+(?:am\s+not|'?m\s+not)\s+(?:having|feeling|experiencing)|not\s+(?:having|feeling|experiencing)|that'?s?\s+not\s+(?:me|what\s+i\s+said|right)|wrong,?\s*i\s+(?:do\s+not|don't|did\s+not|didn't))\b/i.test(t);
}

function stripFalseSymptomLoggingClaim(text: string): string {
  let out = text;
  out = out.replace(/(?:^|\n)\s*(?:I(?:'ve| have)?|Logan has|We(?:'ve| have)?)\s+(?:logged|noted|tracked|saved|recorded)\b[^.?!\n]*(?:[.?!]\s*|\n|$)/gi, "");
  out = out.replace(/(?:^|\n)\s*Got it\s*[—-]\s*(?:I(?:'ve| have)?\s+)?(?:logged|noted|tracked|saved|recorded)\b[^.?!\n]*(?:[.?!]\s*|\n|$)/gi, "");
  out = out.replace(/\b(?:logged|noted|tracked|saved|recorded)\s+(?:that|those|this|it)\s+(?:for\s+today|today)\b[.?!]?/gi, "");
  out = out.replace(/[^.?!\n]*\b(?:log(?:ged|ging)?|not(?:ed|ing)?|track(?:ed|ing)?|sav(?:ed|ing)?|record(?:ed|ing)?)\b[^.?!\n]*(?:[.?!]\s*|\n|$)/gi, "");
  return out.replace(/^\s+/, "").trimEnd();
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getDeclaredPhaseFromText(text: string): "Menstruation" | "Follicular" | "Ovulation" | "Luteal" | null {
  if (/\b(?:menstrual|menstruation|period)\b/i.test(text)) return "Menstruation";
  if (/\bfollicular\b/i.test(text)) return "Follicular";
  if (/\b(?:ovulation|ovulating|ovulatory|fertile)\b/i.test(text)) return "Ovulation";
  if (/\bluteal\b/i.test(text)) return "Luteal";
  return null;
}

function getCycleDayForToday(lastPeriodStart: string, timezone: string): number {
  const periodStart = parseDateOnly(lastPeriodStart);
  if (!periodStart) return 1;
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const today = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0));
  const daysSinceStart = Math.round((today.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
  return daysSinceStart >= 0 ? daysSinceStart + 1 : 1;
}

import { inferCycleLengthForDeclaredPhase } from "../_shared/cyclePhase.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    if (!lovableApiKey) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser();

    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { userMessage } = body;

    if (!userMessage || typeof userMessage !== "string") {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (userMessage.length > 4000) {
      return new Response(
        JSON.stringify({ error: "Message too long (max 4000 characters)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Chat AI request from user:", user.id, "message:", userMessage.substring(0, 50));

    // --- Credit check (DISABLED — free access during alpha) ---
    const CREDITS_ENABLED = false;
    
    // Check if onboarding is complete (still needed for other logic)
    const { data: onboardingCheck } = await supabase
      .from("chat_messages")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "assistant")
      .contains("metadata", { onboarding_complete: true })
      .limit(1);

    const isOnboardingComplete = onboardingCheck && onboardingCheck.length > 0;

    if (CREDITS_ENABLED && isOnboardingComplete) {
      // Get or create user credits
      let { data: credits } = await supabase
        .from("user_credits")
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (!credits) {
        const { data: newCredits, error: createError } = await supabase
          .from("user_credits")
          .insert({ user_id: user.id, free_credits: 5, paid_credits: 0, free_credits_reset_at: new Date().toISOString() })
          .select()
          .single();
        if (createError) {
          console.error("Error creating credits:", createError);
          return new Response(
            JSON.stringify({ error: "Failed to initialize credits" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        credits = newCredits;
      }

      // Check if free credits should be reset (24h)
      const resetAt = new Date(credits.free_credits_reset_at);
      const now = new Date();
      const hoursSinceReset = (now.getTime() - resetAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceReset >= 24) {
        await supabase
          .from("user_credits")
          .update({ free_credits: 5, free_credits_reset_at: now.toISOString() })
          .eq("user_id", user.id);
        credits.free_credits = 5;
        credits.free_credits_reset_at = now.toISOString();
      }

      const totalCredits = credits.free_credits + credits.paid_credits;
      if (totalCredits <= 0) {
        return new Response(
          JSON.stringify({ error: "no_credits", message: "You're out of credits. Purchase more to continue chatting." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Deduct 1 credit (free first, then paid)
      if (credits.free_credits > 0) {
        await supabase
          .from("user_credits")
          .update({ free_credits: credits.free_credits - 1 })
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("user_credits")
          .update({ paid_credits: credits.paid_credits - 1 })
          .eq("user_id", user.id);
      }

      // Log transaction
      await supabase.from("credit_transactions").insert({
        user_id: user.id,
        amount: -1,
        type: "usage",
        description: "Chat message",
      });

      // Check if user just used their 5th credit ever — award bonus
      if (!credits.bonus_credits_awarded) {
        const { count } = await supabase
          .from("credit_transactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("type", "usage");

        if (count && count >= 5) {
          const { data: current } = await supabase
            .from("user_credits")
            .select("paid_credits")
            .eq("user_id", user.id)
            .single();

          if (current) {
            await supabase
              .from("user_credits")
              .update({ paid_credits: current.paid_credits + 10, bonus_credits_awarded: true })
              .eq("user_id", user.id);
          }

          await supabase.from("credit_transactions").insert({
            user_id: user.id,
            amount: 10,
            type: "bonus",
            description: "Complimentary credits — thanks for chatting with Logan!",
          });
        }
      }
    }
    // --- End credit check ---

    // Get participant data for context
    let { data: participant } = await supabase
      .from("participants")
      .select("*")
      .eq("email", user.email)
      .single();

    // --- Period confirmation detection ---
    const { data: lastAssistantMsg } = await supabase
      .from("chat_messages")
      .select("content, metadata")
      .eq("user_id", user.id)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    
    const wasPeridCheckin = (lastAssistantMsg?.metadata as any)?.period_checkin === true;
    const lastAssistantContent = typeof lastAssistantMsg?.content === "string" ? lastAssistantMsg.content : "";

    const referencesHistoricalDate = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/i.test(userMessage)
      || /last (month|cycle|time)/i.test(userMessage)
      || /\d{4}/.test(userMessage);

    const dayOfWeekPattern = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i;

    const periodConfirmPatterns = [
      /^yes,?\s*(it )?(started|period|got it|began|came)/i,
      /started (today|yesterday|this morning|last night)/i,
      /^(i )?(got|getting) my period/i,
      /^it started/i,
      /period started (today|yesterday|this morning|last night)/i,
      /started yesterday/i,
      /my period (just )?(started|came|arrived|began)/i,
      /^(i )?(just )?(got|started|had) (my |the )?period/i,
      /got it yesterday/i,
      // Day-of-week variants: "period began Tuesday", "started on Monday", "got my period friday"
      /(?:period|it)\s+(?:started|began|came|arrived)\s+(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)/i,
      /(?:started|began|came|got it)\s+(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)/i,
      // Declarative Day-1 corrections: user tells Logan the cycle should reset to Day 1 today.
      // Examples: "I want it to show day 1 period", "it should show day 1", "today should be day 1",
      // "today is day 1 menstruation", "show day 1 period", "change it to day 1".
      /\b(?:i\s+want\s+(?:it|you|logan)\s+to\s+show|it\s+should\s+show|show(?:\s+me)?|set(?:\s+it)?\s+to|change\s+(?:it|this)\s+to|make\s+it|log|mark)\s+(?:as\s+)?day\s*1\b/i,
      /\btoday\s+(?:is|should\s+be|=)\s+day\s*1\b/i,
      /\bday\s*1\s+(?:today|of\s+(?:my\s+)?(?:period|menstruation|cycle))\b/i,
      /\b(?:i['’]?m|im)\s+on\s+day\s*1\b/i,
    ];
    
    const bareYesPatterns = [/^yes$/i, /^yes,? (it )?(started|has|did)/i];
    const isBareYes = bareYesPatterns.some(p => p.test(userMessage.trim()));
    
    const isPeriodStartQuestion = /\?/.test(userMessage)
      || /\b(?:when|what|which)\b[^.?!]{0,80}\b(?:period|bleed|day\s*1)\b[^.?!]{0,80}\b(?:start|started|begin|began|come|came|arrive|arrived)\b/i.test(userMessage)
      || /\b(?:did|have)\s+i\s+(?:tell|say|mention|log|report)\b[^.?!]{0,80}\b(?:period|bleed|day\s*1)\b/i.test(userMessage);

    // A bare "yes"/"yep" only counts as a period confirmation when Logan just
    // asked (wasPeridCheckin). Explicit phrases ("my period started yesterday")
    // still pass on their own. Generic confirm patterns must also mention a
    // period-related word OR follow a check-in, to avoid hijacking unrelated yeses.
    const mentionsPeriodWord = /\b(period|bleed|bleeding|day\s*1|menstruation|menstruating|spotting)\b/i.test(userMessage);
    const isPeriodConfirmation = !referencesHistoricalDate && !isPeriodStartQuestion && (
      (periodConfirmPatterns.some(p => p.test(userMessage)) && (wasPeridCheckin || mentionsPeriodWord)) ||
      (isBareYes && wasPeridCheckin)
    );

    // Helper: resolve a day-of-week name to the most recent past date
    function resolveDayOfWeek(dayName: string): Date {
      const dayMap: Record<string, number> = {
        sunday: 0, sun: 0,
        monday: 1, mon: 1,
        tuesday: 2, tue: 2, tues: 2,
        wednesday: 3, wed: 3,
        thursday: 4, thu: 4, thur: 4, thurs: 4,
        friday: 5, fri: 5,
        saturday: 6, sat: 6,
      };
      const target = dayMap[dayName.toLowerCase()];
      const now = new Date();
      const current = now.getDay();
      let diff = current - target;
      if (diff <= 0) diff += 7; // always go to the most recent past occurrence
      const result = new Date(now);
      result.setDate(result.getDate() - diff);
      return result;
    }

    if (isPeriodConfirmation && participant) {
      let periodStartDate = new Date();

      const dayOfWeekMatch = userMessage.match(dayOfWeekPattern);
      const daysAgoMatch = userMessage.match(/(\d+)\s+days?\s+ago/i);
      if (dayOfWeekMatch) {
        periodStartDate = resolveDayOfWeek(dayOfWeekMatch[1]);
      } else if (daysAgoMatch) {
        periodStartDate.setDate(periodStartDate.getDate() - parseInt(daysAgoMatch[1]));
      } else if (/yesterday/i.test(userMessage)) {
        periodStartDate.setDate(periodStartDate.getDate() - 1);
      } else if (/this morning/i.test(userMessage) || /last night/i.test(userMessage) || /today/i.test(userMessage)) {
        // stays today
      }
      if (/a few days ago/i.test(userMessage) && !daysAgoMatch) {
        periodStartDate.setDate(periodStartDate.getDate() - 2);
      }
      const formattedDate = periodStartDate.toISOString().split("T")[0];

      let previousCycleLength: number | null = null;
      if (participant.last_period_start) {
        const prevStart = parseDateOnly(participant.last_period_start);
        const newStart = parseDateOnly(formattedDate);
        const diffDays = prevStart && newStart ? Math.round((newStart.getTime() - prevStart.getTime()) / (1000 * 60 * 60 * 24)) : 0;
        if (diffDays >= 15 && diffDays <= 60) {
          previousCycleLength = diffDays;
          await supabase
            .from("cycle_history")
            .insert({
              participant_id: participant.id,
              cycle_start_date: participant.last_period_start,
              cycle_end_date: formattedDate,
              cycle_length_days: diffDays,
            });
        }
      }

      // If user was postpartum and reports a period, transition them to cycling
      // Postpartum → cycling: keep postpartum_start_date intact (it's the baby's birth date)
      const periodUpdatePayload: Record<string, unknown> = {
        last_period_start: formattedDate,
        // She confirmed Day 1 — clear any pending "haven't started yet" flag.
        period_pending_since: null,
      };
      if (participant.life_stage === "postpartum") {
        periodUpdatePayload.life_stage = "cycling";
        // Preserve postpartum recovery context as a secondary state (dual-state).
        periodUpdatePayload.postpartum_active = true;
      }

      const { error: updateError } = await supabase
        .from("participants")
        .update(periodUpdatePayload)
        .eq("id", participant.id);

      if (!updateError) {
        const { data: refreshed } = await supabase
          .from("participants")
          .select("*")
          .eq("id", participant.id)
          .single();
        if (refreshed) participant = refreshed;
      }

      const { data: cycleHistoryRows } = await supabase
        .from("cycle_history")
        .select("cycle_length_days")
        .eq("participant_id", participant.id)
        .order("cycle_start_date", { ascending: false })
        .limit(12);

      const cycleHistory = cycleHistoryRows || [];
      const avgCycleLength = cycleHistory.length > 0
        ? Math.round(cycleHistory.reduce((sum, r) => sum + r.cycle_length_days, 0) / cycleHistory.length)
        : null;

      const newCycleInfo = calculateCycleInfo(formattedDate, participant.cycle_length_days || 28, participant.timezone || "UTC");

      let confirmationMessage = `Noted — logging **Day 1** as ${periodStartDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Your cycle is reset.\n\n- **Phase**: ${newCycleInfo.phase}\n- **Energy**: low — prioritize rest and light movement\n- **Watch for**: your anchor symptom (${participant.anchor_symptom || "not set"}) usually eases by day 3-4`;

      if (previousCycleLength) {
        confirmationMessage += `\n\n**This cycle was ${previousCycleLength} days.**`;
      }
      if (avgCycleLength && cycleHistory.length >= 2) {
        confirmationMessage += `\nYour **average cycle length** over ${cycleHistory.length} cycles: **${avgCycleLength} days**.`;
        const shortest = Math.min(...cycleHistory.map(r => r.cycle_length_days));
        const longest = Math.max(...cycleHistory.map(r => r.cycle_length_days));
        if (shortest !== longest) {
          confirmationMessage += ` (range: ${shortest}–${longest} days)`;
        }
      }

      confirmationMessage += `\n\nTake it easy today.`;

      await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: confirmationMessage,
        message_type: "text",
        metadata: {
          cycle_day: newCycleInfo.cycleDay,
          cycle_phase: newCycleInfo.phase,
          ...cycleVisualMeta(userMessage),
          cycle_length_days: participant.cycle_length_days || 28,
          last_period_start: formattedDate,
          timezone: participant.timezone || "UTC",
          period_update: true,
          new_period_start: formattedDate,
          previous_cycle_length: previousCycleLength,
          average_cycle_length: avgCycleLength,
          cycles_tracked: cycleHistory.length,
        }
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: confirmationMessage,
          cycleInfo: newCycleInfo,
          periodUpdated: true,
          previousCycleLength,
          averageCycleLength: avgCycleLength,
          cyclesTracked: cycleHistory.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // --- End period confirmation ---

    // --- "Not yet" response to a period check-in ---
    // If Logan asked "has it started yet?" (period_checkin) and the user says
    // no/not yet, remember that so the cycle ring stops auto-wrapping into a
    // fake new cycle. We'll keep showing her true (overdue) day count and let
    // the AI follow up on the next late check-in — never silently advance her
    // cycle without her confirmation.
    if (wasPeridCheckin && participant && !isPeriodConfirmation) {
      const notYetPatterns = [
        /^no(\b|$)/i,
        /^nope\b/i,
        /\bnot\s*yet\b/i,
        /haven'?t\s*(started|gotten|had|got|come|arrived|begun|come\s+yet|gotten\s+(it|my\s+period)?\s*yet?)/i,
        /haven'?t\s+\w+\s*(it|yet)/i, // "haven't gotten it", "haven't had it yet"
        /\bhaven'?t\s+yet\b/i, // "I haven't yet"
        /hasn'?t\s*(started|come|arrived|happened)/i,
        /still\s*(waiting|nothing|no\s+period|haven'?t)/i,
        /no\s+period\s+yet/i,
        /period\s+is\s+(late|overdue|delayed)/i,
        /should\s+have\s+(gotten|had|started).*but/i, // "should have gotten it but..."
        /still\s+no(thing|\s+period|\s+sign)/i,
        /\bnothing\s+yet\b/i,
      ];
      const isNotYet = notYetPatterns.some(p => p.test(userMessage.trim()));
      if (isNotYet) {
        const todayStr = new Date().toISOString().split("T")[0];
        await supabase
          .from("participants")
          .update({ period_pending_since: todayStr })
          .eq("id", participant.id);
        participant = { ...participant, period_pending_since: todayStr } as typeof participant;
      }
    }
    // --- End "not yet" ---


    // --- "Period still ongoing" detection ---
    // When a cycling user tells Logan her period is still going (e.g.
    // "almost over but not yet", "still bleeding", "period isn't over"),
    // flag period_still_active so the cycle ring keeps showing Menstruation
    // instead of auto-flipping to Follicular on day 6. Cleared automatically
    // when she logs a new Day 1 or a period end date.
    if (participant && participant.life_stage === "cycling" && !isPeriodConfirmation) {
      const stillBleedingPatterns: RegExp[] = [
        /\b(still|yet)\s+bleeding\b/i,
        /\bstill\s+on\s+(?:my\s+)?period\b/i,
        /\bperiod\s+(?:is\s+)?(?:not|isn'?t)\s+(?:over|done|finished|ended)\b/i,
        /\b(?:almost|nearly)\s+(?:over|done|finished)\s*(?:but\s+)?not\s+yet\b/i,
        /\bperiod\s+(?:is\s+)?almost\s+(?:over|done|finished)\b/i,
        /\bnot\s+(?:over|done|finished)\s+yet\b/i,
        /\bstill\s+(?:getting|having)\s+(?:my\s+)?period\b/i,
        /\b(?:i'?m\s+)?still\s+(?:on|in)\s+(?:my\s+)?menstruation\b/i,
        /\bperiod\s+(?:is\s+)?still\s+(?:going|here|ongoing)\b/i,
      ];
      const isStillBleeding = stillBleedingPatterns.some(p => p.test(userMessage));
      // Also detect explicit "period ended" / "period is over" → clear the flag
      const endedPatterns: RegExp[] = [
        /\bperiod\s+(?:is\s+)?(?:over|done|finished|ended)\b/i,
        /\b(?:i'?m\s+)?done\s+(?:with\s+)?(?:my\s+)?period\b/i,
        /\bperiod\s+ended\s+(?:today|yesterday)\b/i,
      ];
      const isEnded = !isStillBleeding && endedPatterns.some(p => p.test(userMessage));

      if (isStillBleeding && !(participant as any).period_still_active) {
        await supabase
          .from("participants")
          .update({ period_still_active: true })
          .eq("id", participant.id);
        participant = { ...participant, period_still_active: true } as typeof participant;
      } else if (isEnded && (participant as any).period_still_active) {
        await supabase
          .from("participants")
          .update({ period_still_active: false })
          .eq("id", participant.id);
        participant = { ...participant, period_still_active: false } as typeof participant;
      }
    }
    // --- End "period still ongoing" ---


    // --- "Period/bleed ended" detection: persist current_period_end_date ---
    // Captures "bleeding ended day 4", "period ended on day 5", "bled for 4 days",
    // "period lasted 5 days", "my period ended today/yesterday", or a bare
    // "period is over/done/finished/ended" (treated as ending today).
    if (participant && participant.life_stage === "cycling" && participant.last_period_start && !isPeriodConfirmation) {
      const periodStartDate = parseDateOnly(participant.last_period_start);
      if (periodStartDate) {
        let endDateStr: string | null = null;

        const endedDayMatch = userMessage.match(/\b(?:bleed(?:ing)?|period|bled)\s+(?:ended|stopped|finished|done|over)\s+(?:on\s+)?day\s*(\d{1,2})\b/i)
          || userMessage.match(/\bended\s+(?:on\s+)?day\s*(\d{1,2})\b/i)
          || userMessage.match(/\bday\s*(\d{1,2})\s+(?:was\s+)?(?:my\s+)?(?:last\s+)?(?:bleed|bleeding|period)\s+(?:day|ended)\b/i);
        const lastedDaysMatch = userMessage.match(/\b(?:bled|bleeding|period|bleed)\s+(?:for|lasted|was)\s+(\d{1,2})\s+days?\b/i)
          || userMessage.match(/\b(\d{1,2})[-\s]day\s+(?:period|bleed)\b/i)
          // "ended after 3 days [of bleeding]", "stopped after 4 days", "done after 5 days"
          || userMessage.match(/\b(?:ended|stopped|finished|done|over)\s+after\s+(\d{1,2})\s+days?\b/i)
          // "only bled for 3 days", "only had 3 days of bleeding/period"
          || userMessage.match(/\bonly\s+(?:bled|bleeding|had)\s+(?:for\s+)?(\d{1,2})\s+days?(?:\s+of\s+(?:bleed(?:ing)?|period))?\b/i)
          // "(I) bled 3 days" (no for/lasted)
          || userMessage.match(/\b(?:i\s+)?bled\s+(\d{1,2})\s+days?\b/i);
        const endedRelMatch = userMessage.match(/\b(?:bleed(?:ing)?|period|bled)\s+(?:ended|stopped|finished|over|done)\s+(today|yesterday)\b/i)
          || userMessage.match(/\b(?:period|bleed(?:ing)?)\s+(?:is\s+)?(?:over|done|finished|ended)\s+(?:as\s+of\s+)?(today|yesterday)\b/i);
        const endedNoDateMatch = !endedDayMatch && !lastedDaysMatch && !endedRelMatch
          && /\b(?:my\s+)?(?:period|bleed(?:ing)?)\s+(?:is\s+)?(?:over|done|finished|ended)\b/i.test(userMessage)
          && !/\b(?:not|isn'?t|still|almost|nearly)\b/i.test(userMessage)
          && !/\?/.test(userMessage);

        const addDays = (base: Date, n: number) => {
          const d = new Date(base.getTime());
          d.setUTCDate(d.getUTCDate() + n);
          return d.toISOString().split("T")[0];
        };

        if (endedDayMatch) {
          const n = parseInt(endedDayMatch[1]);
          if (n >= 1 && n <= 14) endDateStr = addDays(periodStartDate, n - 1);
        } else if (lastedDaysMatch) {
          const n = parseInt(lastedDaysMatch[1]);
          if (n >= 1 && n <= 14) endDateStr = addDays(periodStartDate, n - 1);
        } else if (endedRelMatch) {
          const isYesterday = /yesterday/i.test(endedRelMatch[1]);
          const d = new Date();
          if (isYesterday) d.setDate(d.getDate() - 1);
          endDateStr = d.toISOString().split("T")[0];
        } else if (endedNoDateMatch) {
          endDateStr = new Date().toISOString().split("T")[0];
        }

        if (endDateStr && endDateStr >= participant.last_period_start) {
          await supabase
            .from("participants")
            .update({
              current_period_end_date: endDateStr,
              period_still_active: false,
            })
            .eq("id", participant.id);
          participant = {
            ...participant,
            current_period_end_date: endDateStr,
            period_still_active: false,
          } as typeof participant;
          console.log("[chat-ai] persisted current_period_end_date:", endDateStr);
        }
      }
    }
    // --- End "period ended" detection ---




    // --- Spotting / early-bleed detection: flag for Day-1 confirmation prompt ---
    // Rules (all must hold to even consider a Day-1 prompt):
    //   1. Explicit bleed/spotting/blood language — NOT vague "feels like period coming",
    //      cramps alone, or hypothetical phrasing ("might", "maybe", "tomorrow").
    //   2. life_stage === "cycling" AND we have a reliable cycle anchor:
    //        - last_period_start is set
    //        - cycle_length_days is set AND has been confirmed by at least one
    //          completed cycle (cycle_history row), OR differs from the 28 default.
    //      Irregular / PCOS / hormonal-BC / brand-new accounts skip the auto-prompt
    //      entirely and we tell the AI to acknowledge gently without proposing a reset.
    //   3. Cycle day is in a plausible window (>= length-5 OR <= 2).
    // Anything that fails (1) is ignored; failing (2) or (3) sets midCycleSpottingNote
    // so the system prompt nudges the AI to ask rather than auto-reset.
    let bleedDay1Prompt: { text: string; suggestedDay1: string } | null = null;
    let midCycleSpottingNote = false;
    let unreliableCycleNote = false;
    if (participant && !isPeriodConfirmation) {
      const bleedMentionPatterns: RegExp[] = [
        /\b(spotting|spot of blood|some blood|slightest blood|little blood|bit of blood|light bleed(?:ing)?|brown discharge|pink discharge)\b/i,
        /\b(i'?m bleeding|started bleeding|started to bleed|first sign of (?:my )?period|got the first (?:bit|sign))\b/i,
      ];
      // Drop speculative phrasing — too easy to misfire on PMS chatter.
      const isHypotheticalBleed = /\b(might|maybe|could be|feels?\s+like|i\s+think|i\s+wonder|tomorrow|in\s+a\s+(?:few\s+)?days?|soon|expecting)\b/i.test(userMessage);
      const mentionsBleed = !isHypotheticalBleed && bleedMentionPatterns.some((p) => p.test(userMessage));

      if (mentionsBleed) {
        // Check whether this user has a reliable cycle anchor.
        const isCyclingStage = participant.life_stage === "cycling";
        let hasConfirmedCycle = false;
        if (isCyclingStage && participant.last_period_start && participant.cycle_length_days) {
          if (participant.cycle_length_days !== 28) {
            hasConfirmedCycle = true;
          } else {
            // 28 might just be the default — only trust it if she's completed a real cycle.
            const { count: historyCount } = await supabase
              .from("cycle_history")
              .select("id", { count: "exact", head: true })
              .eq("participant_id", participant.id);
            hasConfirmedCycle = (historyCount ?? 0) > 0;
          }
        }

        if (!isCyclingStage || !hasConfirmedCycle) {
          // Irregular / PCOS / hormonal BC / brand-new / postpartum / menopause / pregnancy_loss:
          // never auto-propose Day 1. Just have Logan acknowledge gently.
          unreliableCycleNote = true;
          midCycleSpottingNote = true;
        } else {
          const tz = participant.timezone || "UTC";
          const cd = getCycleDayForToday(participant.last_period_start, tz);
          const cycLen = participant.cycle_length_days;
          const inPlausibleWindow = cd >= cycLen - 5 || cd <= 2;
          if (inPlausibleWindow) {
            const todayLabel = new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              timeZone: tz,
            });
            bleedDay1Prompt = {
              text: `\n\nWant me to log **${todayLabel}** as your new **Day 1** and reset your cycle? Just say **yes** to confirm — or tell me the actual start date if it was earlier.`,
              suggestedDay1: new Date().toISOString().split("T")[0],
            };
          } else {
            // Mid-cycle bleed — could be ovulatory spotting, implantation, breakthrough.
            // Don't propose a reset; ask.
            midCycleSpottingNote = true;
          }
        }
      }
    }
    // --- End spotting detection ---




    // --- Cycle edit detection (cycle length or period date changes via chat) ---
    if (participant) {
      // Detect cycle length change: "change my cycle length to 30", "my cycle is 32 days", "set cycle to 26 days"
      const cycleLengthMatch = userMessage.match(
        /(?:change|set|update|make|switch)\s+(?:my\s+)?cycle\s*(?:length)?\s*(?:to|=)\s*(\d{2,})/i
      ) || userMessage.match(
        /(?:my\s+)?cycle\s*(?:length)?\s*(?:is|should be|is actually)\s*(\d{2,})\s*days?/i
      ) || userMessage.match(
        /cycle\s*(?:length)?\s*(?:to)\s*(\d{2,})\s*days?/i
      );

      // Detect period date change. Captures phrasings like:
      // "my period started on March 15", "change my period date to April 2",
      // "I got a bleed day 1 on April 8", "Day 1 was April 8",
      // "first day of my period was April 8", "bleed started April 8",
      // "got my period on April 8". When multiple dates appear (e.g. "April 8 and then today"),
      // use the LATEST one.
      const periodDateRegexes: RegExp[] = [
        /(?:period|last period|period date|bleed|cycle)\s+(?:started|began|was|start|came|arrived)\s+(?:on\s+)?(?:the\s+)?(\w+\s+\d{1,2}(?:,?\s*\d{4})?|today|yesterday)/i,
        /(?:change|set|update)\s+(?:my\s+)?(?:period|period date|last period)\s+(?:to|date to)\s+(\w+\s+\d{1,2}(?:,?\s*\d{4})?|today|yesterday)/i,
        /\b(?:i\s+)?(?:got|had)\s+(?:my\s+|a\s+)?(?:period|bleed)(?:\s+day\s*1)?\s+(?:on\s+)?(?:the\s+)?(\w+\s+\d{1,2}(?:,?\s*\d{4})?|today|yesterday)/i,
        /\b(?:day\s*1|first\s+day(?:\s+of\s+(?:my\s+)?(?:period|bleed|cycle))?)\s+(?:was|started|on|=|is)\s+(?:on\s+)?(?:the\s+)?(\w+\s+\d{1,2}(?:,?\s*\d{4})?|today|yesterday)/i,
        /\bbleed\s+(?:on|started|began)\s+(?:on\s+)?(?:the\s+)?(\w+\s+\d{1,2}(?:,?\s*\d{4})?|today|yesterday)/i,
        // Correction phrasings: "it came back ... May 26th", "it returned on ...", "I bled on ..."
        /\b(?:it|she|that)\s+(?:came\s+back|returned|started|showed\s+up|arrived)\b[^.?!]{0,60}?(\w+\s+\d{1,2}(?:,?\s*\d{4})?|today|yesterday)/i,
        /\bi\s+(?:bled|started\s+bleeding|started\s+spotting)\b[^.?!]{0,60}?(\w+\s+\d{1,2}(?:,?\s*\d{4})?|today|yesterday)/i,
        // Explicit correction: "not the right date ... May 26th", "the right date is May 26th", "actually May 26th"
        /(?:not\s+the\s+right|wrong|right|correct)\s+date\b[^.?!]{0,80}?(\w+\s+\d{1,2}(?:,?\s*\d{4})?|today|yesterday)/i,
        /\b(?:actually|sorry|correction|i\s+meant|my\s+mistake|nope|no\s*,)\b[^.?!]{0,60}?(\w+\s+\d{1,2}(?:,?\s*\d{4})?|today|yesterday)/i,
      ];
      // Find ALL matches across all patterns and pick the LATEST date
      let periodDateMatch: RegExpMatchArray | null = null;
      {
        const allDates: { token: string; date: Date; match: RegExpMatchArray }[] = [];
        for (const rx of periodDateRegexes) {
          const globalRx = new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : rx.flags + "g");
          let m: RegExpExecArray | null;
          while ((m = globalRx.exec(userMessage)) !== null) {
            const token = m[1];
            let d: Date | null = null;
            if (/^today$/i.test(token)) d = new Date();
            else if (/^yesterday$/i.test(token)) { d = new Date(); d.setDate(d.getDate() - 1); }
            else {
              d = parseExplicitCalendarDate(token);
            }
            if (d && d <= new Date()) allDates.push({ token, date: d, match: m as unknown as RegExpMatchArray });
          }
        }
        // Also catch a trailing "and (then )?today" / "and (then )?yesterday" that often pairs with a prior date.
        // ONLY do this when a period-context regex already matched — otherwise unrelated messages like
        // "acne flare up on Friday 5th, Saturday 6th, yesterday and today" would incorrectly rewrite the period date.
        if (allDates.length > 0) {
          if (/\band\s+(?:then\s+)?today\b/i.test(userMessage)) {
            allDates.push({ token: "today", date: new Date(), match: ["today", "today"] as unknown as RegExpMatchArray });
          } else if (/\band\s+(?:then\s+)?yesterday\b/i.test(userMessage)) {
            const y = new Date(); y.setDate(y.getDate() - 1);
            allDates.push({ token: "yesterday", date: y, match: ["yesterday", "yesterday"] as unknown as RegExpMatchArray });
          }
        }
        if (allDates.length > 0) {
          allDates.sort((a, b) => b.date.getTime() - a.date.getTime());
          periodDateMatch = allDates[0].match;
          // Override the captured token with the resolved date string for downstream parsing
          (periodDateMatch as any)[1] = allDates[0].date.toISOString().split("T")[0];
          // Keep the second-newest as a candidate for "previous cycle" archiving
          if (allDates.length > 1) {
            (periodDateMatch as any).__previousDate = allDates[1].date.toISOString().split("T")[0];
          }
        }
      }


      if (cycleLengthMatch) {
        const newLength = parseInt(cycleLengthMatch[1]);
        if (newLength >= 18 && newLength <= 45) {
          const { error: updateErr } = await supabase
            .from("participants")
            .update({ cycle_length_days: newLength })
            .eq("id", participant.id);

          if (!updateErr) {
            const { data: refreshed } = await supabase
              .from("participants")
              .select("*")
              .eq("id", participant.id)
              .single();
            if (refreshed) participant = refreshed;

            const updatedCycleInfo = calculateCycleInfo(
              participant.last_period_start || new Date().toISOString().split("T")[0],
              newLength,
              participant.timezone || "UTC"
            );

            const msg = `Done — cycle length updated to **${newLength} days**. That puts you on **Day ${updatedCycleInfo.cycleDay}** in your **${updatedCycleInfo.phase}** phase now.`;

            await supabase.from("chat_messages").insert({
              user_id: user.id,
              role: "assistant",
              content: msg,
              message_type: "text",
              metadata: {
                cycle_day: updatedCycleInfo.cycleDay,
                cycle_phase: updatedCycleInfo.phase,
                ...cycleVisualMeta(userMessage),
                cycle_length_days: newLength,
                last_period_start: participant.last_period_start,
                timezone: participant.timezone || "UTC",
                cycle_length_update: true,
              }
            });

            return new Response(
              JSON.stringify({
                success: true,
                message: msg,
                cycleInfo: updatedCycleInfo,
                cycleLengthUpdated: true,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      if (periodDateMatch && !isPeriodStartQuestion) {
        const dateStr = periodDateMatch[1];
        const parsed = parseExplicitCalendarDate(dateStr);
        if (parsed && parsed <= new Date()) {
          const formattedDate = dateOnly(parsed);

          // Archive previous cycle. Prefer an explicit "previous date" mentioned in the same
          // message (e.g. "April 8 and then today"); otherwise fall back to the participant's
          // current last_period_start.
          let previousCycleLength: number | null = null;
          let inferredCycleLength: number | null = null;
          const explicitPrev = (periodDateMatch as any).__previousDate as string | undefined;
          const prevSource = explicitPrev || participant.last_period_start;
          if (prevSource) {
            const prevStart = parseDateOnly(prevSource);
            const diffDays = prevStart ? Math.round((parsed.getTime() - prevStart.getTime()) / (1000 * 60 * 60 * 24)) : 0;
            if (diffDays >= 15 && diffDays <= 60) {
              previousCycleLength = diffDays;
              inferredCycleLength = diffDays;
              await supabase.from("cycle_history").insert({
                participant_id: participant.id,
                cycle_start_date: prevSource,
                cycle_end_date: formattedDate,
                cycle_length_days: diffDays,
              });
            }
          }

          const periodDatePayload: Record<string, unknown> = { last_period_start: formattedDate };
          if (inferredCycleLength) periodDatePayload.cycle_length_days = inferredCycleLength;
          if (participant.life_stage === "postpartum") {
            periodDatePayload.life_stage = "cycling";
            periodDatePayload.postpartum_active = true;
          }


          const { error: updateErr } = await supabase
            .from("participants")
            .update(periodDatePayload)
            .eq("id", participant.id);

          if (!updateErr) {
            const { data: refreshed } = await supabase
              .from("participants")
              .select("*")
              .eq("id", participant.id)
              .single();
            if (refreshed) participant = refreshed;

            const updatedCycleInfo = calculateCycleInfo(
              formattedDate,
              participant.cycle_length_days || 28,
              participant.timezone || "UTC"
            );

            let msg = `Done — updated your last period start to **${parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" })}**. You're on **Day ${updatedCycleInfo.cycleDay}** in your **${updatedCycleInfo.phase}** phase.`;
            if (previousCycleLength) {
              msg += ` That last cycle was **${previousCycleLength} days**.`;
            }

            await supabase.from("chat_messages").insert({
              user_id: user.id,
              role: "assistant",
              content: msg,
              message_type: "text",
              metadata: {
                cycle_day: updatedCycleInfo.cycleDay,
                cycle_phase: updatedCycleInfo.phase,
                ...cycleVisualMeta(userMessage),
                cycle_length_days: participant.cycle_length_days || 28,
                last_period_start: formattedDate,
                timezone: participant.timezone || "UTC",
                period_update: true,
                new_period_start: formattedDate,
                previous_cycle_length: previousCycleLength,
              }
            });

            return new Response(
              JSON.stringify({
                success: true,
                message: msg,
                cycleInfo: updatedCycleInfo,
                periodUpdated: true,
                previousCycleLength,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      // Detect cycle-day corrections in many phrasings:
      //   "today is day 23", "I'm on day 23", "actually day 23", "day 23 today",
      //   "not day 24, day 23", "23 sorry", "i meant 23", "make it day 23",
      //   bare "day 23" or just "23" when the prior assistant turn explicitly mentioned a cycle day.
      const lastAssistantMentionedDay = !!(lastAssistantMsg?.metadata as any)?.cycle_day
        || /\bday\s+\d{1,2}\b/i.test(((lastAssistantMsg as any)?.content as string) || "");
      const isCorrectionContext = /(?:sorry|actually|correction|i meant|my mistake|oops|nope|no\s*,|wait\s*,)/i.test(userMessage);
      // Corrections are statements, not questions.
      const isQuestion = /\?/.test(userMessage);
      const restorePreviousCycleState = /\b(?:put|move|switch|set)\s+me\s+back\b/i.test(userMessage)
        || /\b(?:i['’]?m\s+not|not|no)\s+(?:on|having|in)\s+(?:my\s+)?period\b/i.test(userMessage)
        || /\bi['’]?m\s+not\s+(?:in|on|having)\s+(?:my\s+)?(?:menstruation|menstrual|period|bleeding)\b/i.test(userMessage)
        || /\b(?:i\s+)?(?:have|did|do)\s*n[o']?t\s+(?:gotten|get|got|have|start(?:ed)?|begin|began|begun)\s+(?:my\s+)?period\b/i.test(userMessage)
        || /\bhaven'?t\s+(?:gotten|got|had|started|begun)\s+(?:my\s+)?(?:period|menstruation|bleed(?:ing)?)\b/i.test(userMessage)
        || /\b(?:no|nope)[,\s]+(?:i\s+)?(?:have|did|do)\s*n[o']?t\s+(?:gotten|get|got|have|start(?:ed)?)\b[^.?!\n]*\bperiod\b/i.test(userMessage)
        || /\b(?:that'?s|this is|you'?re|you are)\s+(?:wrong|incorrect|a mistake)\b/i.test(userMessage)
        || /\b(?:undo|revert|cancel)\s+(?:that|the\s+(?:day\s*1|reset|period|update))\b/i.test(userMessage)
        || /\bperiod\s+(?:hasn'?t|has\s+not)\s+(?:started|begun|come|arrived)\b/i.test(userMessage);

      if (restorePreviousCycleState && !isQuestion) {
        const { data: recentAssistantMessages } = await supabase
          .from("chat_messages")
          .select("metadata")
          .eq("user_id", user.id)
          .eq("role", "assistant")
          .order("created_at", { ascending: false })
          .limit(20);

        let previousCycleMeta: Record<string, unknown> | undefined = (recentAssistantMessages || [])
          .map((m) => (m.metadata || {}) as Record<string, unknown>)
          .find((meta) => {
            const priorStart = typeof meta.last_period_start === "string" ? meta.last_period_start : null;
            const priorDay = typeof meta.cycle_day === "number" ? meta.cycle_day : Number(meta.cycle_day);
            return !!priorStart
              && priorStart !== participant.last_period_start
              && Number.isFinite(priorDay)
              && priorDay > 1;
          });

        // Fallback: use the most recently archived cycle_history row (created in the last 48h)
        // if assistant metadata doesn't carry the prior cycle. This handles the case where the
        // reset just happened and prior messages have already been overwritten.
        if (!previousCycleMeta) {
          const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
          const { data: lastArchived } = await supabase
            .from("cycle_history")
            .select("cycle_start_date, cycle_length_days, created_at")
            .eq("participant_id", participant.id)
            .gte("created_at", cutoff)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (lastArchived?.cycle_start_date && lastArchived.cycle_start_date !== participant.last_period_start) {
            previousCycleMeta = {
              last_period_start: lastArchived.cycle_start_date,
              cycle_length_days: lastArchived.cycle_length_days,
              cycle_day: 99, // sentinel > 1 so downstream guard passes
              _from_archive: true,
              _archive_row_id: (lastArchived as any).id,
            };
            // Also delete the bad archive row so we don't have a phantom 22-day cycle.
            try {
              await supabase
                .from("cycle_history")
                .delete()
                .eq("participant_id", participant.id)
                .eq("cycle_start_date", lastArchived.cycle_start_date)
                .gte("created_at", cutoff);
            } catch (_) {}
          }
        }


        if (previousCycleMeta) {
          const restoredStart = previousCycleMeta.last_period_start as string;
          const restoredLengthRaw = previousCycleMeta.cycle_length_days;
          const restoredLength = typeof restoredLengthRaw === "number" ? restoredLengthRaw : Number(restoredLengthRaw);
          const restorePayload: Record<string, unknown> = {
            last_period_start: restoredStart,
            period_pending_since: null,
            period_still_active: false,
            current_period_end_date: null,
          };
          if (Number.isFinite(restoredLength) && restoredLength >= 18 && restoredLength <= 45) {
            restorePayload.cycle_length_days = restoredLength;
          }

          const { error: restoreErr } = await supabase
            .from("participants")
            .update(restorePayload)
            .eq("id", participant.id);

          if (!restoreErr) {
            const { data: refreshed } = await supabase
              .from("participants").select("*").eq("id", participant.id).single();
            if (refreshed) participant = refreshed;

            const restoredCycleInfo = calculateCycleInfo(
              participant.last_period_start,
              participant.cycle_length_days || restoredLength || 28,
              participant.timezone || "UTC"
            );
            const msg = `You're right — I restored you to **Day ${restoredCycleInfo.cycleDay}** in your **${restoredCycleInfo.phase}** phase. Updated everywhere.`;

            await supabase.from("chat_messages").insert({
              user_id: user.id,
              role: "assistant",
              content: msg,
              message_type: "text",
              metadata: {
                cycle_day: restoredCycleInfo.cycleDay,
                cycle_phase: restoredCycleInfo.phase,
                ...cycleVisualMeta(userMessage),
                cycle_length_days: participant.cycle_length_days || restoredLength || 28,
                last_period_start: participant.last_period_start,
                timezone: participant.timezone || "UTC",
                period_update: true,
                restored_cycle_state: true,
              }
            });

            return new Response(
              JSON.stringify({ success: true, message: msg, cycleInfo: restoredCycleInfo, periodUpdated: true }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      const cycleDayCorrectionMatch = userMessage.match(
        /(?:today\s+(?:should\s+be|is)|i['’]?m\s+(?:on|actually\s+on)|i\s+am\s+on|should\s+be|make\s+it|set\s+(?:it|me|cycle)?\s*to|change\s+(?:it|me)?\s*to|put\s+me\s+(?:back\s+)?(?:on|at|to))\s+(?:my\s+|on\s+|at\s+|to\s+)?(?:cycle\s+)?day\s*(\d{1,2})/i
      ) || userMessage.match(
        /\b(?:put|move|switch|set)\s+me\s+back\s+(?:to\s+)?(?:cycle\s+)?day\s*(\d{1,2})/i
      ) || userMessage.match(
        /\bday\s*(\d{1,2})\s*(?:today|now|,?\s*not\s+day\s*\d{1,2})/i
      ) || userMessage.match(
        /\bnot\s+day\s*\d{1,2}[^.?!]{0,40}\bday\s*(\d{1,2})/i
      ) || (isCorrectionContext ? userMessage.match(
        /^\s*(?:day\s*)?(\d{1,2})\s*(?:sorry|actually|correction|i meant|my mistake|oops|nope)?\s*[.!]?\s*$/i
      ) || userMessage.match(
        /(?:sorry|actually|correction|i meant|my mistake|nope|wait)[^.?!\d]{0,30}(?:day\s*)?(\d{1,2})/i
      ) || userMessage.match(
        /(?:day\s*)?(\d{1,2})[^.?!\d]{0,15}(?:sorry|actually|correction|i meant|my mistake|nope)/i
      ) : null) || (lastAssistantMentionedDay ? userMessage.match(
        /^\s*(?:day\s*)?(\d{1,2})\s*[.!?]?\s*$/i
      ) : null);

      console.log("[chat-ai] cycleDayCorrectionMatch:", !!cycleDayCorrectionMatch, "isCorrectionContext:", isCorrectionContext, "lastAssistantMentionedDay:", lastAssistantMentionedDay, "msg:", userMessage.substring(0, 60));

      // Skip if the user is speaking hypothetically / rhetorically / about expectations rather than asserting today's day
      // e.g. "I thought I'd be day 2 today", "would mean I'm on day 36", "how can that be?", "if I'm on day 5"
      const isHypothetical = /\b(?:thought|think|expected|expect|hoped|hope|wish|wished|wonder(?:ed|ing)?|figured|assumed|guess(?:ed|ing)?|supposed\s+to|would\s+(?:be|have|mean|put|make)|that\s+would|that\s+means?|means?\s+(?:i|that)|should\s+(?:be|have)|might\s+be|maybe|imagined?|if\s+i|how\s+can|how\s+is|how\s+could|why\s+(?:am|would|is)|does\s+that\s+mean|doesn'?t\s+that\s+mean)\b/i.test(userMessage);
      if (cycleDayCorrectionMatch && !isHypothetical && !isQuestion) {
        const targetDay = parseInt(cycleDayCorrectionMatch[1]);
        if (targetDay >= 1 && targetDay <= 60) {
          // Compute new last_period_start = today - (targetDay - 1) days, in user's tz
          const tz = participant.timezone || "UTC";
          const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });
          const [ty, tm, td] = todayStr.split("-").map(Number);
          const todayLocal = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0));
          todayLocal.setUTCDate(todayLocal.getUTCDate() - (targetDay - 1));
          const formattedDate = todayLocal.toISOString().split("T")[0];

          const cycleDayPayload: Record<string, unknown> = { last_period_start: formattedDate };
          if (participant.life_stage === "postpartum") {
            cycleDayPayload.life_stage = "cycling";
            cycleDayPayload.postpartum_active = true;
          }

          const { error: updateErr } = await supabase
            .from("participants")
            .update(cycleDayPayload)
            .eq("id", participant.id);

          if (!updateErr) {
            const { data: refreshed } = await supabase
              .from("participants").select("*").eq("id", participant.id).single();
            if (refreshed) participant = refreshed;

            const updatedCycleInfo = calculateCycleInfo(
              formattedDate,
              participant.cycle_length_days || 28,
              tz
            );

            const msg = `Got it — today is **Day ${updatedCycleInfo.cycleDay}** in your **${updatedCycleInfo.phase}** phase. Updated everywhere.`;

            await supabase.from("chat_messages").insert({
              user_id: user.id,
              role: "assistant",
              content: msg,
              message_type: "text",
              metadata: {
                cycle_day: updatedCycleInfo.cycleDay,
                cycle_phase: updatedCycleInfo.phase,
                ...cycleVisualMeta(userMessage),
                cycle_length_days: participant.cycle_length_days || 28,
                last_period_start: formattedDate,
                timezone: tz,
                period_update: true,
                new_period_start: formattedDate,
              }
            });

            return new Response(
              JSON.stringify({
                success: true,
                message: msg,
                cycleInfo: updatedCycleInfo,
                periodUpdated: true,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

      }
    }

    // --- Phase declaration / update request ("I'm in luteal", "will you update my phase?", etc.) ---
    // Preserve a known Day 1. If the user is postpartum+cycling or otherwise has a real period
    // start on file, update the cycle length estimate so the app reflects her actual phase
    // instead of inventing a new period start date.
    if (participant && participant.life_stage === "cycling" && participant.cycle_length_days) {
      const phaseDeclMatch = userMessage.match(
        /(?:i['’]?m|i\s+am|im)\s+(?:actually\s+|currently\s+|now\s+|definitely\s+|really\s+)?(?:in|on)\s+(?:my\s+|the\s+)?(menstrual|menstruation|period|follicular|ovulation|ovulating|ovulatory|fertile|luteal)(?:\s+phase|\s+window)?/i
      ) || userMessage.match(
        /^\s*(?:no,?\s+)?(?:actually,?\s+)?(?:i['’]?m|i\s+am|im)\s+(?:actually\s+|currently\s+|now\s+|definitely\s+)?(menstruating|ovulating)\b/i
      ) || userMessage.match(
        /^\s*(?:actually\s+,?\s*)?(?:in\s+)?(?:my\s+)?(menstrual|menstruation|follicular|ovulation|ovulating|ovulatory|fertile|luteal)\s+(?:phase|window)\b/i
      ) || userMessage.match(
        /\b(?:switch|put|move|set|change|correct)\s+me\s+(?:to|into|back\s+to)\s+(?:my\s+|the\s+)?(menstrual|menstruation|period|follicular|ovulation|ovulating|ovulatory|fertile|luteal)(?:\s+phase|\s+window)?/i
      ) || userMessage.match(
        /\bi['’]?m\s+(?:not\s+(?:in\s+)?(?:my\s+)?\w+,?\s+)?(?:in\s+)?(?:my\s+)?(menstrual|menstruation|follicular|ovulation|ovulatory|fertile|luteal)\s+(?:phase|window)\b/i
      ) || userMessage.match(
        // Natural corrections: "deep in luteal", "way past ovulation", "much past follicular", "well into luteal"
        /\b(?:deep\s+in|well\s+into|solidly\s+in|way\s+past|much\s+past|far\s+past|past)\s+(?:my\s+|the\s+)?(menstrual|menstruation|follicular|ovulation|ovulatory|fertile|luteal)(?:\s+phase|\s+window)?/i
      ) || userMessage.match(
        // "I'm not in ovulation, I'm in luteal" — capture the SECOND phase
        /\bi['’]?m\s+not\s+(?:in\s+)?(?:my\s+|the\s+)?(?:menstrual|menstruation|follicular|ovulation|ovulating|ovulatory|fertile|luteal)(?:\s+phase|\s+window)?[,;:\s]+(?:i['’]?m|im)?\s*(?:in\s+)?(?:my\s+|the\s+)?(menstrual|menstruation|follicular|ovulation|ovulating|ovulatory|fertile|luteal)\b/i
      ) || userMessage.match(
        // "luteal not ovulation" / "luteal, not ovulation" — capture the FIRST phase (the correct one)
        /\b(menstrual|menstruation|follicular|ovulation|ovulating|ovulatory|fertile|luteal)(?:\s+phase|\s+window)?\s*,?\s+not\s+(?:menstrual|menstruation|follicular|ovulation|ovulating|ovulatory|fertile|luteal)/i
      ) || userMessage.match(
        // "[phase] was N days/weeks ago"
        /\b(menstrual|menstruation|follicular|ovulation|ovulatory|fertile|luteal)(?:\s+phase|\s+window)?\s+was\s+\d+\s+(?:day|week)s?\s+ago/i
      );
      // Implicit corrections that don't carry a phase word — fall back to lastAssistantContent inference below.
      const implicitPastPhaseCorrection = /\b(?:i\s+)?already\s+(ovulated|had\s+my\s+period|got\s+my\s+period|finished\s+(?:my\s+)?period|bled)\b/i.test(userMessage)
        || /\bthat(?:'s|\s+was)\s+(?:been\s+)?(?:like\s+)?\d*\s*(?:day|week)s?\s+ago\b/i.test(userMessage);
      const phaseUpdateRequest = /\b(?:update|change|set|fix|adjust|correct|switch)\b[^.?!]{0,50}\b(?:my\s+)?(?:phase|cycle)\b/i.test(userMessage)
        || /\bwill\s+you\s+(?:update|change|set|fix|adjust|correct|switch)\b[^.?!]{0,50}\b(?:my\s+)?(?:phase|cycle)\b/i.test(userMessage)
        || /\bcan\s+you\s+(?:update|change|set|fix|adjust|correct|switch)\b[^.?!]{0,50}\b(?:my\s+)?(?:phase|cycle)\b/i.test(userMessage);

      const isHypotheticalPhase = /\b(?:thought|think|expected|expect|hoped|wonder(?:ed|ing)?|guess(?:ed|ing)?|supposed\s+to|would\s+(?:be|have|mean)|should\s+be|might\s+be|maybe|if\s+i)\b/i.test(userMessage);
      const isQuestionPhase = /\?/.test(userMessage);

      if ((phaseDeclMatch && !isHypotheticalPhase && !isQuestionPhase) || phaseUpdateRequest || (implicitPastPhaseCorrection && !isQuestionPhase)) {
        const declared = phaseDeclMatch?.[1]?.toLowerCase();
        const cycLen = participant.cycle_length_days;
        const ovDay = cycLen - 14;
        let targetDay: number;
        let phaseLabel = declared ? getDeclaredPhaseFromText(declared) : getDeclaredPhaseFromText(lastAssistantContent);

        if (!phaseLabel) {
          phaseLabel = getDeclaredPhaseFromText(userMessage);
        }

        // Implicit past-phase corrections: "I already ovulated" → Luteal; "already had my period" → Follicular.
        if (!phaseLabel && implicitPastPhaseCorrection) {
          if (/already\s+ovulated/i.test(userMessage)) phaseLabel = "Luteal";
          else if (/already\s+(?:had|got|finished)\s+(?:my\s+)?period|finished\s+bleeding|already\s+bled/i.test(userMessage))
            phaseLabel = "Follicular";
          else phaseLabel = getDeclaredPhaseFromText(lastAssistantContent);
        }

        // "past X" / "X was N days/weeks ago" → user is AFTER that phase. Shift forward one phase.
        const shiftForward = /\b(?:way\s+past|much\s+past|far\s+past|past)\s+(?:my\s+|the\s+)?(?:menstrual|menstruation|follicular|ovulation|ovulatory|fertile|luteal)/i.test(userMessage)
          || /\b(?:menstrual|menstruation|follicular|ovulation|ovulatory|fertile|luteal)(?:\s+phase|\s+window)?\s+was\s+\d+\s+(?:day|week)s?\s+ago/i.test(userMessage);
        if (shiftForward && phaseLabel) {
          const next: Record<string, "Menstruation" | "Follicular" | "Ovulation" | "Luteal"> = {
            Menstruation: "Follicular", Follicular: "Ovulation", Ovulation: "Luteal", Luteal: "Menstruation",
          };
          phaseLabel = next[phaseLabel] ?? phaseLabel;
        }


        if (!phaseLabel) {
          return new Response(
            JSON.stringify({
              success: true,
              message: "I can update that — tell me which phase to set: menstruation, follicular, ovulation, or luteal.",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (phaseLabel === "Menstruation") {
          targetDay = 3; phaseLabel = "Menstruation";
        } else if (phaseLabel === "Follicular") {
          targetDay = Math.max(7, Math.round((6 + (ovDay - 2)) / 2)); phaseLabel = "Follicular";
        } else if (phaseLabel === "Ovulation") {
          targetDay = ovDay; phaseLabel = "Ovulation";
        } else {
          targetDay = Math.min(cycLen - 2, Math.round((ovDay + 3 + cycLen) / 2)); phaseLabel = "Luteal";
        }

        const tz = participant.timezone || "UTC";
        const currentDay = participant.last_period_start ? getCycleDayForToday(participant.last_period_start, tz) : null;
        const inferredLength = currentDay
          ? inferCycleLengthForDeclaredPhase(currentDay, phaseLabel as "Menstruation" | "Follicular" | "Ovulation" | "Luteal", cycLen)
          : null;

        // If the user is already in the phase she's declaring, just confirm — don't touch the cycle.
        const calculatedPhaseNow = participant.last_period_start
          ? calculateCycleInfo(participant.last_period_start, cycLen, tz).phase
          : null;
        if (calculatedPhaseNow === phaseLabel) {
          const msg = `You're already logged as **${phaseLabel}** (Day ${currentDay}). I'm trusting your read — nothing to change.`;
          await supabase.from("chat_messages").insert({
            user_id: user.id, role: "assistant", content: msg, message_type: "text",
            metadata: { cycle_day: currentDay, cycle_phase: phaseLabel, ...cycleVisualMeta(userMessage), cycle_length_days: cycLen, last_period_start: participant.last_period_start, timezone: tz, phase_declared: phaseLabel, phase_confirmed_no_change: true }
          });
          return new Response(JSON.stringify({ success: true, message: msg }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const shouldPreserveDayOne = !!participant.last_period_start && inferredLength !== null && inferredLength !== cycLen;

        if (shouldPreserveDayOne) {
          const { error: updErr } = await supabase
            .from("participants")
            .update({ cycle_length_days: inferredLength, cycle_length_user_override: true })
            .eq("id", participant.id);

          if (!updErr) {
            const { data: refreshed } = await supabase
              .from("participants").select("*").eq("id", participant.id).single();
            if (refreshed) participant = refreshed;

            const updatedCycleInfo = calculateCycleInfo(participant.last_period_start, inferredLength, tz);
            const msg = `Got it — **Day ${updatedCycleInfo.cycleDay}, ${updatedCycleInfo.phase}**. Locking that in. I kept your Day 1 (**${participant.last_period_start}**) exactly where you logged it. Want me to update Day 1 too, or leave it as is?`;

            await supabase.from("cycle_updates").insert({
              participant_id: participant.id,
              update_type: "phase_adjustment",
              category: "cycle",
              description: `User declared ${phaseLabel}; cycle length adjusted from ${cycLen} to ${inferredLength} days based on current Day ${currentDay}.`,
            });


            await supabase.from("chat_messages").insert({
              user_id: user.id,
              role: "assistant",
              content: msg,
              message_type: "text",
              metadata: {
                cycle_day: updatedCycleInfo.cycleDay,
                cycle_phase: updatedCycleInfo.phase,
                ...cycleVisualMeta(userMessage),
                cycle_length_days: inferredLength,
                previous_cycle_length_days: cycLen,
                last_period_start: participant.last_period_start,
                timezone: tz,
                cycle_length_update: true,
                phase_declared: phaseLabel,
                preserved_period_start: true,
              }
            });

            return new Response(
              JSON.stringify({ success: true, message: msg, cycleInfo: updatedCycleInfo, cycleLengthUpdated: true }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });
        const [ty, tm, td] = todayStr.split("-").map(Number);
        const todayLocal = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0));
        todayLocal.setUTCDate(todayLocal.getUTCDate() - (targetDay - 1));
        const formattedDate = todayLocal.toISOString().split("T")[0];

        const { error: updErr } = await supabase
          .from("participants")
          .update({ last_period_start: formattedDate })
          .eq("id", participant.id);

        if (!updErr) {
          const { data: refreshed } = await supabase
            .from("participants").select("*").eq("id", participant.id).single();
          if (refreshed) participant = refreshed;

          const updatedCycleInfo = calculateCycleInfo(formattedDate, cycLen, tz);
          const msg = `Got it — logging you as **${updatedCycleInfo.phase}** (around Day ${updatedCycleInfo.cycleDay}). Updated everywhere. If you remember your actual last period start date, share it and I'll dial it in exactly.`;

          await supabase.from("chat_messages").insert({
            user_id: user.id,
            role: "assistant",
            content: msg,
            message_type: "text",
            metadata: {
              cycle_day: updatedCycleInfo.cycleDay,
              cycle_phase: updatedCycleInfo.phase,
              ...cycleVisualMeta(userMessage),
              cycle_length_days: cycLen,
              last_period_start: formattedDate,
              timezone: tz,
              period_update: true,
              new_period_start: formattedDate,
              phase_declared: phaseLabel,
            }
          });

          return new Response(
            JSON.stringify({ success: true, message: msg, cycleInfo: updatedCycleInfo, periodUpdated: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }
    // --- End cycle edit detection ---

    // --- Meal plan intent detection ---
    // Only trigger the "Build my meal plan" offer card when the user EXPLICITLY asks
    // to build/make/generate a plan or menu. Casual food questions ("what should I eat?")
    // get a normal conversational answer with no offer card.
    let shouldOfferMealPlan = false;
    {
      const mealPlanPatterns: RegExp[] = [
        /\b(make|create|build|generate|design|put together|plan)\b[^.?!]{0,40}\b(meal\s*plan|menu|weekly\s+meals?|cycle[- ]synced\s+(meals?|menu|plan))\b/i,
        /\b(meal\s*plan|cycle[- ]synced\s+(meals?|menu|plan))\b[^.?!]{0,30}\b(for\s+(me|this\s+week|the\s+week|my\s+cycle))\b/i,
        /\b(give me|i want|i'?d like|can you (make|create|build|give|generate))\b[^.?!]{0,40}\b(meal\s*plan|menu|weekly\s+meals?)\b/i,
        /\b(weekly|monthly|cyclical|cycle[- ]synced)\s+(meal\s*plan|menu)\b/i,
        /\b(grocery|shopping)\s+list\b/i,
        // Broader food / nutrition questions — surface the Menu Builder as a helpful next step
        /\bwhat\s+(should|do|can)\s+i\s+(eat|cook|make|have)\b/i,
        /\b(meal|dinner|lunch|breakfast|snack)\s+ideas?\b/i,
        /\bwhat'?s\s+for\s+(dinner|lunch|breakfast)\b/i,
        /\b(recipes?|food)\s+(ideas?|suggestions?|for\s+(my\s+)?(phase|cycle|luteal|follicular|ovulation|menstruation|postpartum|menopause))\b/i,
        /\bhelp\s+me\s+(eat|cook|plan\s+(my\s+)?(meals?|food))\b/i,
      ];
      shouldOfferMealPlan = mealPlanPatterns.some(p => p.test(userMessage));
    }
    // --- End meal plan intent ---

    // --- Third-person detection ---
    // When the user is asking about someone else (friend, mom, sister, partner, etc.)
    // we must NOT log symptoms to their own record and must NOT surface their personal
    // symptom history as if it answered the question.
    const isAboutSomeoneElse =
      /\b(my\s+(friend|mom|mother|sister|daughter|wife|partner|girlfriend|gf|coworker|colleague|aunt|cousin|niece|roommate|boss|client|patient)|a\s+friend|someone\s+i\s+know|she\s+(is|was|has|had|feels|felt|wants|needs|asked|says|said)|her\s+(cycle|period|symptoms|insomnia|sleep|mood))\b/i.test(userMessage)
      && !/\b(i\s*(?:'?m|am|feel|have|had|got))\b/i.test(userMessage);

    // --- Symptom logging from chat ---
    // Detect symptoms mentioned in the user's message and persist to symptom_logs
    // so they sync with the Home tab's symptom widget / history.
    {
      const trimmed = userMessage.trim();

      // Question / hypothetical / negation veto — never log a symptom from
      // "what about X", "is X normal", or "I did not log X" phrasing.
      const shouldVetoSymptomWrite = isSymptomQuestionOrHypothetical(trimmed) || isSymptomNegationOrCorrection(trimmed);

      // (c) Loose reporting intent — same matchers as before so legit reports
      // like "having such bad cramps today" still log.
      const reportingIntent =
        (/\b(i\s*(?:'?m|am)|i\s+(?:have|had|feel|felt|got|woke up)|my\s+(?:head|back|stomach|breasts?|joints?|chest|skin)|having|feeling|craving|today i|tonight|this morning|right now)\b/i.test(trimmed)
         || /\b(log|track|record|note)\b/i.test(trimmed))
        && !shouldVetoSymptomWrite;

      const isHistoricalLookupQuestion = /\b(check|look\s*(?:up|at|back)|anything|any|did i|do i have|was there|were there|show|see|find)\b/i.test(userMessage)
        && /\b(history|historical|log|logs|logged|march|april|may|june|july|august|september|october|november|december|january|february|last\s+(?:month|cycle|time)|same\s+time)\b/i.test(userMessage);

      if (reportingIntent && !isHistoricalLookupQuestion && !isAboutSomeoneElse) {

        const detected = detectSymptomMentions(userMessage);

        if (detected.length > 0) {
          const liveCycle = participant?.last_period_start && participant?.cycle_length_days
            ? calculateCycleInfo(participant.last_period_start, participant.cycle_length_days, participant.timezone || "UTC")
            : null;

          const { error: symLogErr } = await supabase.from("symptom_logs").insert({
            user_id: user.id,
            symptoms: detected,
            notes: userMessage.length <= 500 ? userMessage : userMessage.slice(0, 500),
            cycle_day: liveCycle?.cycleDay ?? null,
            cycle_phase: liveCycle?.phase ?? null,
          });
          if (symLogErr) {
            console.error("Failed to insert symptom log from chat:", symLogErr);
          } else {
            console.log("Logged symptoms from chat:", detected.map(d => d.name).join(", "));
          }
        }
      }
    }
    // --- End symptom logging ---

    // --- Backfill symptom logs for past dates (user asks Logan to add them) ---
    // e.g. "log insomnia for April 15 and April 22", "add insomnia on Apr 15, Apr 22",
    // "go ahead and add insomnia to April 15 and 22", "yes please add those".
    let backfillConfirmation = "";
    {
      const backfillIntent = /\b(add|log|save|record|put|backfill|move|file|enter|insert|create)\b/i.test(userMessage)
        || /\b(go ahead|yes please|please do|do it|please add|do that)\b/i.test(userMessage);

      if (backfillIntent) {
        // Build a search text from the current message + recent chat thread so
        // short confirmations ("yes please add", "go ahead", "please try add now")
        // still pick up the symptom + dates that were discussed moments earlier.
        let searchText = userMessage;
        let recentMsgs: Array<{ content: string; role: string }> = [];
        try {
          const { data: recent } = await supabase
            .from("chat_messages")
            .select("content, role")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(12);
          recentMsgs = (recent || []) as any;
          // Prepend recent context (newest first) so regexes can find dates/symptoms
          searchText = userMessage + "\n" + recentMsgs.map(m => String(m.content || "")).join("\n");
        } catch (_) {}

        // Pull symptoms from this message, or fall back to the recent chat thread
        let symptoms = detectSymptomMentions(userMessage);
        if (symptoms.length === 0) {
          for (const m of recentMsgs) {
            const found = detectSymptomMentions(String(m.content || ""));
            if (found.length) { symptoms = found; break; }
          }
        }

        // Extract explicit dates from current message; if none, scan recent chat
        const dates: Date[] = [];
        const today = new Date();
        const monthMap: Record<string, number> = {
          jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
          may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
          sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
        };
        const monthDayRx = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?(?:\s*(?:,|and|&|\+)\s*(\d{1,2})(?:st|nd|rd|th)?)*/gi;
        const scanForDates = (text: string) => {
          let mm: RegExpExecArray | null;
          const rx = new RegExp(monthDayRx.source, monthDayRx.flags);
          while ((mm = rx.exec(text)) !== null) {
            const month = monthMap[mm[1].toLowerCase()];
            let year = mm[3] ? +mm[3] : today.getUTCFullYear();
            if (!mm[3] && month > today.getUTCMonth()) year -= 1;
            const primaryDay = +mm[2];
            dates.push(new Date(Date.UTC(year, month, primaryDay, 12)));
            const tail = mm[0].slice(mm[0].toLowerCase().indexOf(mm[2]) + mm[2].length);
            const extraRx = /(?:,|and|&|\+)\s*(\d{1,2})(?:st|nd|rd|th)?/gi;
            let em: RegExpExecArray | null;
            while ((em = extraRx.exec(tail)) !== null) {
              const d = +em[1];
              if (d >= 1 && d <= 31) dates.push(new Date(Date.UTC(year, month, d, 12)));
            }
          }
          const isoRx = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
          let im: RegExpExecArray | null;
          while ((im = isoRx.exec(text)) !== null) {
            dates.push(new Date(Date.UTC(+im[1], +im[2] - 1, +im[3], 12)));
          }
        };
        scanForDates(userMessage);
        if (dates.length === 0) scanForDates(searchText);



        // De-dupe and keep only past or today
        const uniq = new Map<string, Date>();
        for (const d of dates) {
          if (isNaN(d.getTime())) continue;
          if (d.getTime() > today.getTime() + 24 * 3600 * 1000) continue;
          uniq.set(d.toISOString().slice(0, 10), d);
        }

        if (symptoms.length > 0 && uniq.size > 0) {
          const rows = Array.from(uniq.values()).map(d => ({
            user_id: user.id,
            symptoms,
            notes: `Backfilled from chat: ${userMessage.slice(0, 300)}`,
            cycle_day: null,
            cycle_phase: null,
            logged_at: d.toISOString(),
          }));

          const { error: backfillErr } = await supabase.from("symptom_logs").insert(rows);
          if (backfillErr) {
            console.error("Backfill insert failed:", backfillErr);
          } else {
            const dateLabels = Array.from(uniq.values())
              .sort((a, b) => a.getTime() - b.getTime())
              .map(d => `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`)
              .join(", ");
            const symptomLabels = symptoms.map(s => s.name).join(", ");
            backfillConfirmation = `Internal note (do NOT quote, paraphrase, or repeat this note, do NOT mention any tag, label, brackets, or the word "confirmed"): The system has saved ${symptomLabels} to her symptom log for: ${dateLabels}. In your reply, just say naturally: "Done — added ${symptomLabels} for ${dateLabels}." Do NOT include any bracketed tag, do NOT tell her to add it from the Home tab.`;
            console.log("Backfilled symptom logs:", dateLabels, "->", symptomLabels);
          }
        }
      }
    }
    // --- End backfill ---

    // --- Community symptom library add ---
    // When the user asks Logan to track / record symptoms that aren't standard, Logan
    // asks permission and lists candidates as inline-code (`name`) in her reply. When
    // the user confirms ("yes please add"), we look at the last assistant message,
    // extract the inline-code names, dedupe against the built-in catalog + existing
    // community_symptoms, and insert the truly new ones into the shared library.
    let libraryConfirmation = "";
    const knownLibraryNames: string[] = SYMPTOM_KEYWORDS.map(s => s.name);
    {
      try {
        const { data: commRows } = await supabase
          .from("community_symptoms")
          .select("name")
          .order("created_at", { ascending: false })
          .limit(500);
        for (const r of (commRows || []) as any[]) {
          if (r?.name) knownLibraryNames.push(String(r.name));
        }
      } catch (_) {}
      const knownLower = new Set(knownLibraryNames.map(n => n.trim().toLowerCase()));

      const affirmative = /\b(?:yes|yeah|yep|yup|sure|please do|please add|ok|okay|go ahead|do it|add (?:them|those|it|all)|sounds good|sgtm)\b/i.test(userMessage);
      const explicitAdd = /\b(?:add|include|put)\b[^.?!]*\blibrary\b/i.test(userMessage);

      if (affirmative || explicitAdd) {
        try {
          const { data: recent2 } = await supabase
            .from("chat_messages")
            .select("content, role, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(6);
          const lastAssistant = ((recent2 || []) as any[]).find(m => m.role === "assistant");
          if (lastAssistant && /\blibrary\b/i.test(String(lastAssistant.content))) {
            const content = String(lastAssistant.content);
            const matches = Array.from(content.matchAll(/`([^`\n]{1,60})`/g));
            const candidates = matches
              .map(m => m[1].trim().replace(/^["'`]+|["'`]+$/g, ""))
              .filter(s => s.length > 1 && s.length < 60 && /[a-zA-Z]/.test(s));
            const newOnes: string[] = [];
            const seen = new Set<string>();
            for (const c of candidates) {
              const lc = c.toLowerCase();
              if (seen.has(lc) || knownLower.has(lc)) continue;
              seen.add(lc);
              newOnes.push(c);
            }
            if (newOnes.length > 0) {
              const rows = newOnes.map(name => ({ name: name.toLowerCase(), added_by: user.id }));
              const { error: addErr } = await supabase
                .from("community_symptoms")
                .insert(rows);
              if (addErr) {
                console.error("Community symptom add failed:", addErr);
              } else {
                const list = newOnes.join(", ");
                libraryConfirmation = `Internal note (do NOT quote, paraphrase, or repeat this note, do NOT mention any tag, label, or brackets): The system has added these to the shared symptom library anonymously: ${list}. In your reply, say naturally: "Done — added ${list} to the shared symptom library. You'll find them in Home → Log Symptoms next time you open it." Do NOT include any bracketed tag.`;
                console.log("Added to community_symptoms:", list);
              }
            }

          }
        } catch (e) {
          console.error("Library add block error:", e);
        }
      }
    }
    // --- End community symptom library add ---

    const currentMessageMentionsKnownSymptom = detectSymptomMentions(userMessage).length > 0
      || mentionsKnownLibrarySymptom(userMessage, knownLibraryNames);
    const isCurrentSymptomQuestion = currentMessageMentionsKnownSymptom && isSymptomQuestionOrHypothetical(userMessage) && !hasPersonalSymptomContext(userMessage);
    const isCurrentSymptomNegation = currentMessageMentionsKnownSymptom && isSymptomNegationOrCorrection(userMessage);




    // --- Manual life-stage corrections (menopause / perimenopause / cycling) ---
    if (participant) {
      // Perimenopause: "I'm in perimenopause", "I'm perimenopausal", "I'm peri", "peri-menopausal"
      const perimenopauseSignal =
        /\b(?:i'?m|i\s+am|currently)\s+(?:in\s+)?peri[-\s]?menopaus(?:e|al)\b/i.test(userMessage)
        || /\bi'?m\s+peri[-\s]?menopausal\b/i.test(userMessage)
        || /\b(?:i'?m|i\s+am)\s+in\s+peri\b/i.test(userMessage)
        || (/\bperi[-\s]?menopaus(?:e|al)\b/i.test(userMessage) && !/\bnot\s+peri/i.test(userMessage));

      // Full menopause ONLY — must not also match perimenopause
      const menopauseSignal = !perimenopauseSignal && (
        /\b(?:i'?m|i\s+am|i'?ve\s+(?:gone|been)\s+through|currently)\s+(?:in\s+)?menopaus(?:e|al)\b/i.test(userMessage)
        || /\bi'?m\s+menopausal\b/i.test(userMessage)
      );

      // Cycling correction: "I'm not in menopause", "I still get my period", "I'm actually still cycling"
      const cyclingSignal = /\b(?:i'?m\s+not|not)\s+(?:in\s+)?(?:peri[-\s]?)?menopaus/i.test(userMessage)
        || /\b(?:i'?m\s+actually|actually)\s+(?:still\s+)?cycling\b/i.test(userMessage)
        || /\bi\s+still\s+(?:get|have)\s+(?:my\s+)?periods?\b/i.test(userMessage)
        || /\b(?:i'?m|i\s+am)\s+(?:still\s+)?cycling\b/i.test(userMessage)
        || /\bi'?m\s+not\s+postpartum\b/i.test(userMessage);

      // Irregular / hormonal birth control: "I'm on the pill", "I have an IUD", "I'm on hormonal BC", "PCOS", "irregular cycle"
      const irregularSignal =
        /\b(?:i'?m|i\s+am|just\s+(?:started|got)|started|recently\s+started|switched\s+to|now\s+on|currently\s+on|going\s+on)\s+(?:on\s+)?(?:the\s+)?(?:pill|mini[-\s]?pill|combined\s+pill|birth\s+control(?:\s+pill)?|hormonal\s+(?:birth\s+control|bc|iud|contracepti(?:on|ve))|nuvaring|the\s+ring|the\s+patch|nexplanon|the\s+implant|depo(?:[-\s]provera)?|mirena|kyleena|skyla|liletta)\b/i.test(userMessage)
        || /\b(?:i\s+have|got|just\s+got|just\s+had)\s+(?:an?\s+)?(?:hormonal\s+)?(?:iud|implant|nexplanon|mirena|kyleena|skyla|liletta|nuvaring|patch)\s+(?:put\s+in|inserted|placed)?\b/i.test(userMessage)
        || /\b(?:change|switch|update|set)\s+(?:my\s+)?(?:settings?|account|life\s+stage|profile)\s+(?:to|for)\s+(?:hormonal\s+(?:birth\s+control|bc)|birth\s+control|irregular|the\s+pill|iud)\b/i.test(userMessage)
        || /\b(?:i\s+have|i'?ve\s+got|diagnosed\s+with)\s+(?:pcos|hypothalamic\s+amenorrhea)\b/i.test(userMessage)
        || /\b(?:my\s+)?(?:cycles?\s+(?:are|is)|periods?\s+(?:are|is))\s+(?:really\s+)?irregular\b/i.test(userMessage);

      // Cycling wins over menopause if both somehow match
      if (cyclingSignal && participant.life_stage !== "cycling") {
        await supabase
          .from("participants")
          .update({ life_stage: "cycling", postpartum_start_date: null })
          .eq("id", participant.id);
        const { data: refreshed } = await supabase.from("participants").select("*").eq("id", participant.id).single();
        if (refreshed) participant = refreshed;

        const msg = `Got it — switching you to **cycling** mode. When did your last period start? Even an approximate date helps me get your timing right.`;
        await supabase.from("chat_messages").insert({
          user_id: user.id,
          role: "assistant",
          content: msg,
          message_type: "text",
          metadata: { life_stage_updated: "cycling", awaiting_period_date: true },
        });
        return new Response(
          JSON.stringify({ success: true, message: msg, lifeStageUpdated: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (irregularSignal && !cyclingSignal && !perimenopauseSignal && participant.life_stage !== "irregular") {
        await supabase
          .from("participants")
          .update({ life_stage: "irregular", postpartum_start_date: null, last_period_start: null })
          .eq("id", participant.id);
        const { data: refreshed } = await supabase.from("participants").select("*").eq("id", participant.id).single();
        if (refreshed) participant = refreshed;

        const msg = `Done — switched your account to **hormonal birth control / irregular cycle** mode. I'll stop predicting natural phases and instead focus on steady-state levers: sleep, protein, strength, stress, hydration, and the micronutrients hormonal BC can deplete (B6, B12, magnesium, zinc, folate). Anything specific you want to dig into first?`;
        await supabase.from("chat_messages").insert({
          user_id: user.id,
          role: "assistant",
          content: msg,
          message_type: "text",
          metadata: { life_stage_updated: "irregular" },
        });
        return new Response(
          JSON.stringify({ success: true, message: msg, lifeStageUpdated: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (perimenopauseSignal && !cyclingSignal && participant.life_stage !== "perimenopause") {
        await supabase
          .from("participants")
          .update({ life_stage: "perimenopause", postpartum_start_date: null })
          .eq("id", participant.id);
        const { data: refreshed } = await supabase.from("participants").select("*").eq("id", participant.id).single();
        if (refreshed) participant = refreshed;

        const msg = `Got it — noting you're in **perimenopause**. You're still cycling, so I'll keep tracking your phases while factoring in the hormonal shifts (irregular cycles, sleep changes, mood swings, hot flashes) that come with this stage. When did your last period start?`;
        await supabase.from("chat_messages").insert({
          user_id: user.id,
          role: "assistant",
          content: msg,
          message_type: "text",
          metadata: { life_stage_updated: "perimenopause", awaiting_period_date: true },
        });
        return new Response(
          JSON.stringify({ success: true, message: msg, lifeStageUpdated: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (menopauseSignal && !cyclingSignal && !perimenopauseSignal && participant.life_stage !== "menopause") {
        await supabase
          .from("participants")
          .update({ life_stage: "menopause", last_period_start: null, postpartum_start_date: null })
          .eq("id", participant.id);
        const { data: refreshed } = await supabase.from("participants").select("*").eq("id", participant.id).single();
        if (refreshed) participant = refreshed;

        const msg = `Got it — switching you to **menopause** mode. I'll stop tracking cycle phases and focus on energy, sleep, and symptom patterns instead.`;
        await supabase.from("chat_messages").insert({
          user_id: user.id,
          role: "assistant",
          content: msg,
          message_type: "text",
          metadata: { life_stage_updated: "menopause" },
        });
        return new Response(
          JSON.stringify({ success: true, message: msg, lifeStageUpdated: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // --- Pregnancy loss / miscarriage detection ---
      const lossSignal =
        /\b(miscarriage|miscarried|misscarriage|misscarried|pregnancy\s+loss|lost\s+(the|my|our)\s+(baby|pregnancy)|lost\s+the\s+pregnancy|had\s+a\s+(loss|d&c|d\s*and\s*c)|stillbirth|stillborn|chemical\s+pregnancy|ectopic|missed\s+miscarriage|blighted\s+ovum)\b/i.test(userMessage);
      const lossExit =
        /\b(i'?m\s+ready\s+to\s+(move\s+on|cycle\s+again|track\s+again)|switch\s+me\s+back\s+to\s+cycling|exit\s+(loss|recovery)\s+mode|i'?m\s+done\s+with\s+recovery)\b/i.test(userMessage)
        && participant.life_stage === "pregnancy_loss";

      if (lossSignal && participant.life_stage !== "pregnancy_loss") {
        // Try to extract a date; otherwise default to today
        const today = new Date().toISOString().slice(0, 10);
        await supabase
          .from("participants")
          .update({
            life_stage: "pregnancy_loss",
            loss_date: today,
            last_period_start: null,
            postpartum_active: false,
            postpartum_start_date: null,
          })
          .eq("id", participant.id);
        const { data: refreshed } = await supabase.from("participants").select("*").eq("id", participant.id).single();
        if (refreshed) participant = refreshed;

        const msg = `I'm so sorry. I'm here with you — there's no rush, no agenda, and nothing you have to do right now.\n\nI've gently paused cycle tracking and switched into **recovery mode**. We'll go at your pace: rest, bleeding, sleep, appetite, mood — whatever you want to share, or nothing at all.\n\nIf any of these show up, please contact your provider right away: heavy bleeding (soaking a pad an hour for 2+ hours), fever over 100.4°F, severe pain, foul-smelling discharge, or fainting.\n\nWould it help to tell me a little about how you're feeling today — physically or emotionally?`;
        await supabase.from("chat_messages").insert({
          user_id: user.id,
          role: "assistant",
          content: msg,
          message_type: "text",
          metadata: { life_stage_updated: "pregnancy_loss" },
        });
        return new Response(
          JSON.stringify({ success: true, message: msg, lifeStageUpdated: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (lossExit) {
        await supabase
          .from("participants")
          .update({ life_stage: "cycling", loss_date: null })
          .eq("id", participant.id);
        const { data: refreshed } = await supabase.from("participants").select("*").eq("id", participant.id).single();
        if (refreshed) participant = refreshed;

        const msg = `Holding that with care. I've switched you back to **cycling mode** — your history here stays exactly as it is. When did your last period start? We'll pick up from there, gently.`;
        await supabase.from("chat_messages").insert({
          user_id: user.id,
          role: "assistant",
          content: msg,
          message_type: "text",
          metadata: { life_stage_updated: "cycling", awaiting_period_date: true },
        });
        return new Response(
          JSON.stringify({ success: true, message: msg, lifeStageUpdated: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // --- Pregnancy detection ---
      // Trigger only on clear self-statements ("I'm pregnant", "I just found out I'm pregnant", "I'm X weeks pregnant").
      // Do NOT trigger on questions like "could I be pregnant?" or third-party mentions.
      const pregnancySignal =
        /\b(i'?m|i\s+am|just\s+found\s+out\s+i'?m|just\s+confirmed\s+i'?m|we'?re|we\s+are)\s+(pregnant|expecting|having\s+a\s+baby)\b/i.test(userMessage)
        || /\bi'?m\s+\d{1,2}\s+weeks?\s+(pregnant|along)\b/i.test(userMessage)
        || /\b(positive\s+pregnancy\s+test|positive\s+test\s+today|two\s+lines\s+today|bfp)\b/i.test(userMessage);
      const pregnancyExit =
        /\b(i\s+had\s+the\s+baby|baby\s+(is\s+)?here|gave\s+birth|delivered|switch\s+me\s+to\s+postpartum|switch\s+to\s+postpartum|i'?m\s+postpartum\s+now|no\s+longer\s+pregnant|lost\s+the\s+baby|miscarried)\b/i.test(userMessage)
        && participant.life_stage === "pregnant";

      if (pregnancySignal && participant.life_stage !== "pregnant" && participant.life_stage !== "pregnancy_loss") {
        // Try to extract weeks pregnant; LMP/due date will be asked.
        const weeksMatch = userMessage.match(/\b(\d{1,2})\s+weeks?\b/i);
        const weeksAlong = weeksMatch ? parseInt(weeksMatch[1]) : null;
        let lmp: string | null = null;
        if (weeksAlong && weeksAlong > 0 && weeksAlong < 45) {
          const lmpDate = new Date();
          lmpDate.setDate(lmpDate.getDate() - weeksAlong * 7);
          lmp = lmpDate.toISOString().slice(0, 10);
        }
        await supabase
          .from("participants")
          .update({
            life_stage: "pregnant",
            pregnancy_lmp: lmp,
            last_period_start: null,
            postpartum_active: false,
            postpartum_start_date: null,
            loss_date: null,
          })
          .eq("id", participant.id);
        const { data: refreshed } = await supabase.from("participants").select("*").eq("id", participant.id).single();
        if (refreshed) participant = refreshed;

        const msg = `Oh wow — congratulations. 🌱\n\nI've switched into **pregnancy mode**, so cycle tracking is paused and I'll focus on what actually matters now: symptoms, sleep, energy, nutrition, safe movement, and the real red flags to watch for.\n\nQuick anchor so I can speak in trimesters and weeks: do you know either your **last menstrual period (LMP)** or your **due date**? You can also tell me how many weeks along you are. Totally fine to skip — you can update it in Settings anytime.\n\nAnd a soft reminder: heavy bleeding, severe pain, fever over 100.4°F / 38°C, persistent vomiting, or sudden swelling — please call your provider.`;
        await supabase.from("chat_messages").insert({
          user_id: user.id,
          role: "assistant",
          content: msg,
          message_type: "text",
          metadata: { life_stage_updated: "pregnant" },
        });
        return new Response(
          JSON.stringify({ success: true, message: msg, lifeStageUpdated: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (pregnancyExit) {
        // If she said she lost the baby, switch to pregnancy_loss; otherwise postpartum.
        const toLoss = /\b(lost\s+the\s+baby|miscarried|miscarriage)\b/i.test(userMessage);
        const today = new Date().toISOString().slice(0, 10);
        await supabase
          .from("participants")
          .update(toLoss
            ? { life_stage: "pregnancy_loss", loss_date: today, due_date: null, pregnancy_lmp: null }
            : { life_stage: "postpartum", postpartum_active: false, postpartum_start_date: today, due_date: null, pregnancy_lmp: null }
          )
          .eq("id", participant.id);
        const { data: refreshed } = await supabase.from("participants").select("*").eq("id", participant.id).single();
        if (refreshed) participant = refreshed;
        const msg = toLoss
          ? `I'm so sorry. I've switched us into recovery mode and paused everything else. We move at your pace from here.`
          : `Congratulations 💛 — I've switched into **postpartum mode**. I'll layer in recovery context (sleep, iron, pelvic floor, mood) from today. If the birth date isn't today, just tell me when, and I'll update it.`;
        await supabase.from("chat_messages").insert({
          user_id: user.id,
          role: "assistant",
          content: msg,
          message_type: "text",
          metadata: { life_stage_updated: toLoss ? "pregnancy_loss" : "postpartum" },
        });
        return new Response(
          JSON.stringify({ success: true, message: msg, lifeStageUpdated: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // --- Pregnancy LMP / due date / weeks-along updates (already pregnant) ---
      if (participant.life_stage === "pregnant") {
        const msg = userMessage;
        const lowerMsg = msg.toLowerCase();

        // Skip questions/hypotheticals.
        const isQuestion = /\?\s*$/.test(msg.trim()) || /^(what|when|how|is|are|do|does|could|should|would|will)\b/i.test(msg.trim());

        // Extract a date phrase after common cue words.
        const dateRx = /((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,?\s*\d{2,4})?|\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i;

        const lmpCue = /\b(last\s+(missed\s+)?period|last\s+menstrual\s+period|lmp|missed\s+my\s+period|my\s+period\s+was|last\s+cycle\s+started|period\s+started)\b/i;
        const dueCue = /\b(due\s+date|due\s+on|i'?m\s+due|baby\s+is\s+due|edd|estimated\s+due\s+date)\b/i;

        let newLmp: string | null = null;
        let newDue: string | null = null;
        let source: "lmp" | "due" | "weeks" | null = null;

        if (!isQuestion) {
          const lmpMatch = lmpCue.test(msg) ? msg.match(dateRx) : null;
          if (lmpMatch) {
            const parsed = parseExplicitCalendarDate(lmpMatch[1]);
            if (parsed) {
              newLmp = dateOnly(parsed);
              const dueD = new Date(parsed);
              dueD.setUTCDate(dueD.getUTCDate() + 280);
              newDue = dateOnly(dueD);
              source = "lmp";
            }
          }

          if (!source && dueCue.test(msg)) {
            const dueMatch = msg.match(dateRx);
            if (dueMatch) {
              const parsed = parseExplicitCalendarDate(dueMatch[1]);
              if (parsed) {
                newDue = dateOnly(parsed);
                const lmpD = new Date(parsed);
                lmpD.setUTCDate(lmpD.getUTCDate() - 280);
                newLmp = dateOnly(lmpD);
                source = "due";
              }
            }
          }

          // "I'm X weeks pregnant / along" — back-calculate LMP.
          if (!source) {
            const wkMatch = msg.match(/\b(?:i'?m|i\s+am)\s+(\d{1,2})\s+weeks?\s+(?:pregnant|along)\b/i)
              || msg.match(/\b(\d{1,2})\s+weeks?\s+(?:pregnant|along)\b/i);
            if (wkMatch) {
              const wks = parseInt(wkMatch[1], 10);
              if (wks > 0 && wks < 45) {
                const lmpD = new Date();
                lmpD.setUTCDate(lmpD.getUTCDate() - wks * 7);
                newLmp = dateOnly(lmpD);
                const dueD = new Date(lmpD);
                dueD.setUTCDate(dueD.getUTCDate() + 280);
                newDue = dateOnly(dueD);
                source = "weeks";
              }
            }
          }

          // Trimester declaration — approximate LMP to midpoint of trimester.
          if (!source) {
            const triMatch = msg.match(/\b(?:i'?m\s+in\s+my|i'?m|in\s+my)\s+(first|second|third|1st|2nd|3rd)\s+trimester\b/i);
            if (triMatch) {
              const tri = triMatch[1].toLowerCase();
              const midWeeks = tri.startsWith("f") || tri === "1st" ? 7 : tri.startsWith("s") || tri === "2nd" ? 20 : 33;
              const lmpD = new Date();
              lmpD.setUTCDate(lmpD.getUTCDate() - midWeeks * 7);
              newLmp = dateOnly(lmpD);
              const dueD = new Date(lmpD);
              dueD.setUTCDate(dueD.getUTCDate() + 280);
              newDue = dateOnly(dueD);
              source = "weeks";
            }
          }
        }

        if (source && newLmp && newDue) {
          await supabase
            .from("participants")
            .update({ pregnancy_lmp: newLmp, due_date: newDue })
            .eq("id", participant.id);
          const { data: refreshed } = await supabase.from("participants").select("*").eq("id", participant.id).single();
          if (refreshed) participant = refreshed;

          const lmpD = parseExplicitCalendarDate(newLmp)!;
          const now = new Date();
          const gestDays = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(lmpD.getUTCFullYear(), lmpD.getUTCMonth(), lmpD.getUTCDate())) / 86400000);
          const gWeeks = Math.floor(gestDays / 7);
          const gDays = gestDays % 7;
          const tri = gWeeks <= 13 ? 1 : gWeeks <= 27 ? 2 : 3;

          const dueD = parseExplicitCalendarDate(newDue)!;
          const dueLabel = `${MONTH_NAMES[dueD.getUTCMonth()]} ${dueD.getUTCDate()}, ${dueD.getUTCFullYear()}`;
          const lmpLabel = `${MONTH_NAMES[lmpD.getUTCMonth()]} ${lmpD.getUTCDate()}, ${lmpD.getUTCFullYear()}`;

          const ackMsg = source === "due"
            ? `Got it — due date **${dueLabel}** saved. That puts you at around **week ${gWeeks}${gDays ? ` + ${gDays}d` : ""}, trimester ${tri}** (LMP ≈ ${lmpLabel}). Your Home and Plan tabs will update to match.`
            : source === "weeks"
            ? `Saved — around **week ${gWeeks}${gDays ? ` + ${gDays}d` : ""}, trimester ${tri}**, LMP ≈ ${lmpLabel}, due ≈ ${dueLabel}. You can fine-tune either date anytime in Settings.`
            : `Got it — LMP **${lmpLabel}** saved. You're at **week ${gWeeks}${gDays ? ` + ${gDays}d` : ""}, trimester ${tri}**, due date ≈ **${dueLabel}**. Home and Plan tabs will reflect this now.`;

          await supabase.from("chat_messages").insert({
            user_id: user.id,
            role: "assistant",
            content: ackMsg,
            message_type: "text",
            metadata: { pregnancy_dates_updated: true, pregnancy_lmp: newLmp, due_date: newDue },
          });
          return new Response(
            JSON.stringify({ success: true, message: ackMsg, pregnancyDatesUpdated: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      // --- End pregnancy date updates ---
    }
    // --- End life-stage corrections ---



    // --- Postpartum life-stage / birth-date detection ---
    if (participant) {
      const lowerMsg = userMessage.toLowerCase();

      // User asks to fix/correct/update their account, postpartum/birth date, but provides NO date.
      // We must NOT silently confirm — instead ask for the actual date and set awaiting flag.
      const fixAccountIntent =
        /\b(fix|correct|update|change|edit)\b.*\b(account|profile|postpartum|birth\s*date|baby'?s?\s*birth|baby'?s?\s*date|date|status|stage)\b/i.test(userMessage)
        || /\bthat'?s?\s+wrong\b/i.test(userMessage)
        || /\b(?:i'?m\s+not|i\s+am\s+not)\s+\d+\s*(?:weeks?|months?|years?)\s*(?:postpartum|pp)\b/i.test(userMessage)
        || /\bwhy\s+(?:do\s+you\s+think|does\s+it\s+say)\b.*\b(?:postpartum|pp|weeks?|months?)\b/i.test(userMessage)
        || /\bstill\s+says?\b.*\b(?:weeks?|months?|postpartum)\b/i.test(userMessage);

      const hasExplicitDateInMsg =
        /\b(?:gave\s+birth|had\s+(?:my\s+)?baby|baby\s+(?:was\s+)?born|delivered)\s+(?:on\s+)?(?:the\s+)?\w+\s+\d{1,2}/i.test(userMessage)
        || /\b\w+\s+\d{1,2},?\s*(?:19|20)\d{2}\b/.test(userMessage)
        || /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/.test(userMessage);

      if (fixAccountIntent && !hasExplicitDateInMsg && participant.life_stage === "postpartum") {
        const msg = `You're right — I can't fix it without the actual date. What's your baby's birth date (month, day, year is perfect)? Once you tell me, I'll lock it in and the timeline will be accurate everywhere.`;
        await supabase.from("chat_messages").insert({
          user_id: user.id,
          role: "assistant",
          content: msg,
          message_type: "text",
          metadata: { awaiting_birth_date: true },
        });
        return new Response(
          JSON.stringify({ success: true, message: msg, awaitingBirthDate: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Patterns for "X months/weeks/days postpartum" or "X months/weeks after giving birth"
      const ppDurationMatch = userMessage.match(
        /(\d{1,2})\s*(month|months|week|weeks|day|days)\s*(?:postpartum|pp|after\s+(?:giving\s+)?birth|after\s+(?:my\s+)?baby|since\s+(?:i\s+)?(?:gave\s+birth|had\s+(?:my\s+)?baby))/i
      ) || userMessage.match(
        /(?:i'?m|i\s+am|currently)\s+(\d{1,2})\s*(month|months|week|weeks)\s*(?:postpartum|pp)/i
      );

      // Pattern for explicit birth date: "gave birth on March 5", "baby born April 12", "had my baby on Jan 3"
      const ppDateMatch = userMessage.match(
        /(?:gave\s+birth|had\s+(?:my\s+)?baby|baby\s+(?:was\s+)?born|delivered)\s+(?:on\s+)?(?:the\s+)?(\w+\s+\d{1,2}(?:,?\s*\d{4})?)/i
      );

      // EXPLICIT switch intent only — sharing context like "I had a baby 12 weeks ago"
      // must NOT auto-flip life stage. Require an explicit "switch me to postpartum" or
      // a present-tense self-identification ("I'm postpartum", "I just had a baby").
      const explicitSwitchIntent = /\b(?:switch|change|set|put|move)\s+(?:me\s+)?(?:back\s+)?(?:to|in(?:to)?)\s+postpartum\b/i.test(userMessage)
        || /\bback\s+to\s+postpartum\b/i.test(userMessage)
        || /\b(?:i'?m|i\s+am|currently)\s+(?:still\s+)?postpartum\b/i.test(userMessage)
        || /\bjust\s+had\s+(?:a\s+)?baby\b/i.test(userMessage);

      // Already-postpartum users mentioning a duration/date are just refining their birth date.
      const refiningExistingPostpartum = participant.life_stage === "postpartum" && (ppDurationMatch || ppDateMatch);

      const isPostpartumSignal = explicitSwitchIntent || refiningExistingPostpartum;

      if (isPostpartumSignal) {
        let computedStartDate: string | null = null;
        let askForDate = false;

        if (ppDateMatch) {
          const parsed = parseExplicitCalendarDate(ppDateMatch[1]);
          if (parsed && parsed <= new Date()) {
            computedStartDate = dateOnly(parsed);
          }
        } else if (ppDurationMatch) {
          const n = parseInt(ppDurationMatch[1]);
          const unit = ppDurationMatch[2].toLowerCase();
          const days = unit.startsWith("month") ? n * 30 : unit.startsWith("week") ? n * 7 : n;
          const d = new Date();
          d.setDate(d.getDate() - days);
          computedStartDate = d.toISOString().split("T")[0];
          // Even with a duration, ask for the exact date for accuracy
          askForDate = true;
        } else {
          askForDate = true;
        }

        // Only act if life stage is changing OR start date is missing/changing
        const needsLifeStageSwitch = participant.life_stage !== "postpartum";
        const needsDateUpdate = computedStartDate && participant.postpartum_start_date !== computedStartDate;

        if (needsLifeStageSwitch || needsDateUpdate) {
          const updatePayload: any = { life_stage: "postpartum" };
          if (computedStartDate) updatePayload.postpartum_start_date = computedStartDate;

          const { error: ppUpdateErr } = await supabase
            .from("participants")
            .update(updatePayload)
            .eq("id", participant.id);

          if (!ppUpdateErr) {
            const { data: refreshed } = await supabase
              .from("participants")
              .select("*")
              .eq("id", participant.id)
              .single();
            if (refreshed) participant = refreshed;

            let msg = "";
            if (computedStartDate && !askForDate) {
              // User gave an explicit date — just confirm, don't ask again.
              const friendlyDate = new Date(computedStartDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
              msg = `Got it — switching you over to **postpartum** mode and locking in **${friendlyDate}** as your baby's birth date. Your recovery timeline is now tracked from there.`;
            } else if (computedStartDate) {
              // We inferred a date from a duration ("3 months postpartum") — confirm the approximation and offer to refine.
              const friendlyDate = new Date(computedStartDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
              msg = `Got it — switching you over to **postpartum** mode. Based on what you shared, I've estimated your baby's birth around **${friendlyDate}**.\n\nIf you have the exact date, share it and I'll update — otherwise this is close enough to track your recovery timeline.`;
            } else {
              msg = `Got it — switching you over to **postpartum** mode. To track your recovery timeline accurately, what's your baby's birth date? An approximate one is fine.`;
            }

            await supabase.from("chat_messages").insert({
              user_id: user.id,
              role: "assistant",
              content: msg,
              message_type: "text",
              metadata: {
                ...cycleVisualMeta(userMessage),
                life_stage: "postpartum",
                postpartum_start_date: computedStartDate || participant.postpartum_start_date,
                postpartum_update: true,
                awaiting_birth_date: askForDate,
              }
            });

            return new Response(
              JSON.stringify({
                success: true,
                message: msg,
                lifeStageUpdated: true,
                postpartumStartDate: computedStartDate || participant.postpartum_start_date,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      // Standalone birth date follow-up — when last assistant msg was awaiting it
      const wasAwaitingBirthDate = (lastAssistantMsg?.metadata as any)?.awaiting_birth_date === true;
      if (wasAwaitingBirthDate && participant.life_stage === "postpartum") {
        const dateOnlyMatch = userMessage.match(/\b(\w+\s+\d{1,2}(?:,?\s*\d{4})?)\b/);
        if (dateOnlyMatch) {
          const parsed = parseExplicitCalendarDate(dateOnlyMatch[1]);
          if (parsed && parsed <= new Date()) {
            const formattedDate = dateOnly(parsed);
            await supabase
              .from("participants")
              .update({ postpartum_start_date: formattedDate })
              .eq("id", participant.id);

            const friendlyDate = parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
            const msg = `Perfect — locked in **${friendlyDate}** as your baby's birth date. Your postpartum timeline is now accurate everywhere.`;

            await supabase.from("chat_messages").insert({
              user_id: user.id,
              role: "assistant",
              content: msg,
              message_type: "text",
              metadata: {
                ...cycleVisualMeta(userMessage),
                life_stage: "postpartum",
                postpartum_start_date: formattedDate,
                postpartum_update: true,
              }
            });

            return new Response(
              JSON.stringify({ success: true, message: msg, postpartumStartDate: formattedDate }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
    }
    // --- End postpartum detection ---

    // Get full chat history
    const { data: recentMessages } = await supabase
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    // Fetch cycle history for context
    let cycleHistoryContext = "";
    if (participant) {
      const { data: historyRows } = await supabase
        .from("cycle_history")
        .select("cycle_length_days, cycle_start_date")
        .eq("participant_id", participant.id)
        .order("cycle_start_date", { ascending: false })
        .limit(12);

      if (historyRows && historyRows.length > 0) {
        const avg = Math.round(historyRows.reduce((s, r) => s + r.cycle_length_days, 0) / historyRows.length);
        const shortest = Math.min(...historyRows.map(r => r.cycle_length_days));
        const longest = Math.max(...historyRows.map(r => r.cycle_length_days));
        const recent = historyRows.slice(0, 3).map(r => `${r.cycle_length_days}d`).join(", ");
        cycleHistoryContext = `\n- Cycles tracked: ${historyRows.length}\n- Average cycle length: ${avg} days (range: ${shortest}–${longest})\n- Recent cycles: ${recent}`;
      }
    }

    // Fetch symptom logs for personalized context. When the user asks about a
    // specific month or historical patterns, fetch ALL logs (no cap) so we can
    // answer date/history questions accurately.
    let symptomContext = "";
    let directSymptomLookupResponse: string | null = null;
    let directSymptomLookupStarters: string[] = [];
    {
      const now = new Date();
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const referencedMonths = getReferencedMonthRanges(userMessage, now);
      const isHistoricalLookup = referencedMonths.length > 0
        || /\b(history|historical|ever|past|previously|previous|before|earlier|all\s*time|since|trend|pattern|patterns|how\s*long|how\s*often|always|last\s+(?:month|cycle|time|year|few\s+months)|same\s+time)\b/i.test(userMessage)
        || /\b(check|look\s*(?:up|at|back)|did\s*i|do\s*i\s*have|was\s*there|were\s*there|show|see|find|any)\b/i.test(userMessage);

      const { data: recentSymptomLogs } = await supabase
        .from("symptom_logs")
        .select("symptoms, cycle_day, cycle_phase, logged_at, notes")
        .eq("user_id", user.id)
        .gte("logged_at", since)
        .order("logged_at", { ascending: false });

      let historicalSymptomLogs: any[] = [];
      if (isHistoricalLookup) {
        // No date filter, no limit — pull the user's full symptom history
        // so we never claim "no data" for a period that actually has entries.
        const { data } = await supabase
          .from("symptom_logs")
          .select("symptoms, cycle_day, cycle_phase, logged_at, notes")
          .eq("user_id", user.id)
          .order("logged_at", { ascending: false });
        historicalSymptomLogs = (data as any[]) || [];
      }


      // Heuristic: skip user messages that are clearly *questions/lookups* about
      // a symptom rather than reports of experiencing it. Otherwise a message like
      // "Can you check symptom log for April for insomnia?" gets treated as a
      // fresh insomnia log dated today.
      const isLookupQuestion = (text: string) => {
        const t = text.trim();
        if (/\?\s*$/.test(t)) return true;
        return /\b(check|look\s*(?:up|at|back)|did\s*i|do\s*i\s*have|was\s*there|were\s*there|show|see|find|anything|any\s+(?:logs?|entries?|record)|every\s*time|history|search)\b/i.test(t);
      };

      const chatSymptomReports = ((recentMessages || []) as any[])
        .filter((m) => m.role === "user" && typeof m.content === "string")
        .map((m) => {
          if (isLookupQuestion(m.content) || isSymptomQuestionOrHypothetical(m.content) || isSymptomNegationOrCorrection(m.content)) return null;
          const detected = detectSymptomMentions(m.content);
          if (detected.length === 0) return null;
          const t = new Date(m.created_at).getTime();
          const inRecentWindow = t >= new Date(since).getTime();
          const inRequestedMonth = referencedMonths.some(({ start, end }) => t >= start.getTime() && t < end.getTime());
          if (!isHistoricalLookup && !inRecentWindow && !inRequestedMonth) return null;

          return {
            symptoms: detected,
            cycle_day: null,
            cycle_phase: null,
            logged_at: m.created_at,
            notes: m.content,
            source: "chat_report",
          };
        })
        .filter(Boolean) as any[];

      const byTime = new Map<string, any>();
      const existingNotesByDay = new Set(
        [...(recentSymptomLogs || []), ...historicalSymptomLogs]
          .filter((log: any) => log.notes)
          .map((log: any) => `${formatUtcDate(log.logged_at)}::${String(log.notes).trim().toLowerCase()}`)
      );
      for (const log of [...(recentSymptomLogs || []), ...historicalSymptomLogs, ...chatSymptomReports]) {
        const duplicateChatReport = log.source === "chat_report"
          && existingNotesByDay.has(`${formatUtcDate(log.logged_at)}::${String(log.notes || "").trim().toLowerCase()}`);
        if (!duplicateChatReport) byTime.set(`${log.source || "symptom_log"}:${log.logged_at}`, log);
      }
      const symptomLogs = Array.from(byTime.values()).sort(
        (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
      );

      const requestedSymptoms = detectSymptomMentions(userMessage);
      // Only do a "did I log X?" style lookup when the user is actually ASKING about their log,
      // not when they're reporting a new symptom, tracking, or asking an unrelated question
      // that happens to contain a date or symptom word.
      const explicitLookupIntent = /\b(check|look\s*(?:up|at|back)|did\s*i|do\s*i\s*have|was\s*there|were\s*there|show\s*me|find|any\s+(?:log|entry|entries|record|history|headache|cramp|symptom)|in\s+(?:my|the)\s+(?:log|history|record)|last\s+(?:time|month|cycle)|how\s+often|how\s+many\s+times)\b/i.test(userMessage);
      const reportingOrTrackingIntent = /\b(track|log|record|add|note|i\s*(?:'?m|am|feel|have|had|got|woke)|my\s+(?:head|back|stomach|knee|breasts?|joints?))\b/i.test(userMessage);
      if (isHistoricalLookup && requestedSymptoms.length > 0 && explicitLookupIntent && !reportingOrTrackingIntent && !isAboutSomeoneElse) {
        const requestedNames = Array.from(new Set(requestedSymptoms.map((s) => s.name.toLowerCase())));

        const scopedLogs = referencedMonths.length > 0
          ? symptomLogs.filter((l: any) => {
              const t = new Date(l.logged_at).getTime();
              return referencedMonths.some(({ start, end }) => t >= start.getTime() && t < end.getTime());
            })
          : symptomLogs;
        const matchingLogs = scopedLogs.filter((l: any) =>
          ((l.symptoms || []) as any[]).some((s: any) => requestedNames.includes(String(s.name || "").toLowerCase()))
        );

        const symptomLabel = requestedNames.join(" or ");
        const scopeLabel = referencedMonths.length > 0
          ? referencedMonths.map(({ label }) => label).join(" and ")
          : "your history";
        const shortNote = (note: string) => note.length > 90 ? `${note.slice(0, 87).trimEnd()}…` : note;
        const friendlyDate = (input: string) => new Date(input).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });

        if (matchingLogs.length > 0) {
          const matchSummary = matchingLogs.slice(0, 5).map((l: any) => {
            const matched = ((l.symptoms || []) as any[])
              .filter((s: any) => requestedNames.includes(String(s.name || "").toLowerCase()))
              .map((s: any) => `${s.name} ${s.severity}/5`)
              .join(", ");
            const source = l.source === "chat_report" ? "from chat" : "in the symptom log";
            const note = l.notes ? ` — “${shortNote(String(l.notes).trim())}”` : "";
            return `${friendlyDate(l.logged_at)} ${source}: ${matched}${note}`;
          }).join("; ");
          const missingMonths = referencedMonths
            .filter(({ start, end }) => !matchingLogs.some((l: any) => {
              const t = new Date(l.logged_at).getTime();
              return t >= start.getTime() && t < end.getTime();
            }))
            .map(({ label }) => label);
          const missingSentence = missingMonths.length > 0
            ? ` I don't see **${symptomLabel}** in ${missingMonths.join(" or ")}, but it is definitely in the record for the other month.`
            : " That's definitely in the record.";
          directSymptomLookupResponse = `Yes — I found **${symptomLabel}** in ${scopeLabel}: ${matchSummary}.${missingSentence}`;
        } else {
          directSymptomLookupResponse = `I checked ${scopeLabel}, and I don't see **${symptomLabel}** in the stored symptom logs or symptom-bearing chat reports for that window. If you remember logging it another way, the next thing to check is whether it was saved under a different sleep-related label.`;
        }
        directSymptomLookupStarters = matchingLogs.length > 0
          ? ["That's the one", "Check fatigue too", "Show the pattern"]
          : ["Check sleep labels", "Look at fatigue", "That's weird"];
      }

      if (symptomLogs && symptomLogs.length > 0) {
        // Compute frequency and average severity
        const freq: Record<string, { count: number; totalSev: number }> = {};
        symptomLogs.forEach((log: any) => {
          const symptoms = log.symptoms || [];
          symptoms.forEach((s: { name: string; severity: number }) => {
            if (!freq[s.name]) freq[s.name] = { count: 0, totalSev: 0 };
            freq[s.name].count++;
            freq[s.name].totalSev += s.severity;
          });
        });

        const topSymptoms = Object.entries(freq)
          .map(([name, { count, totalSev }]) => `${name} (${count}× avg ${(totalSev / count).toFixed(1)}/5)`)
          .sort((a, b) => {
            const countA = parseInt(a.match(/\((\d+)×/)?.[1] || "0");
            const countB = parseInt(b.match(/\((\d+)×/)?.[1] || "0");
            return countB - countA;
          })
          .slice(0, 6);

        const historicalCoverage = referencedMonths.length > 0
          ? referencedMonths.map(({ label, start, end }) => {
              const logs = symptomLogs.filter((l: any) => {
                const t = new Date(l.logged_at).getTime();
                return t >= start.getTime() && t < end.getTime();
              });
              if (logs.length === 0) return `- ${label}: no symptom logs or symptom-bearing chat reports found.`;
              const symptomLines = logs.map((l: any) => {
                const symptoms = ((l.symptoms || []) as any[])
                  .map((s: any) => `${s.name}(${s.severity}/5)`)
                  .join(", ") || "note only";
                const sourceLabel = l.source === "chat_report" ? " [from chat]" : "";
                return `  • ${formatUtcDate(l.logged_at)}: ${symptoms}${sourceLabel}${l.cycle_phase ? ` [${l.cycle_phase}, day ${l.cycle_day ?? "?"}]` : ""}${l.notes ? ` — "${l.notes}"` : ""}`;
              }).join("\n");
              return `- ${label}: ${logs.length} symptom entr${logs.length === 1 ? "y" : "ies"} from logs and chat\n${symptomLines}`;
            }).join("\n")
          : "";

        // Most recent log
        const latest = symptomLogs[0];
        const latestSymptoms = (latest.symptoms as any[]).map((s: any) => `${s.name}(${s.severity}/5)`).join(", ");
        const latestTime = formatUtcDate(latest.logged_at);

        // Per-log dated history so the model can answer date-based questions accurately
        const datedLog = symptomLogs
          .slice(0, isHistoricalLookup ? symptomLogs.length : 40)
          .map((l: any) => {
            const d = formatUtcDate(l.logged_at);
            const names = (l.symptoms || []).map((s: any) => `${s.name}(${s.severity}/5)`).join(", ");
            const sourceLabel = l.source === "chat_report" ? " [from chat]" : "";
            return `  • ${d}: ${names}${sourceLabel}${l.notes ? ` — "${l.notes}"` : ""}`;
          })
          .join("\n");


        const contextLabel = referencedMonths.length > 0
          ? `last 30 days plus requested month history (${symptomLogs.length} entries)`
          : `last 30 days (${symptomLogs.length} entries)`;
        symptomContext = `\n\nSYMPTOM HISTORY DATA (${contextLabel}; includes structured symptom logs AND symptom reports found in chat):\n- Most frequent: ${topSymptoms.join(", ")}\n- Latest entry (${latestTime}): ${latestSymptoms}${latest.source === "chat_report" ? " [from chat]" : ""}${latest.notes ? ` — "${latest.notes}"` : ""}${historicalCoverage ? `\n- Requested month coverage:\n${historicalCoverage}` : ""}\n- Dated entries (most recent first):\n${datedLog}`;
        symptomContext += `\nUSE THIS HISTORY AS BACKGROUND ONLY — DO NOT RECITE IT. Witness and validate what the user just said first. Do NOT list back, summarize, count, or quote their symptom history as if you're building a case or proving you've been paying attention. Do NOT open with "I see you've logged X three times this month" or anything that reads like a chart review. The user came to be heard, not diagnosed. ONLY surface specific past entries when the user EXPLICITLY asks for a review, a date, a count, or a pattern. When they DO ask about a specific date or month, check the Requested month coverage and dated entries above against TODAY'S DATE before answering. Chat reports marked [from chat] are real historical evidence. If a requested month has entries, NEVER say there are none. If no entries fall in the period they asked about, say so honestly — do NOT fabricate a date.`;
      }
    }

    // Fetch custom tracker correlations (e.g. "surfing performance", "loneliness")
    let trackerContext = "";
    {
      const { data: trackers } = await supabase
        .from("custom_trackers")
        .select("id, name, emoji")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (trackers && trackers.length > 0) {
        const trackerIds = trackers.map((t: any) => t.id);
        const { data: tLogs } = await supabase
          .from("tracker_logs")
          .select("tracker_id, intensity, cycle_phase, logged_at")
          .in("tracker_id", trackerIds)
          .order("logged_at", { ascending: false })
          .limit(500);

        if (tLogs && tLogs.length > 0) {
          const summaries: string[] = [];
          for (const t of trackers as any[]) {
            const tLogsForT = tLogs.filter((l: any) => l.tracker_id === t.id);
            if (tLogsForT.length === 0) continue;
            const buckets: Record<string, { sum: number; n: number }> = {};
            for (const l of tLogsForT) {
              const phase = l.cycle_phase || "Unknown";
              if (!buckets[phase]) buckets[phase] = { sum: 0, n: 0 };
              buckets[phase].sum += l.intensity;
              buckets[phase].n += 1;
            }
            const parts = Object.entries(buckets)
              .map(([p, v]) => `${p} ${(v.sum / v.n).toFixed(1)}/5 (n=${v.n})`)
              .join(", ");
            summaries.push(`  • ${t.emoji || ""} ${t.name} — ${tLogsForT.length} logs: ${parts}`);
          }
          if (summaries.length > 0) {
            trackerContext = `\n\nUSER-TRACKED ITEMS (custom 1-5 daily ratings, broken down by cycle phase):\n${summaries.join("\n")}\nIf the user asks whether one of these is tied to their cycle, USE THIS DATA. Cite the phase averages, name the peak phase, and be honest about confidence based on log count. If a tracked item is stable across phases, say it doesn't look cycle-driven.`;
          }
        }
      }
    }

    // Fetch recent Whoop metrics so Logan cites ACTUAL numbers (sleep, recovery, HRV, RHR, strain)
    // instead of inventing them. Raw values are encoded in tracker_logs.notes as
    // `whoop:<metric>:<id>|raw=<value>`.
    let whoopContext = "";
    {
      const { data: integ } = await supabase
        .from("user_integrations")
        .select("status, last_synced_at")
        .eq("user_id", user.id)
        .eq("provider", "whoop")
        .maybeSingle();

      if (integ) {
        const since = new Date(Date.now() - 14 * 86400_000).toISOString();
        const { data: wLogs } = await supabase
          .from("tracker_logs")
          .select("notes, logged_at")
          .eq("user_id", user.id)
          .like("notes", "whoop:%")
          .gte("logged_at", since)
          .order("logged_at", { ascending: false })
          .limit(400);

        type WRow = { metric: string; raw: number; at: string };
        const parsed: WRow[] = [];
        for (const r of wLogs ?? []) {
          const n = (r as any).notes as string;
          const m = n?.match(/^whoop:([a-z_0-9]+):[^|]*\|raw=([\d.\-]+)/i);
          if (m) parsed.push({ metric: m[1], raw: parseFloat(m[2]), at: (r as any).logged_at });
        }

        if (parsed.length > 0) {
          const byMetric: Record<string, WRow[]> = {};
          for (const p of parsed) (byMetric[p.metric] ||= []).push(p);

          const labels: Record<string, { label: string; unit: string; decimals?: number }> = {
            recovery: { label: "Recovery", unit: "%" },
            hrv: { label: "HRV", unit: "ms", decimals: 0 },
            rhr: { label: "Resting HR", unit: "bpm", decimals: 0 },
            sleep_score: { label: "Sleep score", unit: "%" },
            sleep_hours: { label: "Sleep", unit: "h", decimals: 1 },
            sleep_eff: { label: "Sleep efficiency", unit: "%" },
            day_strain: { label: "Day strain", unit: "/21", decimals: 1 },
            resp_rate: { label: "Respiratory rate", unit: "bpm", decimals: 1 },
            skin_temp: { label: "Skin temp", unit: "°C", decimals: 1 },
            spo2: { label: "SpO2", unit: "%" },
          };

          const sevenDayCutoff = Date.now() - 7 * 86400_000;
          const fmt = (v: number, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : "—");
          const lines: string[] = [];
          for (const [metric, rows] of Object.entries(byMetric)) {
            const cfg = labels[metric];
            if (!cfg) continue;
            rows.sort((a, b) => b.at.localeCompare(a.at));
            const latest = rows[0];
            const recent = rows.filter((r) => Date.parse(r.at) >= sevenDayCutoff);
            const avg = recent.length
              ? recent.reduce((s, r) => s + r.raw, 0) / recent.length
              : null;
            const latestDate = new Date(latest.at).toISOString().split("T")[0];
            const d = cfg.decimals ?? 0;
            const avgPart = avg !== null && recent.length >= 2
              ? `, 7d avg ${fmt(avg, d)}${cfg.unit} (n=${recent.length})`
              : "";
            lines.push(`  • ${cfg.label}: ${fmt(latest.raw, d)}${cfg.unit} on ${latestDate}${avgPart}`);
          }

          const lastSync = integ.last_synced_at ? new Date(integ.last_synced_at as string) : null;
          const staleDays = lastSync ? Math.floor((Date.now() - lastSync.getTime()) / 86400_000) : null;
          const stalenessNote = staleDays !== null && staleDays >= 2
            ? `\nNote: Whoop last synced ${staleDays} days ago — values may be outdated. If she asks about today/last night and you only have older data, acknowledge that openly.`
            : "";
          const reauthNote = (integ as any).status === "reauth_required"
            ? `\nNote: Whoop connection needs reauthorization — let her know if she asks why data looks off.`
            : "";

          whoopContext = `\n\nWHOOP DATA (real measurements from her wearable — CITE these numbers exactly, never invent sleep/HRV/recovery/strain values):\n${lines.join("\n")}${stalenessNote}${reauthNote}\nIf she asks about sleep, recovery, HRV, resting HR, or strain, ground your answer in these actual values. If a specific metric she asks about isn't listed above, say you don't have that reading rather than guessing.`;
        } else if ((integ as any).status === "reauth_required") {
          whoopContext = `\n\nWHOOP: connection needs reauthorization — no recent data available. If she references sleep/recovery/HRV/strain, say her Whoop needs reconnecting and don't invent numbers.`;
        } else {
          whoopContext = `\n\nWHOOP: connected but no recent readings synced. Do NOT cite specific sleep/HRV/recovery numbers — say you don't have a current reading if asked.`;
        }
      }
    }

    // Trigger a background Whoop refresh (fire-and-forget) so next message has fresh data
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(`${SUPABASE_URL}/functions/v1/sync-whoop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ user_id: user.id, backfill_days: 3 }),
      }).catch(() => {});
    } catch (_) { /* no-op */ }

    // Only compute cycle info for actively cycling users — postpartum/menopause have no
    // meaningful "current phase" even if a stale last_period_start lingers on the row.
    const isCycling = ((participant?.life_stage || "cycling") === "cycling") || (participant?.life_stage === "perimenopause");
    const cycleInfo = isCycling && participant?.last_period_start && participant?.cycle_length_days
      ? calculateCycleInfo(
          participant.last_period_start,
          participant.cycle_length_days,
          participant.timezone || "UTC",
          (participant as any).current_period_end_date ?? null,
          !!(participant as any).period_pending_since,
          !!(participant as any).period_still_active,
        )
      : null;

    // Overdue plausibility check — if she's run well past her expected cycle
    // length with no new Day 1, no logged end date, and no confirmation her
    // period is still ongoing, don't let Logan pretend it's a normal luteal day.
    let overdueNote = "";
    if (
      cycleInfo &&
      participant?.cycle_length_days &&
      cycleInfo.cycleDay > participant.cycle_length_days + 7 &&
      !(participant as any).current_period_end_date &&
      !(participant as any).period_still_active
    ) {
      const daysLate = cycleInfo.cycleDay - participant.cycle_length_days;
      overdueNote = `\n\nRUNTIME CONTEXT (this turn only): The user is currently on **Day ${cycleInfo.cycleDay}** of a ${participant.cycle_length_days}-day cycle — she is **${daysLate} days past** her expected next period with no new Day 1 logged and no confirmation her period is still ongoing. Do NOT provide standard luteal-phase guidance as if this is a normal cycle day. Instead: (a) acknowledge the overdue count plainly and warmly, (b) ask if her period has started (or if she's still waiting), and (c) if she wants, offer to log today (or an earlier day) as her new Day 1. Do not assume pregnancy. Do not diagnose. Just check in.`;
    }


    if (directSymptomLookupResponse) {
      const directMeta: Record<string, unknown> = cycleInfo ? {
        cycle_day: cycleInfo.cycleDay,
        cycle_phase: cycleInfo.phase,
        cycle_length_days: participant?.cycle_length_days || 28,
        last_period_start: participant?.last_period_start || null,
        timezone: participant?.timezone || "UTC",
      } : {};
      if (directSymptomLookupStarters.length > 0) {
        directMeta.conversation_starters = directSymptomLookupStarters;
      }

      const { error: directInsertError } = await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: directSymptomLookupResponse,
        message_type: "text",
        metadata: directMeta,
      });
      if (directInsertError) {
        console.error("Error saving direct symptom lookup response:", directInsertError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: directSymptomLookupResponse,
          cycleInfo,
          creditBalance: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const backfillBlock = backfillConfirmation ? `\n\n${backfillConfirmation}\n` : "";
    const libraryBlock = libraryConfirmation ? `\n\n${libraryConfirmation}\n` : "";

    // Sample of the shared symptom library for the model to compare against
    const librarySample = knownLibraryNames.slice(0, 200).join(", ");
    const libraryGuidance = `\n\nSHARED SYMPTOM LIBRARY (symptoms Logan already knows how to watch): ${librarySample}.\n\nWHEN THE USER MENTIONS OR WANTS TO TRACK SYMPTOMS:\n1. First decide whether the user is REPORTING a symptom, asking a QUESTION about a symptom, or correcting a mistaken log.\n2. If the user asks a question like "what about mood swings", "is bloating normal", "what causes cramps", or "does X happen", answer the question. Do NOT say you logged/noted/tracked it. Do NOT imply she is having it today. Use conditional language like "if that's happening" only if needed.\n3. If the user corrects you with language like "I did not log X" or "I'm not having X", apologize briefly and do NOT treat X as part of her current symptoms.\n4. When a user clearly describes symptoms she is experiencing, she is usually just telling you how she feels — not asking for a feature demo. Acknowledge what she shared warmly and naturally, like a friend would. The system logs those symptoms automatically from the chat, so you do NOT need to tell her to "go to Home → Log Symptoms" or use any app-navigation language.\n5. For each reported symptom she names, check the library above (case-insensitive, loose match).\n6. For reported symptoms ALREADY in the library: keep it conversational. Good examples: "I'll keep an eye on that pattern," or "Got it — we can watch whether that clusters by phase." Bad examples: "added Irritability for June 27," "You can track this in the symptom log," or "go to Home → Log Symptoms."\n7. For reported symptoms NOT in the library: wrap each new candidate name in inline-code backticks like \`hair loss\`, \`mouth ulcers\`, and ask exactly: "Want me to add these to the shared symptom library so you (and other women) can track them later? They're completely anonymous." Then stop and wait.\n8. NEVER add symptoms silently. NEVER claim you added something unless the system tells you it was added.\n9. If she confirms ("yes", "please add", "go ahead"), the system handles the insert — just reply naturally that it's done and they'll show up as trackable symptoms going forward.\n10. Keep the candidate list short (max 6 names). Use the user's own wording, lowercased, no punctuation.`;
    let systemPrompt = buildSystemPrompt(participant, cycleInfo, cycleHistoryContext, symptomContext + trackerContext + whoopContext + backfillBlock + libraryBlock + libraryGuidance);

    // Bleed/spotting acknowledgment guards (set in the spotting block above).
    if (unreliableCycleNote) {
      systemPrompt += `\n\nRUNTIME CONTEXT (this turn only): The user mentioned bleeding/spotting, but her cycle length is NOT reliably established (irregular, PCOS, hormonal birth control, brand-new account, or non-cycling life stage). Acknowledge what she shared warmly. Ask how heavy it is and how long it's lasted. DO NOT propose resetting her cycle. DO NOT infer or assign a phase from this single mention. DO NOT say "this sounds like your period starting."`;
    } else if (midCycleSpottingNote) {
      systemPrompt += `\n\nRUNTIME CONTEXT (this turn only): The user mentioned bleeding/spotting, but based on her cycle day this is likely mid-cycle (ovulatory spotting, implantation, or breakthrough bleeding) — not her period starting. Acknowledge it gently, ask if it's heavier than usual or accompanied by cramps, and DO NOT propose a cycle reset or change her phase from this single mention.`;
    }
    if (overdueNote) {
      systemPrompt += overdueNote;
    }




    // Pregnancy loss / miscarriage grief-aware mode — override tone, pause cycle talk.
    if (participant?.life_stage === "pregnancy_loss") {
      const lossDate = (participant as any).loss_date;
      let daysSince: number | null = null;
      if (lossDate) {
        const d = new Date(lossDate + "T00:00:00");
        daysSince = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
      }
      systemPrompt += `\n\nLIFE STAGE: PREGNANCY LOSS / MISCARRIAGE RECOVERY${daysSince !== null ? ` (Day ${daysSince} since loss)` : ""}.\n\nTHIS OVERRIDES NORMAL CYCLE COACHING. The user is grieving and/or physically recovering from a miscarriage, stillbirth, ectopic, chemical pregnancy, or D&C.\n\nABSOLUTE RULES:\n- NEVER mention cycle phases, ovulation, fertile windows, luteal/follicular, or "your next period in X days." Cycle tracking is paused.\n- NEVER say "everything happens for a reason," "at least…," "you can try again," "you're young," or anything that minimizes the loss.\n- NEVER push silver linings, productivity, optimization, workouts, or "getting back on track."\n- NEVER ask "how far along were you" unless she brings it up first.\n- Do NOT be performatively cheerful. Match her energy — quiet, soft, present.\n\nWHAT TO DO:\n- Lead with acknowledgment. Short sentences. Lots of breathing room.\n- Use her words back to her. If she says "baby," say "baby." If she says "pregnancy," mirror that.\n- Offer (don't impose) gentle support: rest, hydration, iron-rich food, sleep, a warm bath, a walk if she wants one, naming the baby if she wants, journaling, a support line.\n- Track what she shares — bleeding days, cramps, sleep, mood, appetite, milk coming in, partner support — without analyzing it into a "plan."\n- One short, optional follow-up question max. Often the right response is just presence: "I'm here. Take your time."\n\nPHYSICAL SAFETY (always flag, kindly but clearly):\nIf she mentions soaking a pad an hour for 2+ hours, fever over 100.4°F / 38°C, severe one-sided pain, foul-smelling discharge, fainting, or thoughts of harming herself — gently urge her to call her provider or emergency line right away. Don't bury this in caveats.\n\nRESOURCES (offer only if relevant, never as a list-dump):\n- Postpartum Support International: 1-800-944-4773 (text "HELP" to 800-944-4773)\n- Return to Zero: HOPE pregnancy loss support\n- Star Legacy Foundation (stillbirth)\n- 988 Suicide & Crisis Lifeline if she expresses self-harm thoughts.\n\nWhen she's ready to "move on" or "track cycles again," she can tell you and you'll switch back. Until then, this space is hers.`;
    }

    if (participant?.life_stage === "pregnant") {
      const lmp = (participant as any).pregnancy_lmp as string | null;
      const due = (participant as any).due_date as string | null;
      let gestWeeks: number | null = null;
      if (lmp) {
        const d = new Date(lmp + "T12:00:00Z");
        gestWeeks = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000 / 7));
      } else if (due) {
        const d = new Date(due + "T12:00:00Z");
        const daysToDue = Math.floor((d.getTime() - Date.now()) / 86400000);
        gestWeeks = Math.max(0, 40 - Math.ceil(daysToDue / 7));
      }
      const trimester = gestWeeks === null ? null : gestWeeks <= 13 ? 1 : gestWeeks <= 27 ? 2 : 3;
      systemPrompt += `\n\nLIFE STAGE: PREGNANT${gestWeeks !== null ? ` (week ${gestWeeks}, trimester ${trimester})` : ""}.\n\nTHIS OVERRIDES NORMAL CYCLE COACHING. Cycle tracking is paused.\n\nABSOLUTE RULES:\n- NEVER mention cycle day, phases, ovulation, follicular/luteal, "next period," or fertile windows. She is pregnant.\n- NEVER prescribe medication, supplements (beyond standard prenatal/folate/iron when she asks), specific exercises she hasn't already been doing, or diagnostic conclusions. Defer to her OB/midwife.\n- NEVER comment on her body, weight gain, or bump size.\n- NEVER minimize symptoms ("oh that's normal") without first acknowledging how they actually feel.\n\nWHAT TO DO:\n- Speak in trimesters and weeks when relevant. Tailor tone: T1 = nausea/fatigue/secrecy, T2 = energy returns/movement felt, T3 = sleep/heartburn/birth prep.\n- Track what she shares — nausea, sleep, energy, mood, food aversions, movement, kicks (T2+), Braxton-Hicks (T3), appointments — without turning it into a plan unless she asks.\n- Gentle, evidence-based nudges only when relevant: hydration, protein at every meal, side-sleeping after 20 weeks, pelvic floor awareness, prenatal vitamin, iron-paired-with-vitamin-C, kegels + perineal massage in T3.\n- Movement: walking, prenatal yoga, swimming, modified strength. Avoid contact sports, supine work after T1, hot yoga, anything she hasn't already been doing.\n- Foods to avoid: raw fish, deli meat (unless heated), unpasteurized dairy, high-mercury fish, alcohol, excess caffeine (>200mg/day). Mention only if relevant.\n- One short, optional follow-up question max. Default to witness-and-validate.\n\nRED-FLAG GUARDRAILS (always flag clearly, kindly, immediately — never bury in caveats):\nVaginal bleeding, severe abdominal pain, fever over 100.4°F / 38°C, severe headache + vision changes, sudden swelling of face/hands, persistent vomiting (can't keep fluids down), reduced fetal movement after 28 weeks, leaking fluid before 37 weeks, signs of preterm labor (regular contractions before 37w), or thoughts of harming herself or the baby → urge her to call her provider or L&D triage RIGHT NOW.\n\nBIRTH PREP (trimester 3 only, when she brings it up or asks):\nBirth plan basics, pain options (epidural, nitrous, unmedicated), labor signs (mucus plug, contractions 5-1-1, water breaking), hospital bag, postpartum recovery realities, infant feeding choices — present as options, never prescriptions.\n\nWhen she says she had the baby / gave birth, switch to postpartum mode. If she experiences a loss, switch to pregnancy loss mode.`;
    }





    // Runtime hint: if the Menu Builder offer card is about to follow this reply,
    // tell the model to write a short hand-off line instead of promising to build anything.
    if (shouldOfferMealPlan) {
      const handoffExample = isCycling
        ? `Example: "Luteal week — magnesium and slow carbs are your friends right now."`
        : participant?.life_stage === "postpartum"
          ? `Example: "Postpartum recovery week — collagen and iron-rich meals to rebuild your reserves." Do NOT mention cycle phases.`
          : `Example: "${participant?.life_stage === "menopause" ? "Menopause" : "This"} week — meals built around stable energy and hormonal balance." Do NOT mention cycle phases.`;
      systemPrompt += `\n\nRUNTIME CONTEXT (this turn only): The user just asked you to build a meal plan. A "Build my meal plan" card will appear DIRECTLY BELOW your reply — they tap it to open the Menu Builder. Your reply MUST be ONE short sentence: a phase-aware framing that hands off to the card. Do NOT say "I'm building", "I'll drop", "starting on it", "give me a sec", or anything implying you are working on it. Do NOT ask follow-up questions. ${handoffExample} Then stop.`;
    }

    if (isAboutSomeoneElse) {
      systemPrompt += `\n\nRUNTIME CONTEXT (this turn only): The user is asking about ANOTHER person (a friend, family member, partner, etc.), NOT themselves. Do NOT reference the user's own symptom logs, cycle data, or chat history as if it answered the question. Do NOT pull up dates from their personal record. Answer the question generally based on what could be happening for that other person at that life stage, and if helpful, ask one clarifying question about the friend (age, cycle status, recent stressors). Never project the user's history onto someone else.`;
    }

    if (isCurrentSymptomQuestion) {
      systemPrompt += `\n\nRUNTIME CONTEXT (this turn only): The user asked a question about a known symptom/library term; they did NOT report having it today. Answer the question directly using her current cycle context if helpful, but do NOT say "I've noted", "I've logged", "tracked", "got it", or anything that implies the symptom was recorded or is currently happening. Do NOT validate it as her lived symptom unless she explicitly says she has it. If the symptom exists in her past history, frame it as past pattern only, not today's report.`;
    }

    if (isCurrentSymptomNegation) {
      systemPrompt += `\n\nRUNTIME CONTEXT (this turn only): The user is correcting or negating a symptom log. Do NOT log, note, track, or save the symptom mentioned in this correction. Do NOT treat it as today's lived symptom. Apologize briefly and clarify that you won't count that symptom from this message.`;
    }


    // Smart truncation: keep first 10 (onboarding/profile context) + last 50 (recent conversation)
    const allMessages = (recentMessages || [])
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }));

    let conversationHistory: { role: "user" | "assistant"; content: string }[];
    const FIRST_N = 10;
    const LAST_N = 50;

    if (allMessages.length <= FIRST_N + LAST_N) {
      conversationHistory = allMessages;
    } else {
      const first = allMessages.slice(0, FIRST_N);
      const last = allMessages.slice(-LAST_N);
      conversationHistory = [
        ...first,
        { role: "assistant" as const, content: "[Earlier conversation omitted for brevity]" },
        ...last,
      ];
    }

    conversationHistory.push({ role: "user", content: userMessage });

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory
        ],
        temperature: 0.7,
        max_tokens: 600
      }),
    });

    if (!aiResponse.ok) {
      const errorStatus = aiResponse.status;
      console.error("AI gateway error:", errorStatus);
      
      if (errorStatus === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (errorStatus === 402) {
        return new Response(
          JSON.stringify({ error: "AI service unavailable. Please try again later." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to generate response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    let assistantMessage = aiData.choices?.[0]?.message?.content || "I'm not sure how to respond to that. Could you try rephrasing?";

    // SAFETY: strip any leaked system/meta instructions the model may have echoed
    // back into the user-visible reply (e.g. "[!IMPORTANT] ...", "[CRITICAL] ...",
    // "[SYSTEM] ...", or paraphrased rules about not referring to other apps).
    const sanitizeLeakedInstructions = (text: string): string => {
      let out = text;
      // 1) Remove ANY line (optionally blockquoted) that starts with a bracketed tag like
      //    [ANYTHING], [!ANYTHING], [BACKFILL ...], [RUNTIME ...], [SYSTEM], [META], etc.
      out = out.replace(/^[ \t]*(?:>+[ \t]*)*\[!?[^\]\n]{1,80}\][^\n]*\n?/gm, "");
      // 2) Remove inline bracketed ALL-CAPS meta tags wherever they appear in a line
      //    e.g. "Done — added X. [BACKFILL CONFIRMED]" -> "Done — added X."
      out = out.replace(/\[!?\s*(?:[A-Z][A-Z0-9 _-]{2,40})(?:\s*:[^\]\n]*)?\]/g, "");
      // 3) Remove any line that is a blockquote containing internal-sounding keywords
      out = out.replace(/^[ \t]*>+[ \t]*[^\n]*\b(?:IMPORTANT|CRITICAL|SYSTEM|RUNTIME|BACKFILL|INTERNAL|META|REMINDER|INSTRUCTION|CONFIRMED|NOTE TO SELF)\b[^\n]*\n?/gim, "");
      // 4) Strip leftover empty blockquote lines
      out = out.replace(/^[ \t]*>+[ \t]*$\n?/gm, "");
      // 5) Remove sentences that paraphrase the "never refer to yourself as any other app" rule
      out = out.replace(/[^.\n]*\b(?:Logan|I|you)\b[^.\n]*\b(?:should|must|will|never)\b[^.\n]*\brefer to (?:themselves|yourself|itself|myself)\b[^.\n]*\.\s*/gi, "");
      out = out.replace(/[^.\n]*\bnever refer to (?:themselves|yourself|itself|myself)\s+as\s+any other\s+(?:app|product|service)[^.\n]*\.\s*/gi, "");
      // 6) Remove sentences that quote/reference an "internal note" or "system note"
      out = out.replace(/[^.\n]*\b(?:internal note|system note|runtime context|backfill confirmed)\b[^.\n]*\.\s*/gi, "");
      // 7) Collapse 3+ blank lines
      out = out.replace(/\n{3,}/g, "\n\n");
      return out.replace(/^\s+/, "").trimEnd();
    };
    assistantMessage = sanitizeLeakedInstructions(assistantMessage);
    if (isCurrentSymptomQuestion || isCurrentSymptomNegation) {
      assistantMessage = stripFalseSymptomLoggingClaim(assistantMessage);
    }
    // Final safety net: if sanitizer stripped everything, fall back to a safe reply
    if (!assistantMessage.trim()) {
      assistantMessage = isCurrentSymptomQuestion
        ? "That can show up differently depending on timing and stress load. If you mean it generally, I can explain what tends to drive it in this phase."
        : "You're right — I won't count that from this message. What should I track instead?";
    }

    // Generate 3 contextual conversation starters that respond to what was just said
    let conversationStarters: string[] = [];
    if (bleedDay1Prompt) {
      conversationStarters = ["Yes", "It started earlier", "Not yet, just spotting"];
    } else try {
      const mainAnswer = assistantMessage.split("\n---\n")[0].trim();
      const starterRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content: `You generate 3 short follow-up replies a user might tap to continue a chat with Logan (a women's health friend-AI). Rules:
- Each reply is 2-6 words, written from the USER'S perspective (first person, casual, like texting back).
- They MUST directly respond to or extend Logan's last message — not generic prompts.
- Mix: one that acknowledges ("Yeah that's me"), one that digs deeper ("Tell me more"), one that changes topic ("What about workouts?"). Never argumentative or contradictory — the user may be in a sensitive state.
- No questions ending in "?" unless natural. No emojis. No quotes.
- Return ONLY a JSON array of 3 strings, nothing else. Example: ["Yeah exactly","Not really though","Tell me more"]`
            },
            { role: "user", content: `User just said: "${userMessage}"\n\nLogan replied: "${mainAnswer}"\n\nGenerate 3 follow-up replies.` }
          ],
          temperature: 0.8,
          max_tokens: 120,
        }),
      });
      if (starterRes.ok) {
        const sData = await starterRes.json();
        const raw = sData.choices?.[0]?.message?.content || "";
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) {
            conversationStarters = parsed.filter((s) => typeof s === "string" && s.trim().length > 0).slice(0, 3);
          }
        }
      }
    } catch (e) {
      console.error("Starter generation failed:", e);
    }

    const baseMeta: Record<string, unknown> = cycleInfo ? {
      cycle_day: cycleInfo.cycleDay,
      cycle_phase: cycleInfo.phase,
      cycle_length_days: participant?.cycle_length_days || 28,
      last_period_start: participant?.last_period_start || null,
      timezone: participant?.timezone || "UTC",
    } : {};
    if (conversationStarters.length > 0) {
      baseMeta.conversation_starters = conversationStarters;
    }

    // If the user mentioned spotting/bleeding in a plausible window, append a
    // Day-1 confirmation prompt to the assistant's normal insight and flag the
    // message so the next "yes" hits the period-confirmation reset path.
    let finalAssistantMessage = assistantMessage;
    if (bleedDay1Prompt) {
      const deepDiveDivider = "\n---\n";
      const duplicateDay1PromptPattern = /\n*\s*Want me to log \*\*?[^\n?]+\*\*? as your new \*\*?Day 1\*\*? and reset your cycle\?\s*Just say \*\*?yes\*\*? to confirm — or tell me the actual start date if it was earlier\./gi;
      const assistantMessageWithoutDay1Prompt = assistantMessage.replace(duplicateDay1PromptPattern, "").trimEnd();
      const dividerIndex = assistantMessageWithoutDay1Prompt.indexOf(deepDiveDivider);
      finalAssistantMessage = dividerIndex >= 0
        ? assistantMessageWithoutDay1Prompt.slice(0, dividerIndex).trimEnd() + bleedDay1Prompt.text + assistantMessageWithoutDay1Prompt.slice(dividerIndex)
        : assistantMessageWithoutDay1Prompt + bleedDay1Prompt.text;
      baseMeta.period_checkin = true;
      baseMeta.suggested_day1 = bleedDay1Prompt.suggestedDay1;
    }

    // --- Safety net: if Logan's reply PROMISES to add symptoms to the shared
    // library (e.g. "I'll add memory loss to the symptom library"), actually
    // insert them. Prevents the model from claiming the action without it
    // happening server-side.
    try {
      const replyText = finalAssistantMessage;
      const promisesAdd = /\b(?:add(?:ing|ed)?|including|put(?:ting)?|including|i'?ll\s+add|i\s+will\s+add|i'?ve\s+added)\b[^.?!\n]*\b(?:symptom\s+)?library\b/i.test(replyText)
        || /\bto\s+the\s+(?:shared\s+)?(?:symptom\s+)?library\b/i.test(replyText);
      if (promisesAdd) {
        // Gather candidate symptom names: inline-code names, quoted names, and
        // names appearing in "add X, Y, and Z to ... library".
        const candidates: string[] = [];
        for (const m of replyText.matchAll(/`([^`\n]{2,50})`/g)) candidates.push(m[1]);
        for (const m of replyText.matchAll(/["'“”‘’]([^"'“”‘’\n]{2,50})["'“”‘’]/g)) candidates.push(m[1]);
        const listMatch = replyText.match(/\badd(?:ing|ed)?\s+([^.?!\n]+?)\s+to\s+the\s+(?:shared\s+)?(?:symptom\s+)?library/i);
        if (listMatch) {
          const segment = listMatch[1].replace(/\band\b/gi, ",");
          for (const part of segment.split(",")) {
            const cleaned = part.trim().replace(/^[`"'“”‘’]+|[`"'“”‘’.]+$/g, "");
            if (cleaned) candidates.push(cleaned);
          }
        }
        // Also accept symptoms named in the user message when they explicitly
        // asked to add ("can you add memory loss to the library").
        if (/\b(?:add|include|put)\b[^.?!\n]*\blibrary\b/i.test(userMessage)) {
          const um = userMessage.match(/\b(?:add|include|put)\s+([^.?!\n]+?)\s+to\s+the\s+(?:shared\s+)?(?:symptom\s+)?library/i);
          if (um) {
            const seg = um[1].replace(/\band\b/gi, ",");
            for (const part of seg.split(",")) {
              const cleaned = part.trim().replace(/^[`"'“”‘’]+|[`"'“”‘’.]+$/g, "");
              if (cleaned) candidates.push(cleaned);
            }
          }
        }

        // Dedupe + filter against the catalog and existing community rows.
        const known = new Set<string>(SYMPTOM_KEYWORDS.map(s => s.name.toLowerCase()));
        try {
          const { data: commRows2 } = await supabase
            .from("community_symptoms").select("name").limit(1000);
          for (const r of (commRows2 || []) as any[]) {
            if (r?.name) known.add(String(r.name).toLowerCase());
          }
        } catch (_) {}
        const seen = new Set<string>();
        const toAdd: string[] = [];
        for (const raw of candidates) {
          const name = raw.trim().toLowerCase().replace(/\s+/g, " ");
          if (name.length < 2 || name.length > 50) continue;
          if (!/[a-z]/i.test(name)) continue;
          // Skip generic words that aren't symptoms
          if (/^(?:the|a|an|them|those|these|it|this|that|some|any|new|symptom|symptoms|library|home|log|track|tracker|trackers|things|stuff)$/i.test(name)) continue;
          if (seen.has(name) || known.has(name)) continue;
          seen.add(name);
          toAdd.push(name);
        }
        if (toAdd.length > 0) {
          const rows = toAdd.map(name => ({ name, added_by: user.id }));
          const { error: addErr } = await supabase
            .from("community_symptoms")
            .insert(rows);

          if (addErr) {
            console.error("Post-reply library add failed:", addErr);
          } else {
            console.log("Post-reply added to community_symptoms:", toAdd.join(", "));
          }
        }
      }
    } catch (e) {
      console.error("Post-reply library guard error:", e);
    }
    // --- End safety net ---

    const { error: insertError } = await supabase.from("chat_messages").insert({

      user_id: user.id,
      role: "assistant",
      content: finalAssistantMessage,
      message_type: "text",
      metadata: baseMeta,
    });


    if (insertError) {
      console.error("Error saving assistant message:", insertError);
    }

    // Follow-up: small bubble offering the full meal plan resource (after the normal answer)
    if (shouldOfferMealPlan) {
      const liveCycle = participant?.last_period_start && participant?.cycle_length_days
        ? calculateCycleInfo(participant.last_period_start, participant.cycle_length_days, participant.timezone || "UTC")
        : null;

      // Tiny delay so the offer arrives just after the main answer (better UX)
      await new Promise(r => setTimeout(r, 400));

      await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: "Tap below and I'll build your cycle-synced plan — every meal mapped to your phase, with a grocery list.",
        message_type: "resource_offer",
        metadata: {
          resource_type: "meal_plan",
          cycle_day: liveCycle?.cycleDay,
          cycle_phase: liveCycle?.phase,
          cycle_length_days: participant?.cycle_length_days || 28,
        },
      });
    }

    // Get updated credit balance to return to frontend (disabled during alpha)
    let creditBalance = null;

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: finalAssistantMessage,
        cycleInfo: cycleInfo,
        creditBalance,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Chat AI error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildSystemPrompt(
  participant: any | null, 
  cycleInfo: { cycleDay: number; phase: string } | null,
  cycleHistoryContext: string = "",
  symptomContext: string = ""
): string {
  const basePrompt = `You are Logan — the one in someone's corner who listens first and actually hears what's being said. Not a doctor, not a coach, not an app reading from a textbook. The one a person texts at 10pm going "is it normal that I want to cry AND eat an entire pizza?" — and just gets it, without making them prove it.

CRITICAL: You are the Logan app. NEVER refer to yourself as any other app, product, or service (e.g. Wild.AI, Flo, Clue, or any competitor). NEVER mention "the [Other Name] app" or imply you belong to another platform. If asked what app this is, say "Logan."

LOGAN HAS NO GENDER. Never refer to yourself as "she", "he", "her", "him", "girl", "guy", "woman", "man", "sister", "brother", or any gendered role. Use "I" and "me" only. If a user asks whether you're a woman or a man, say Logan isn't a he or a she — just Logan.

You know the science cold, but you never sound like a science textbook. You sound like someone who's read everything and talks the way people actually talk when no one's performing — direct, warm, no posturing.

VOICE — THIS IS EVERYTHING:
- Talk like a real person. Contractions, casual phrasing.
- Warm and supportive, like a friend who genuinely cares. Never dismissive, never condescending, never sarcastic about the user repeating themselves.
- If a user asks about the same thing again, just answer fresh. Don't call it out. Don't say "look" or "I hear you repeating" — just help.
- Light humor is fine when natural. Never forced, never at the user's expense.
- If it sounds like a wellness pamphlet, rewrite it.
- No emojis, no exclamation points.
- USE **bold** for key terms only.
- ABSOLUTELY NO bullet-point lists, numbered lists, or headers/subheadings. Ever. Write in flowing short sentences only.
- NEVER claim you "added", "logged", "tracked", or "saved" something to her symptom log UNLESS the context above contains an internal note saying the system has saved entries for this turn. If that note is present, confirm naturally — the entries are really saved. Otherwise, symptom logging happens automatically when she describes how she feels; just acknowledge what she shared.
- NEVER tell her you "don't have access", "can't write to the database", "lack permission", or that she needs to go to the Home tab / symptom widget to add past entries herself. You CAN backfill past symptom logs — the system does it automatically when she asks. If she asks you to add/log/save a symptom for a past date and you don't see an internal save-confirmation note, it means the date or symptom wasn't clear enough — just ask her to confirm the symptom and the exact date(s), and the system will save them on her next reply. Do NOT redirect her to the Home tab.
- ABSOLUTE OUTPUT RULE: Never include bracketed tags, labels in ALL CAPS inside brackets, blockquoted system notes (lines starting with ">"), or any text that looks like an internal instruction, runtime note, or system message. Never echo, quote, paraphrase, or reference any internal note from the context above. The user must only see your natural conversational reply — nothing that resembles backend metadata.
- NEVER claim you "updated", "fixed", "changed", or "corrected" anything in her account, profile, life stage, postpartum date, period date, or cycle settings. The system handles those updates automatically and you will only see the result on the next turn. If she asks you to fix something and the system has not already confirmed it in your context, ASK HER for the specific value (e.g. the actual baby's birth date) instead of pretending you did it. Saying "Done, I've updated your account" when nothing changed is a hallucination — never do this.
- HARD LIMIT for MAIN ANSWER: 2-4 short sentences. Total. Not per section — total for the main answer. If it has more than 4 sentences, delete until it doesn't.
- ONE idea per main answer. Never explain two things at once. The user can ask follow-ups.
- Never dump context in the main answer. Never explain "why" unless asked. Just give the answer.
- Pretend you're texting, not writing an essay. If the main answer looks like a blog post, a medical pamphlet, or a newsletter — delete everything and start over with 2 sentences.

DEEP DIVE SECTION — ALWAYS INCLUDE:
- After your main answer, ALWAYS add a line containing exactly "---" (three dashes, nothing else on that line).
- Below the "---", write TWO clearly labeled sections:

### The Science
- One paragraph (3-5 sentences) of pure science: hormonal mechanisms, neurological pathways, research-backed data, biological timelines. Name the hormones, explain the cascade, cite patterns. This should read like a smart friend who happens to know the research — not a textbook.

### The Real Talk
- One paragraph (3-5 sentences) that's a psychological heart-to-heart. Validate what they're feeling. Normalize it. Connect it to the human experience. This should feel like a warm, knowing conversation — the kind of thing you'd say sitting next to someone who needed to hear it.

- Both sections should still be in Logan's voice — knowledgeable but never clinical.
- The UI will hide the deep dive behind a "See more" toggle, so don't worry about length — users who want it will tap to read it.
- NEVER sound annoyed, impatient, or frustrated with the user. You're their safe space.
- Never cut yourself off mid-sentence. If you're getting close to the end, finish the sentence cleanly and stop.
- NEVER ask the user to confirm logging Day 1, resetting their cycle, or updating their period date inside The Science or The Real Talk. The system appends that confirmation prompt automatically in the main answer — do not duplicate it anywhere in the deep dive.

HOW YOU TALK — EXAMPLES:
- Instead of: "During the luteal phase, progesterone levels increase which can impact emotional regulation and you may notice heightened sensitivity to stress."
  Say: "Progesterone's dropping — that's why everything feels personal right now. It passes."
- Instead of: "You may experience increased fatigue during menstruation due to hormonal shifts and iron loss."
  Say: "Day 2 is usually the worst. It gets better from here."
- Instead of: "Consider incorporating magnesium-rich foods to support your nervous system during this phase."
  Say: "That chocolate craving? Your body wants magnesium. Dark chocolate counts."
- Notice: each good example is ONE or TWO sentences. That's the bar.

CONVERSATION FLOW — CRITICAL:
- DEFAULT: land the plane. End with a closing thought, not a question. Permission to land the plane is granted on every turn — you do not need more information to be helpful.
- EXCEPTION (rare): ask ONE follow-up only when the user has clearly omitted one specific piece of information that is REQUIRED — not just helpful — to answer well, AND your answer would otherwise be wrong or misleading without it. "Nice to know" is not enough. If you can give a useful answer with what you have, give it.
- Never ask a follow-up just to seem engaged, curious, or thorough. Never ask to "round out the picture" or "personalize better." The user came to be heard, not interviewed.
- NEVER ask generic sign-off questions like "Anything else on your mind?", "How can I help?", "Want to dig deeper?", or "Is there anything else?".
- Never stack two questions. One focused question, max — and only under the EXCEPTION above.
- After ONE exchange on the same topic, stop asking. Land the plane.
- If the user says no, they're good, or thanks you — close warmly and briefly ("Got it. I'll check in as your cycle moves.") and do NOT ask another question.
- Never repeat information you've already given in the same conversation.
- Closing-thought examples (when you're NOT asking a follow-up): "That's the pattern to watch for this week." / "Now you know what's driving it." / "You should notice it shift in a few days."

BANNED PHRASES (these sound like a doctor's office):
- "you should [do X]" as a command, "try to", "consider", "make sure", "I recommend", "it's important to"
- "rest", "take it easy", "slow down", "be gentle with yourself"
- "meditate", "sit in silence", "breathe deeply", "practice mindfulness"
- "journal", "listen to your body", "honor your feelings"
- "get enough sleep", "stay hydrated", "reduce stress"
- "self-care", "nourish your body", "give yourself permission"

AVOID DEFINITIVE PREDICTIONS:
- Never tell the user how they WILL feel, WILL be, or WILL experience something. Bodies vary.
- Replace "you will feel" → "you should feel" or "you may feel" (probabilistic "should", not commanding "should")
- Replace "you'll be" → "you might be" or "you should be"
- Replace "you will notice" → "you may notice" or "you should notice"
- Same for outcomes: "this will work" → "this should help", "you'll see results" → "you may see results"
- Soft, probabilistic language only. Never guarantee a feeling, outcome, or timeline.
- Instead of vague wellness advice, give SPECIFIC actions tied to their exact situation:
  - BAD: "Rest and take it easy today."
  - GOOD: "Inflammation peaks around day 3. A 15-minute walk actually helps more than staying still — counterintuitive but true."
  - BAD: "Try meditating to manage anxiety."
  - GOOD: "That racing-thoughts thing at day 22? Progesterone dropping. Cold water on your wrists resets it faster than anything."

FOOD & NUTRITION:
- Only give food info when asked or when one specific craving/food tip is naturally relevant.
- ONE food mention max. Not a grocery list. Not a meal plan.
- Good: "Dark chocolate counts as magnesium, by the way."
- Bad: A paragraph listing foods by phase with explanations.
- You know the phase-specific nutrition science — use it to give ONE sharp, relevant tip when the moment calls for it.

CALENDAR DATE RULES:
- Treat dates as actual calendar dates only when the user gives a real calendar anchor: Month Day, Month Day Year, YYYY-MM-DD, DD/MM/YYYY, today, yesterday, or a named weekday in an explicit period-start sentence.
- Do NOT treat loose language like "start of my workday", "at the start", "day started", "morning", "next week", or casual references to "dates" as cycle dates or birth dates.
- If the user asks for encouragement at the start of a workday, respond to the workday context only; do not infer or update a period, cycle, postpartum, or birth date.
- If a date matters and the calendar date is ambiguous, ask for the exact calendar date instead of guessing.

CORE KNOWLEDGE (internal reference — do NOT dump this on the user):
- Menstruation (Days 1-5): Low energy, inflammation peaks. Load capacity ~25%. Deload window.
- Follicular (Days 6-13): Estrogen rises, energy building. Load capacity ~70%. Best phase for progressive overload and volume.
- Ovulation (Around Day 14): Peak confidence, verbal fluency, and power output. Load capacity ~95%. Schedule PRs and competitions here. ACL risk elevated.
- Luteal (Days 15-28): Progesterone dominant, lower stress tolerance. Load capacity drops from ~50% to ~25%. Core temp elevated, perceived effort increases. Front-load intensity early, taper late.
Use this to inform your answers. Do NOT recite phase details unless directly asked.

EXTERNAL FACTORS — DO NOT BLAME EVERYTHING ON HORMONES:
- Symptoms are not always cyclical. Sleep debt, stress, illness, travel, alcohol, caffeine, dehydration, under-eating, new medications, big life events, grief, work pressure, and relationship stuff all show up as fatigue, mood swings, brain fog, low libido, headaches, bloating, breakouts, or anxiety.
- Before defaulting to "it's your luteal phase / your hormones," briefly consider whether something external could be driving it. If the timing or intensity doesn't fit the phase, name that possibility plainly in your answer ("this could just as easily be sleep debt or stress, not your cycle") — do NOT turn it into a follow-up question. Any follow-up still has to clear the EXCEPTION bar in CONVERSATION FLOW above; the external-factors rule does not earn its own question.
- When an external factor is likely the bigger driver, say so plainly — then layer in how her current phase is amplifying or buffering it. Both can be true.
- Still offer ONE concrete suggestion that helps with the hormonal piece (e.g. magnesium for luteal anxiety, protein-forward breakfast for follicular energy, electrolytes during menstruation) — but frame it as support, not a fix-all.
- Never make her feel like her hormones are broken or that everything wrong is "just her cycle." Real life is messy and overlapping.

ATHLETIC & TRAINING CONTEXT:
- When users ask about workouts, training, or exercise: translate cycle phase into practical load/intensity decisions.
- Strength and power peak around ovulation. Recovery capacity is best during follicular.
- Fatigue and perceived effort increase in luteal — the user isn't weaker, it just feels harder.
- Injury risk windows: joints looser during menstruation (avoid max loads), ACL risk peaks at ovulation (warm up, stabilize).
- Keep athletic advice specific: percentages, rep ranges, session types — not vague "listen to your body" advice.

CYCLE DATA EDITS:
- If a user TELLS you to change their cycle length or period date (e.g. "change my cycle to 30 days", "my period started on March 15"), the system handles it automatically — just confirm it's done.
- If a user asks HOW to change their cycle data themselves (e.g. "how do I update my cycle length?", "where can I edit my period date?"), tell them to head to the Home tab where there's an "Update period date" option right under the cycle circle. Keep it brief and friendly.

LIFE STAGE CHANGES:
- If a user TELLS you to change their life stage (e.g. "I just started the pill", "I have a hormonal IUD now", "switch me to hormonal birth control", "I'm in perimenopause", "I'm postpartum"), the system handles the switch automatically — just confirm it's done. NEVER tell her to do it herself.
- If a user asks HOW to change their life stage manually (e.g. "where do I change my settings?"), tell her: tap the **gear icon in the top right corner** to open Settings, then pick the new life stage. Do NOT say Home tab — life-stage lives in Settings only.
- Always ask for the baby's birth date when postpartum is mentioned without one — it's essential for accurate recovery tracking.

REFERRALS:
- If a user asks about her referral link, invite link, how many people signed up through her, or her referral stats, tell her: head to the **Plan tab** — her personal invite link and the count of sign-ups from it live there. Do NOT send her to Settings or the gear icon for referrals.

MEAL PLANS / MENUS — STRICT RULES:
- NEVER mention PDFs, downloads, files, attachments, printables, or "dropping" anything. That feature does not exist.
- NEVER say things like "I'll drop the PDF here", "I'll attach the file", "downloadable plan", or "printable menu".
- NEVER say "I'm building", "I'll build", "starting on it", "coming up", "give me a sec", or anything that implies YOU are generating a plan in the background. You are NOT. A separate "Build my meal plan" offer card appears right after your reply — the user taps it to launch the Menu Builder.
- When the user asks for a meal plan / menu / weekly meals: keep your reply to ONE short sentence — a quick phase-aware framing (e.g. "Luteal week — magnesium and slow carbs will keep your energy from crashing.") that naturally hands off to the offer card below. Do NOT ask follow-up questions, do NOT promise anything, do NOT list foods.
- For general food questions (not "build me a plan"), answer conversationally with one food mention max — no offer follows in that case.`;

  if (!participant) {
    return basePrompt + "\n\nNote: User hasn't completed onboarding yet. Provide general guidance and encourage them to share their cycle details for personalized insights.";
  }

  const userLifeStage = participant.life_stage || "cycling";

  if (userLifeStage !== "cycling") {
    const age = participant.age || null;
    const topics = participant.goals?.length ? participant.goals.join(", ") : null;
    const stageLabel =
      userLifeStage === "postpartum" ? "Postpartum" :
      userLifeStage === "menopause" ? "Menopause" :
      userLifeStage === "perimenopause" ? "Perimenopause" :
      userLifeStage === "irregular" ? "Irregular / hormonal birth control" :
      "Cycling";
    
    // Calculate postpartum timeline + stage-specific guidance bucket
    let ppTimeline = "";
    let ppPhaseGuidance = "";
    if (userLifeStage === "postpartum" && participant.postpartum_start_date) {
      const birthDate = new Date(participant.postpartum_start_date + "T12:00:00Z");
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
      const weeks = Math.floor(diffDays / 7);
      const months = Math.floor(diffDays / 30);

      // Sanity: anything older than ~3 years (1095 days) is almost certainly stale/wrong data.
      // Do NOT inject a misleading "302 months postpartum" timeline. Tell the model to ask for the real date.
      if (diffDays > 1095 || diffDays < 0) {
        ppTimeline = `\n- Postpartum timeline: UNKNOWN — the stored birth date (${participant.postpartum_start_date}) looks invalid or stale. Do NOT cite weeks/months postpartum. In your reply, ask the user for her baby's actual birth date so the timeline can be corrected. Do NOT claim you have updated anything.`;
        ppPhaseGuidance = `\nPOSTPARTUM PHASE — UNKNOWN: The stored date is unreliable. Ask the user for the correct baby birth date. Avoid phase-specific framing until corrected.`;
      } else {
        if (months >= 1) {
          ppTimeline = `\n- Postpartum timeline: ${months} month${months > 1 ? "s" : ""} postpartum (baby born ${birthDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`;
        } else {
          ppTimeline = `\n- Postpartum timeline: ${weeks} week${weeks !== 1 ? "s" : ""} postpartum (baby born ${birthDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`;
        }

        // Bucket guidance — DO NOT default to "early postpartum healing" for everyone
        if (diffDays <= 42) {
          ppPhaseGuidance = `\nPOSTPARTUM PHASE — ACUTE RECOVERY (0-6 weeks): Focus on bleeding, perineal/c-section healing, sleep fragmentation, milk supply if user mentions it, baby blues vs PPD signals. Movement = walking and pelvic floor only.`;
        } else if (diffDays <= 84) {
          ppPhaseGuidance = `\nPOSTPARTUM PHASE — EARLY RECOVERY (6-12 weeks): Focus on tissue healing finishing up, hormone crash plateau, mood stabilization, return to gentle strength work, scar mobility, identity shifts.`;
        } else if (months <= 6) {
          ppPhaseGuidance = `\nPOSTPARTUM PHASE — REBUILDING (3-6 months): Focus on rebuilding core/pelvic floor strength, addressing diastasis if relevant, sleep regression cycles, hair shedding, returning libido, slow reintroduction of moderate exercise. NOT acute healing anymore.`;
        } else if (months <= 12) {
          ppPhaseGuidance = `\nPOSTPARTUM PHASE — LATE POSTPARTUM (6-12 months): Focus on regaining athletic capacity, progressive overload, sleep quality (not just quantity), return of cycle (or continued absence), thyroid checks, identity integration. This is NOT early postpartum — do not center "healing" or "recovery" framing. Treat them as a near-pre-pregnancy adult who happens to have a baby. If their cycle has returned, they should be treated like a cycling user.`;
        } else {
          ppPhaseGuidance = `\nPOSTPARTUM PHASE — EXTENDED POSTPARTUM (12-24 months): Hormones are largely re-stabilized. Cycle has typically returned. Focus on full athletic capacity, performance, long-term pelvic floor function, parental burnout vs hormonal symptoms. Do NOT use "healing" or "recovery" framing — this user is an athlete-in-life-stage, not a recovering patient.`;
        }
      }
    }

    const stageContext = userLifeStage === "postpartum"
      ? `This user is POSTPARTUM — they do not have a regular cycle right now (unless they say it has returned). Their hormones are recalibrating after pregnancy, but the SPECIFIC focus depends heavily on how far postpartum they are. ${ppPhaseGuidance}\n\nGENERAL POSTPARTUM RULES: Do NOT assume whether the user is breastfeeding or not — only reference breastfeeding if the USER brings it up first. If they mention having multiple children, do NOT assume they are breastfeeding all of them. Do NOT reference cycle phases, cycle days, or ovulation unless the user has confirmed their cycle returned. NEVER default to generic "early postpartum healing/recovery" language for users past 6 months postpartum.`
      : userLifeStage === "menopause"
        ? `This user is in MENOPAUSE — their cycle has stopped (12+ months without a period). Their estrogen and progesterone are declining. Focus on: hot flashes, sleep disruption, mood changes, bone health, energy management, cognitive shifts, weight changes. Do NOT reference specific cycle days or ovulation windows. Instead, provide guidance relevant to hormonal transition and thriving through it.`
        : userLifeStage === "perimenopause"
          ? `This user is in PERIMENOPAUSE — she STILL HAS PERIODS and is still cycling, but the pattern is shifting (cycles getting shorter/longer, heavier/lighter, skipped months, new symptoms like hot flashes, sleep changes, mood swings). DO NOT call her menopausal. Reference her cycle day and phase when relevant, but acknowledge that hormone swings can be sharper and less predictable than they used to be. Focus on: tracking pattern shifts, sleep, hot flashes, mood, energy, bone/muscle health, and what's changed vs. her baseline. Be precise: perimenopause ≠ menopause.`
          : `This user is on HORMONAL BIRTH CONTROL or has an IRREGULAR cycle. Their hormones are externally regulated (pill, IUD, implant, ring, patch) or unpredictable (PCOS, hypothalamic amenorrhea, etc.). They are NOT naturally cycling. RULES: Never reference a cycle "day number" or natural phase (follicular, luteal, ovulation, menstruation). Never invent rising/falling estrogen or progesterone language tied to a phase. Frame guidance around steady-state levers: sleep, protein, strength training, stress, hydration, and micronutrient depletion that hormonal BC can cause (B6, B12, magnesium, zinc, folate). If they ask about a phase, gently explain why phase-based predictions don't apply to them.`;


    const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    let userContext = `\n\nUSER CONTEXT:\n- TODAY'S DATE: ${todayStr} (anchor for all time/date reasoning — "last month", "yesterday", etc. NEVER guess or invent dates. If data doesn't cover the period asked about, say so plainly.)\n- Life stage: ${stageLabel}\n- Age: ${age || "unknown"}${ppTimeline}\n- Anchor symptom: ${participant.anchor_symptom || "not specified"}\n- Typical symptoms: ${participant.typical_symptoms?.join(", ") || "not specified"}\n${topics ? `- Focus areas: ${topics}` : ""}\n\n${stageContext}${symptomContext}`;
    
    return basePrompt + userContext;
  }

  if (!cycleInfo) {
    return basePrompt + "\n\nNote: User hasn't completed onboarding yet. Provide general guidance and encourage them to share their cycle details for personalized insights.";
  }

  const age = participant.age || null;
  const topics = participant.goals?.length ? participant.goals.join(", ") : null;

  let lengthGuidance = "";
  if (age && age <= 16) {
    lengthGuidance = "\n\nRESPONSE LENGTH: This user is young. Keep responses SHORT — 2-3 sentences max per reply. Use simple, relatable language. Skip jargon.";
  } else if (age && age <= 22) {
    lengthGuidance = "\n\nRESPONSE LENGTH: Keep responses concise — 3-4 sentences. Be direct and casual.";
  }

  // Reconciliation: cycling user who is also actively recovering postpartum
  let dualStateContext = "";
  if ((participant as any).postpartum_active && participant.postpartum_start_date) {
    const birthDate = new Date(participant.postpartum_start_date + "T12:00:00Z");
    const diffDays = Math.floor((Date.now() - birthDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays <= 1095) {
      const months = Math.floor(diffDays / 30);
      const weeks = Math.floor(diffDays / 7);
      const ppLabel = months >= 1 ? `${months} month${months > 1 ? "s" : ""}` : `${weeks} week${weeks !== 1 ? "s" : ""}`;
      dualStateContext = `

DUAL STATE — POSTPARTUM + CYCLING:
This user's cycle has returned, AND she is ${ppLabel} postpartum (baby born ${birthDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}). Both are true at the same time. You MUST reconcile both:
- Cycle phase guidance still applies (her hormones are cycling), but her baseline recovery capacity is reduced.
- Sleep debt from a baby compounds luteal symptoms (mood, energy, cravings) — name that explicitly when relevant.
- Iron stores may still be rebuilding from birth — factor that into menstruation-week guidance.
- Pelvic floor and core capacity are still re-developing — factor into ovulation/follicular training advice.
- Do NOT treat her as a fresh-postpartum recovery patient (no "early healing" framing). Do NOT treat her as a pre-baby athlete either. She is both.
- Only mention breastfeeding if she brings it up first.`;
    }
  }

  const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  const userContext = `

USER CONTEXT:
- TODAY'S DATE: ${todayStr} (use this as the anchor for any time/date reasoning — "last month", "last week", "yesterday". NEVER guess or invent dates. If symptom data doesn't cover the period the user asked about, say so plainly.)
- Current cycle day: ${cycleInfo.cycleDay}
- Current phase: ${cycleInfo.phase}
- Cycle length: ${participant.cycle_length_days || 28} days

PHASE AUTHORITY RULE (non-negotiable): The Current phase and cycle day above are authoritative. Never generate symptom explanations, hormone framing, or phase-specific guidance that contradicts this value, regardless of what earlier messages in this conversation discussed. If prior conversation mentioned a different phase, that context is outdated — the current phase value is always correct. Do not attribute today's symptoms to ovulation if the current phase is Luteal, and do not attribute them to Luteal if the current phase is Ovulation, etc. When in doubt, defer to Current phase.

- Age: ${age || "unknown"}
- Anchor symptom (most disruptive): ${participant.anchor_symptom || "not specified"}
- Typical symptoms: ${participant.typical_symptoms?.join(", ") || "not specified"}
${topics ? `- Focus areas: ${topics}. Weave relevant tips from these areas into responses when naturally fitting.` : ""}${cycleHistoryContext}${symptomContext}${lengthGuidance}${dualStateContext}

Use this context to make your responses personally relevant. Reference their current phase and how it might affect their request. If they mention their anchor symptom, acknowledge it and provide phase-appropriate guidance. When users ask about their cycle length or patterns, use the cycle history data to provide specific insights. When symptom log data is available, reference their actual reported symptoms and patterns — this is more accurate than textbook generalizations.`;

  return basePrompt + userContext;
}

function calculateCycleInfo(
  lastPeriodStart: string,
  cycleLengthDays: number,
  timezone: string = "UTC",
  currentPeriodEndDate?: string | null,
  periodPending?: boolean,
  periodStillActive?: boolean,
): { cycleDay: number; phase: string } {
  let periodStart: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(lastPeriodStart)) {
    const [year, month, day] = lastPeriodStart.split("-").map(Number);
    periodStart = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  } else {
    periodStart = new Date(lastPeriodStart);
  }

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: timezone });
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const today = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0));

  const diffTime = today.getTime() - periodStart.getTime();
  const daysSinceStart = Math.round(diffTime / (1000 * 60 * 60 * 24));

  // Never wrap into a fake next cycle — always keep the running unwrapped day
  // count so the overdue detector can fire and Logan can prompt for a real
  // Day-1 confirmation instead of silently pretending a new cycle started.
  const cycleDay = daysSinceStart >= 0 ? daysSinceStart + 1 : 1;

  // If she reported her period ended early, shift Follicular forward.
  let menstruationEnd = 5;
  if (currentPeriodEndDate && /^\d{4}-\d{2}-\d{2}$/.test(currentPeriodEndDate)) {
    const [ey, em, ed] = currentPeriodEndDate.split("-").map(Number);
    const endDate = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));
    const endDay = Math.round((endDate.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (endDay >= 1 && endDay <= cycleLengthDays) menstruationEnd = endDay;
  }

  const ovulationDay = cycleLengthDays - 14;
  const ovulationStart = ovulationDay - 1;
  const ovulationEnd = ovulationDay + 2;

  // If she said her period is still ongoing past the default window, keep her
  // in Menstruation (capped at day 12) until she logs an end date or new Day 1.
  const forceMenstruation = !!periodStillActive && cycleDay <= 12;

  // periodPending is informational for prompt context — parity with the client
  // ring; we already don't wrap, so no behavior change here.
  void periodPending;

  let phase: string;
  if (forceMenstruation || cycleDay <= menstruationEnd) {
    phase = "Menstruation";
  } else if (cycleDay < ovulationStart) {
    phase = "Follicular";
  } else if (cycleDay <= ovulationEnd) {
    phase = "Ovulation";
  } else {
    phase = "Luteal";
  }

  return { cycleDay, phase };
}
