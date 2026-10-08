// Acute-distress and self-harm handling for Logan chat.
// Pure functions only (no Deno or network APIs) so the same file is unit tested.
//
// To update a phone number or line, edit EMERGENCY_NUMBERS below. Nothing else needs to change.

// ───────────────────────── Numbers, keyed by region then situation ─────────────────────────

export type RegionCode = "IL" | "US" | "UK";
export type Situation = "medical_red_flag" | "self_harm" | "abuse" | "trauma";
/** crisis = talk to someone now, emergency = immediate danger, secondary = extra support. */
export type EntryRole = "crisis" | "emergency" | "secondary";
export interface NumberEntry { role: EntryRole; label: string; contact: string }

/** Each situation lists at most 3 entries (checked by a test). */
export const EMERGENCY_NUMBERS: Record<RegionCode, Partial<Record<Situation, NumberEntry[]>>> = {
  IL: {
    medical_red_flag: [
      { role: "emergency", label: "Magen David Adom (ambulance)", contact: "101" },
      { role: "emergency", label: "Police", contact: "100" },
    ],
    self_harm: [
      { role: "crisis", label: "ERAN emotional first aid, free, anonymous, 24/7", contact: "call 1201 (for English, extension 10) or WhatsApp 052-8451201" },
      { role: "emergency", label: "Magen David Adom", contact: "101" },
      { role: "secondary", label: "SAHAR, written online support", contact: "sahar.org.il" },
    ],
    abuse: [
      { role: "crisis", label: "Ministry of Welfare 24/7 line", contact: "118" },
      { role: "crisis", label: "Silent SMS to 118", contact: "050-2270118" },
      { role: "crisis", label: "Sexual violence, women's line", contact: "1202" },
    ],
    trauma: [
      { role: "crisis", label: "NATAL (war and terror-related trauma)", contact: "*3362 or 1-800-363-363" },
    ],
  },
  US: {
    medical_red_flag: [{ role: "emergency", label: "Emergency services", contact: "911" }],
    self_harm: [
      { role: "crisis", label: "988 Suicide & Crisis Lifeline", contact: "call or text 988" },
      { role: "emergency", label: "Emergency services", contact: "911" },
    ],
  },
  UK: {
    medical_red_flag: [{ role: "emergency", label: "Emergency services", contact: "999" }],
    self_harm: [
      { role: "crisis", label: "Samaritans, free, 24/7", contact: "116 123" },
      { role: "emergency", label: "Emergency services", contact: "999" },
    ],
  },
};

/** Timezone → region. Anything not listed falls back to "your local emergency number". */
const IL_ZONES = new Set(["Asia/Jerusalem", "Asia/Hebron", "Asia/Tel_Aviv", "Israel"]);
const UK_ZONES = new Set(["Europe/London", "Europe/Belfast", "GB", "GB-Eire", "Europe/Jersey", "Europe/Guernsey", "Europe/Isle_of_Man"]);
const US_ZONES = new Set([
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix",
  "America/Anchorage", "America/Juneau", "America/Sitka", "America/Nome", "America/Yakutat", "America/Metlakatla",
  "America/Detroit", "America/Boise", "America/Adak", "America/Menominee", "America/Indiana/Indianapolis",
  "America/Indianapolis", "America/Fort_Wayne", "America/Kentucky/Louisville", "America/Louisville",
  "America/North_Dakota/Center", "America/North_Dakota/New_Salem", "America/North_Dakota/Beulah",
  "Pacific/Honolulu", "US/Eastern", "US/Central", "US/Mountain", "US/Pacific", "US/Alaska", "US/Hawaii",
  "US/Arizona", "US/Michigan", "US/East-Indiana", "US/Aleutian",
]);

export function regionForTimezone(tz: string | null | undefined): RegionCode | null {
  if (!tz) return null;
  if (IL_ZONES.has(tz)) return "IL";
  if (UK_ZONES.has(tz)) return "UK";
  if (US_ZONES.has(tz)) return "US";
  return null;
}

const LOCAL_EMERGENCY = "your local emergency number";
const MAX_NUMBERS = 3;

function entries(region: RegionCode | null, situation: Situation): NumberEntry[] {
  if (!region) return [];
  return (EMERGENCY_NUMBERS[region]?.[situation] ?? []).slice(0, MAX_NUMBERS);
}

/** First emergency-role number for the region ("101"), or the generic fallback. */
function emergencyPhrase(region: RegionCode | null, situation: Situation = "medical_red_flag"): string {
  const e = entries(region, situation).find((x) => x.role === "emergency");
  if (!e) return LOCAL_EMERGENCY;
  const first = e.label.split(" (")[0];
  return region === "IL" ? `${first} on ${e.contact}` : `${e.contact}`;
}

// ───────────────────────── Detection patterns ─────────────────────────
// Matched against lowercased text with straight apostrophes. Hebrew has no \b support in JS,
// so Hebrew phrases are plain substrings. Every pattern is listed in the PR description.

const PANIC = "p[ae]n+[iy]c?k?";
const ATTACK = "a+t{1,2}a?c?k";

export const ACUTE_PATTERNS: RegExp[] = [
  new RegExp(`\\b${PANIC}\\s*${ATTACK}s?\\b`),
  new RegExp(`\\b${PANIC}(?:ing|king)\\b`),
  /\banxiety\s+att?[ae]?c?k\b/,
  /\b(?:can'?t|cant|cannot|couldn'?t|unable to|not able to|struggling to|trouble|hard to|hardly able to)\s+(?:\w+\s+)?(?:breathe|breath|breathing)\b/,
  /\bcan'?t\s+catch\s+my\s+breath\b/,
  /\b(?:hyperventilat\w*|short of breath|gasping for (?:air|breath))\b/,
  /\b(?:can'?t|cant|cannot|won'?t|wont|unable to|not able to)\s+(?:seem to\s+)?(?:calm(?:\s+(?:down|myself))?|settle(?:\s+down)?|relax)\b/,
  /\b(?:can'?t|cant|cannot)\s+stop\s+(?:shaking|trembling|panicking|spiral(?:l)?ing)\b/,
  /\bfreak(?:ing|in|ed)?\s*out\b/,
  /\b(?:i'?m|im|i am)\s+(?:so\s+|really\s+)?(?:losing it|spiral(?:l)?ing|having a (?:meltdown|breakdown))\b/,
  /\b(?:feel|feels|feeling)\s+like\s+(?:i'?m|im|i am)\s+(?:dying|going to die|gonna die|having a heart attack|losing my mind|going crazy)\b/,
  // Hebrew
  "התקף חרדה", "התקף פאניקה", "פאניקה", "בפאניקה", "לא יכולה לנשום", "לא יכול לנשום", "לא מצליחה לנשום", "לא מצליח לנשום",
  "קשה לי לנשום", "מתחרפנת", "מתחרפן", "לא מצליחה להירגע", "לא מצליח להירגע", "לא יכולה להירגע", "לא יכול להירגע", "מרגישה שאני מתה", "מרגיש שאני מת",
].map((p) => (typeof p === "string" ? new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : p));

/** Past or informational phrasing. Suppresses an acute trigger unless NOW_RE also matches. */
const PAST_RE = /\b(?:had|have had|used to|last (?:night|week|month|year|time)|yesterday|ago|history of|i get|she gets|gets? them|when i (?:have|get)|after i had)\b|היה לי|הייתה לי|אתמול|פעם/;
const NOW_RE = /\b(?:right now|currently|happening|again|i'?m having|im having|am having|i think i'?m|i think im|having a|about to|starting|can'?t|cant|cannot)\b|עכשיו|יש לי/;
const INFO_Q_RE = /^(?:what(?:'s| is| are)|why do|why does|what causes|is a panic|are panic|how common|can a panic|do panic|does a panic)\b/;

export function detectAcuteDistress(text: string): boolean {
  const t = norm(text);
  if (!t || detectSelfHarm(t)) return false;
  if (!ACUTE_PATTERNS.some((p) => p.test(t))) return false;
  if (INFO_Q_RE.test(t) && !/\b(?:i'?m|im|i am|my)\b/.test(t)) return false;
  if (PAST_RE.test(t) && !NOW_RE.test(t)) return false;
  return true;
}

// Err broad: a false positive is acceptable, a miss is not.
// Tier 1, explicit: gets the full self-harm reply straight away.
export const SELF_HARM_EXPLICIT_PATTERNS: RegExp[] = [
  /\bkill(?:ing)?\s+(?:my\s*self|myself)\b/,
  /\bkms\b/,
  /\b(?:suicid\w*|sucide|suicde|suiside|sucicide|suicidle)\b/,
  /\b(?:want|wanna|wants|wanted|ready)\s+(?:to\s+)?die\b/,
  /\bwish\s+(?:i|that i)\s+(?:was|were|could be|would be)\s+(?:dead|gone|not alive)\b/,
  /\bwish\s+(?:i|that i)\s+(?:wouldn'?t|would not|didn'?t|did not)\s+wake\s+up\b/,
  /\b(?:better|rather)\s+(?:be\s+)?(?:off\s+)?dead\b/,
  /\bbetter off without me\b/,
  /\b(?:don'?t|dont|do not|no longer)\s+want\s+to\s+(?:live|be alive|exist)\b/,
  /\b(?:don'?t|dont|do not)\s+wanna\s+(?:live|be alive|exist)\b/,
  /\bno\s+(?:reason|point)\s+(?:to|in|of)\s+(?:live|living|being alive)\b/,
  /\b(?:don'?t|dont)\s+see\s+(?:the|any)\s+point\s+(?:in|of)\s+(?:living|life)\b/,
  /\bend\s+(?:it all|my life|everything|this all)\b/,
  /\btake\s+my\s+(?:own\s+)?life\b/,
  /\b(?:hurt|hurting|harm|harming|cut|cutting|burn|burning|punish|punishing|injure|injuring)\s+(?:my\s*self|myself)\b/,
  /\bself[\s-]?harm\w*\b/,
  /\b(?:overdose|overdosing|od\s+on)\b/,
  /\b(?:take|swallow|swallowing|taking)\s+(?:all\s+)?(?:of\s+)?my\s+(?:pills|meds|medication)\b/,
  /\b(?:hang|hanging|drown|drowning|shoot|shooting|stab|stabbing)\s+(?:my\s*self|myself)\b/,
  /\bjump(?:ing)?\s+(?:off|from)\s+(?:a|the|my)\s+(?:bridge|roof|building|balcony|window|ledge)\b/,
  /\beveryone\s+(?:would be|is)\s+better\s+off\s+without\s+me\b/,
  // Hebrew
  "להתאבד", "אובדני", "אובדנית", "אובדנות", "רוצה למות", "לא רוצה לחיות",
  "לפגוע בעצמי", "לפגוע בעצמה", "לגמור עם הכל", "לסיים את החיים", "לסיים עם הכל", "אין טעם לחיות", "הלוואי שהייתי מתה", "הלוואי שהייתי מת",
  "להרוג את עצמי", "אני אהרוג את עצמי", "לחתוך את עצמי",
].map((p) => (typeof p === "string" ? new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : p));

// Tier 2, ambiguous: could be exhaustion or a breakup. Gets a gentle check-in, not the full reply.
export const SELF_HARM_AMBIGUOUS_PATTERNS: RegExp[] = [
  /\b(?:ending|end)\s+it\b/,
  /\bcan'?t\s+(?:go on|keep going|do this anymore|do this any more|take it anymore|take it any more)\b/,
  /\b(?:don'?t|dont|do not|no longer)\s+want\s+to\s+(?:be here|be around|wake up|go on|keep going)\b/,
  /\b(?:don'?t|dont|do not)\s+wanna\s+(?:be here|be around|wake up|go on)\b/,
  /\bno\s+(?:reason|point)\s+(?:to|in|of)\s+(?:go on|going on|anything)\b/,
  /\b(?:don'?t|dont)\s+see\s+(?:the|any)\s+point\s+(?:in|of)\s+(?:going on|anything)\b/,
  /\b(?:wish|want)\s+(?:i|to)\s+(?:could\s+)?(?:disappear|vanish|not exist|never (?:been born|wake up))\b/,
  // Hebrew
  "לא רוצה להיות פה", "לא רוצה להיות כאן", "רוצה להיעלם",
].map((p) => (typeof p === "string" ? new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : p));

/** Tier 1: explicit self-harm language. */
export function detectSelfHarm(text: string): boolean {
  const t = norm(text);
  return !!t && SELF_HARM_EXPLICIT_PATTERNS.some((p) => p.test(t));
}

/** Tier 2: ambiguous language (only meaningful when detectSelfHarm is false). */
export function detectSelfHarmAmbiguous(text: string): boolean {
  const t = norm(text);
  return !!t && SELF_HARM_AMBIGUOUS_PATTERNS.some((p) => p.test(t));
}

/** Immediate-danger language, only used while already in self-harm mode. */
const IMMINENT_RE = /\b(?:not safe|unsafe|i'?m not (?:ok|okay|safe)|no,? i'?m not|i have (?:the |a |my )?(?:pills|knife|gun|rope|blade)|(?:about to|going to|gonna|plan(?:ning)? to)\s+(?:do it|hurt|kill|end|take|jump|cut)|already (?:took|did|cut|swallowed)|took (?:the |all |some |a lot of )?(?:pills|meds)|overdosed|bleeding)\b|לא בטוחה|לא בטוח|עומדת לעשות|עומד לעשות/;
const SAFE_RE = /^(?:yes|yeah|yep|yup|i'?m safe|i am safe|safe|i'?m (?:ok|okay|fine)|for now|כן|אני בטוחה|אני בטוח)\b/;
const CHECKIN_YES_RE = /^(?:yes|yeah|yep|yup|kind of|kinda|sort of|sometimes|a (?:little|bit)|i think so|maybe|i guess|both|כן)\b/;
const CHECKIN_NO_RE = /^(?:no|nope|nah|not really|not like that|nothing like that|just (?:tired|stressed|venting|frustrated|overwhelmed|exhausted)|i (?:don'?t|do not) mean that|i'?m not|לא)\b/;

/** She signals she is calmer. Any negation or "still" cancels it. */
const CALM_RE = /\b(?:i'?m|im|i am|i feel|feeling|feel|it'?s|its|that'?s|thats|that|this|i'?m feeling|im feeling)\s+(?:\w+\s+)?(?:ok(?:ay)?|fine|better|calmer|calm|alright|all right|safe|breathing (?:again|normally)|passing|passed|easing|eased|over)\b|\b(?:it|that|this)\s+(?:passed|helped|worked)\b|\bbetter now\b|\bcalm(?:er)? now\b|\bthank(?:s| you)?,?\s+(?:i'?m\s+)?(?:better|ok|okay)\b|אני בסדר|יותר טוב|נרגעתי|עברה לי|עבר לי|רגועה|רגוע|מרגישה יותר טוב|מרגיש יותר טוב/;
const NOT_CALM_RE = /\b(?:not|isn'?t|aren'?t|wasn'?t|doesn'?t|don'?t|didn'?t|can'?t|cant|never|still|worse|worst|no)\b|לא בסדר|לא רגועה|לא רגוע|עדיין/;

export function detectCalm(text: string): boolean {
  const t = norm(text);
  return !!t && CALM_RE.test(t) && !NOT_CALM_RE.test(t);
}

/** Only used to decide which extra numbers to show; never to trigger distress mode. */
const ABUSE_RE = /\b(?:abus\w*|hits? me|hit me|hurts? me|beat(?:s|ing)? me|afraid of (?:him|her|them|my \w+)|scared of (?:him|her|them|my \w+)|domestic (?:violence|abuse)|controls? me|threat(?:en|ens|ened|ening)?|not safe at home|unsafe at home|raped?|sexual(?:ly)? (?:assault\w*|abus\w*|violence)|assaulted|chok(?:e|ed|es|ing) me)\b|אלימות|מכה אותי|מפחדת ממנו|אונס|אנס/;
const TRAUMA_RE = /\b(?:the war|war|terror\w*|rocket\w*|missile\w*|sirens?|bomb\w*|october 7|oct 7|hostages?|ptsd|flashbacks?)\b|מלחמה|טרור|אזעקה|אזעקות|טיל|טילים|פיגוע|שבי|7 באוקטובר/;

export function detectAbuse(text: string): boolean { return ABUSE_RE.test(norm(text)); }
export function detectTrauma(text: string): boolean { return TRAUMA_RE.test(norm(text)); }

const YES_RE = /^(?:yes|yeah|yep|yup|sure|ok(?:ay)?|please|yes please|yes,? log it|log it|do it|go ahead|כן)\b/;
const NO_RE = /^(?:no|nope|nah|not now|no thanks|no thank you|don'?t|לא)\b/;
export const isYes = (t: string) => YES_RE.test(norm(t));
export const isNo = (t: string) => NO_RE.test(norm(t));

function norm(text: string): string {
  return (text || "").toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim();
}

// ───────────────────────── Fixed wording ─────────────────────────

export const CHIP_BREATHE = "Breathe with me";
export const CHIP_CALMER = "I'm feeling calmer";
export const CHIP_TALK = "Talk it through";
export const CHIP_LOG_YES = "Yes, log it";
export const CHIP_LOG_NO = "No thanks";
export const DISTRESS_CHIPS = [CHIP_BREATHE, CHIP_CALMER, CHIP_TALK];

/** Added to every distress-mode reply. */
export function redFlagLine(region: RegionCode | null): string {
  return `If you have chest pain, trouble breathing that doesn't ease, feel faint, or this feels different from anything you've had before, please call ${emergencyPhrase(region)} now.`;
}

function extraSupportLines(region: RegionCode | null, text: string): string {
  const out: string[] = [];
  const add = (situation: Situation, intro: string) => {
    const list = entries(region, situation);
    if (list.length) out.push(`${intro} ${list.map((e) => `${e.label}: ${e.contact}`).join("; ")}.`);
  };
  if (detectAbuse(text)) add("abuse", "If you're not safe at home, you can reach:");
  if (detectTrauma(text)) add("trauma", "For support after war or terror-related trauma:");
  return out.join("\n\n");
}

const ACUTE_FIRST = `I'm right here with you. Panic attacks can feel really scary, and they do pass.

Let's slow your breathing together. Breathe in through your nose for 4, then let it out slowly through your mouth for 6, like blowing on hot tea. Do that a few times.

If it helps, press both feet into the floor and notice how solid it feels.`;

const ACUTE_AGAIN = `I'm still right here. Let's try something to anchor you.

Look around and name 3 things you can see. Then 2 things you can touch. Take one slow breath out between each.`;

const BREATHE_ROUND = `Okay, together, nice and slow.

In through your nose: 1, 2, 3, 4.
Out through your mouth, longer: 1, 2, 3, 4, 5, 6.

Again. In: 1, 2, 3, 4. Out: 1, 2, 3, 4, 5, 6.

One more. In: 1, 2, 3, 4. Out, slowly: 1, 2, 3, 4, 5, 6.

Let your shoulders drop. Tell me how that felt.`;

const TALK_IT_THROUGH = `I'm here. Tell me what's happening right now, in whatever words come.`;

const CALM_ACK = `I'm really glad it's easing. You got through that.

Want me to log this so we can spot patterns?`;

export function acuteReply(region: RegionCode | null, userText: string, again: boolean): string {
  return [again ? ACUTE_AGAIN : ACUTE_FIRST, redFlagLine(region), extraSupportLines(region, userText)].filter(Boolean).join("\n\n");
}

export function breatheReply(region: RegionCode | null): string {
  return [BREATHE_ROUND, redFlagLine(region)].join("\n\n");
}

export function talkItThroughReply(region: RegionCode | null): string {
  return [TALK_IT_THROUGH, redFlagLine(region)].join("\n\n");
}

export const calmAckReply = (): string => CALM_ACK;
export const LOG_YES_REPLY = "Logged for today.";
export const LOG_SYMPTOM = { name: "Anxiety", severity: 3 };
export const LOG_NO_REPLY = "Okay. I'm here whenever you need me.";

export function selfHarmReply(region: RegionCode | null, userText: string, repeat: boolean): string {
  const list = entries(region, "self_harm");
  const crisis = list.filter((e) => e.role === "crisis");
  const secondary = list.filter((e) => e.role === "secondary");
  const crisisText = crisis.length
    ? crisis.map((e) => `${e.label}: ${e.contact}`).join("; ")
    : "a crisis line in your area, or someone you trust";
  const danger = `If you might act on these thoughts, or you're in immediate danger, please call ${emergencyPhrase(region, "self_harm")} now.`;
  const opener = repeat
    ? "I'm still here, and I'm not going anywhere."
    : "I'm really glad you told me. I'm here with you, and I'm staying right here.";
  const parts = [
    opener,
    `What you're feeling matters, and you deserve support from a real person right now. Please reach out to ${crisisText}.`,
    danger,
    secondary.length ? `You can also try ${secondary.map((e) => `${e.label}: ${e.contact}`).join("; ")}.` : "",
    extraSupportLines(region, userText),
    "If someone is near you, please tell them how you're feeling. You don't have to explain it all. Are you somewhere safe right now?",
  ];
  return parts.filter(Boolean).join("\n\n");
}

export const CHECKIN_CHIPS = ["Yes", "No, just exhausted", CHIP_TALK];
export const CHECKIN_REPLY = "That sounds like a lot to carry. When you say that, do you mean you're having thoughts of hurting yourself or not wanting to be alive? Either way, I'm here.";

/** She said she is not safe, or something suggesting immediate danger: emergency number first, brief and warm. */
export function selfHarmDangerReply(region: RegionCode | null): string {
  const crisis = entries(region, "self_harm").filter((e) => e.role === "crisis");
  const line = crisis.length ? `${crisis.map((e) => `${e.label}: ${e.contact}`).join("; ")} is there too.` : "";
  return [
    `Please call ${emergencyPhrase(region, "self_harm")} now. I'm staying right here with you.`,
    "If you can, tell someone near you and ask them to stay with you.",
    line,
  ].filter(Boolean).join("\n\n");
}

/** She said she is safe: stay supportive, crisis line visible once more, invite her to keep talking. */
export function selfHarmSafeReply(region: RegionCode | null): string {
  const crisis = entries(region, "self_harm").filter((e) => e.role === "crisis");
  const line = crisis.length
    ? `If you'd like a person to talk to, ${crisis.map((e) => `${e.label}: ${e.contact}`).join("; ")} is there any time.`
    : "If you'd like a person to talk to, a crisis line in your area is there any time.";
  return `I'm glad you're safe right now, and I'm still here.\n\n${line}\n\nYou're welcome to keep talking with me. What's on your mind?`;
}

// ───────────────────────── Turn planning ─────────────────────────

export type DistressKind = "acute" | "self_harm";
/** AI-answered turns: still in a mode, just after distress, or after a check-in. */
export type DistressAiMode = DistressKind | "post" | "checkin_no" | "checkin_open";

export interface LastAssistant {
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
}

export type DistressPlan =
  | {
      type: "reply";
      message: string;
      metadata: Record<string, unknown>;
      /** Set when this turn newly enters a distress mode (for the count-only analytics). */
      enteredKind?: DistressKind;
      /** Symptoms to save straight away for today (only after her explicit yes). */
      logSymptoms?: { name: string; severity: number }[];
    }
  | { type: "ai"; mode: DistressAiMode }
  | null;

const MODE_WINDOW_MS = 6 * 3600_000;
const POST_WINDOW_MS = 3 * 3600_000;
/** A "session" for self-harm mode: it lasts until 6 hours pass with no self-harm-mode message. */
export const SELF_HARM_SESSION_MS = MODE_WINDOW_MS;

export interface PlanOptions {
  /** True when a self-harm-mode assistant message exists within SELF_HARM_SESSION_MS (looked up by the caller). */
  selfHarmSessionActive?: boolean;
}

export function planDistressTurn(
  userText: string,
  timezone: string | null | undefined,
  last: LastAssistant | null,
  now: Date = new Date(),
  opts: PlanOptions = {},
): DistressPlan {
  const region = regionForTimezone(timezone);
  const md = (last?.metadata ?? {}) as Record<string, unknown>;
  const age = last?.created_at ? now.getTime() - new Date(last.created_at).getTime() : Infinity;
  const lastMode: DistressKind | null =
    age <= MODE_WINDOW_MS && (md.distress_mode === "acute" || md.distress_mode === "self_harm") ? (md.distress_mode as DistressKind) : null;
  const inSelfHarm = opts.selfHarmSessionActive === true || lastMode === "self_harm";
  const mode: DistressKind | null = inSelfHarm ? "self_harm" : lastMode;
  const t = norm(userText);

  // 1. Explicit self-harm language always wins, in any mode.
  if (detectSelfHarm(userText)) {
    return {
      type: "reply",
      message: inSelfHarm && IMMINENT_RE.test(t) ? selfHarmDangerReply(region) : selfHarmReply(region, userText, inSelfHarm),
      metadata: { distress_mode: "self_harm", distress_safety_ask: true, conversation_starters: [CHIP_TALK] },
      enteredKind: inSelfHarm ? undefined : "self_harm",
    };
  }

  // 2. Already in self-harm mode: it stays on for the whole session. No cycle, hormones, logging or partner chips.
  if (inSelfHarm) {
    const meta = { distress_mode: "self_harm", conversation_starters: [CHIP_TALK] };
    if (IMMINENT_RE.test(t)) return { type: "reply", message: selfHarmDangerReply(region), metadata: meta };
    if (md.distress_safety_ask === true && SAFE_RE.test(t)) return { type: "reply", message: selfHarmSafeReply(region), metadata: meta };
    if (detectSelfHarmAmbiguous(userText)) return { type: "reply", message: selfHarmReply(region, userText, true), metadata: { ...meta, distress_safety_ask: true } };
    return { type: "ai", mode: "self_harm" };
  }

  // 3. Answer to the gentle check-in.
  if (md.distress_checkin === true && age <= POST_WINDOW_MS) {
    if (CHECKIN_YES_RE.test(t) || detectSelfHarmAmbiguous(userText)) {
      return {
        type: "reply",
        message: selfHarmReply(region, userText, false),
        metadata: { distress_mode: "self_harm", distress_safety_ask: true, conversation_starters: [CHIP_TALK] },
        enteredKind: "self_harm",
      };
    }
    if (CHECKIN_NO_RE.test(t)) return { type: "ai", mode: "checkin_no" };
    return { type: "ai", mode: "checkin_open" };
  }

  // 4. Ambiguous phrase: gentle check-in, not the full reply.
  if (detectSelfHarmAmbiguous(userText)) {
    return { type: "reply", message: CHECKIN_REPLY, metadata: { distress_checkin: true, conversation_starters: CHECKIN_CHIPS } };
  }

  // 5. She answered "Want me to log this?"
  if (md.distress_log_ask === true && age <= POST_WINDOW_MS) {
    if (isYes(userText)) {
      return {
        type: "reply",
        message: LOG_YES_REPLY,
        metadata: { distress_post: true },
        logSymptoms: [LOG_SYMPTOM],
      };
    }
    if (isNo(userText)) return { type: "reply", message: LOG_NO_REPLY, metadata: { distress_post: true } };
  }

  // 6. She says she is calmer: leave acute mode.
  if (mode === "acute" && detectCalm(userText)) {
    return { type: "reply", message: calmAckReply(), metadata: { distress_post: true, distress_log_ask: true, conversation_starters: [CHIP_LOG_YES, CHIP_LOG_NO] } };
  }

  // 7. Chips while in acute mode.
  if (mode === "acute") {
    if (t === CHIP_BREATHE.toLowerCase()) {
      return { type: "reply", message: breatheReply(region), metadata: { distress_mode: "acute", conversation_starters: DISTRESS_CHIPS } };
    }
    if (t === CHIP_TALK.toLowerCase()) {
      return { type: "reply", message: talkItThroughReply(region), metadata: { distress_mode: "acute", conversation_starters: DISTRESS_CHIPS } };
    }
  }

  // 8. New (or ongoing) acute distress.
  if (detectAcuteDistress(userText)) {
    return {
      type: "reply",
      message: acuteReply(region, userText, mode === "acute"),
      metadata: { distress_mode: "acute", conversation_starters: DISTRESS_CHIPS },
      enteredKind: mode === "acute" ? undefined : "acute",
    };
  }

  // 9. Still in acute mode but nothing above matched: the AI answers under strict rules.
  if (mode === "acute") return { type: "ai", mode: "acute" };

  // 10. The turn right after distress ended: normal chat, with cycle context only on request.
  if (md.distress_post === true && age <= POST_WINDOW_MS) return { type: "ai", mode: "post" };

  return null;
}

// ───────────────────────── Prompt text for AI turns ─────────────────────────

export function distressPromptBlock(mode: DistressAiMode, region: RegionCode | null): string {
  if (mode === "checkin_no" || mode === "checkin_open") {
    const common = `\n\nRUNTIME CONTEXT (this turn only) — AFTER A GENTLE CHECK-IN: She said something that could mean she is struggling badly, and Logan asked whether she has thoughts of hurting herself or not wanting to be alive. Reply short, warm and plain. Do NOT mention her cycle, phase, hormones, or cycle day at all in this reply, and never attribute how she feels to them. No "---" deep dive, no logging, no partner suggestions. `;
    return mode === "checkin_no"
      ? common + `She said no, so go back to supportive chat about what she actually shared.`
      : common + `Her answer did not clearly say yes or no. Respond to what she shared, then gently ask once more whether she is having thoughts of hurting herself or not wanting to be alive. Stay with her.`;
  }
  if (mode === "post") {
    return `\n\nRUNTIME CONTEXT (this turn only) — JUST AFTER A DISTRESS MOMENT: She was in acute distress a moment ago and says she is calmer. Keep the reply short, warm, and plain. Do NOT open with her cycle day or phase. If she asks why it happened, name the common triggers first (stress, poor sleep, caffeine, skipped meals, a lot going on, or sometimes no clear reason), and only then mention her cycle as ONE possible factor, in this hedged way: "progesterone may be dropping around this point, which can make some people more reactive". Never state her hormone levels or what her hormones are doing as fact, never say "the drop in progesterone", never say her cycle day or hormones caused it, and do not use "since you are on day X" reasoning. No hormone lectures and no "---" deep dive. Do not offer to log anything.`;
  }
  if (mode === "self_harm") {
    return `\n\nRUNTIME CONTEXT (this turn only) — SELF-HARM SAFETY MODE: She recently said something that suggests she may be thinking about harming herself. Stay with her. NO cycle talk of any kind: no day, no phase, no hormones. No advice lists, no logging, no partner suggestions, no "---" deep dive. Keep it short and warm. Gently keep the crisis line and ${emergencyPhrase(region, "self_harm")} within reach. Ask how she is doing right now and whether she is safe. Never say it will pass, never minimize.`;
  }
  return `\n\nRUNTIME CONTEXT (this turn only) — ACUTE DISTRESS MODE: She is in acute distress (for example a panic attack). Reply in at most 4 short sentences, plain warm language, no clinical terms. Offer one or two grounding steps (slow breathing with a longer exhale, or naming things she can see or touch). Do NOT mention her cycle day, phase, or hormones, and never attribute this to progesterone, estrogen, or her cycle. No "---" deep dive. Do not suggest logging anything. Do not suggest messaging a partner or anyone else. Stay with her.`;
}

/** Remove the deep-dive divider so "See more" never appears on a distress-mode reply. */
export function stripDeepDive(text: string): string {
  const i = text.indexOf("\n---\n");
  return (i >= 0 ? text.slice(0, i) : text).trimEnd();
}

const HEDGE_RE = /\b(?:may|might|could|can|sometimes|some people|for some)\b/i;
const HORMONE_RE = /\b(?:progesterone|estrogen|oestrogen|hormon\w*)\b/i;
const HEDGED_HORMONE_SENTENCE = "Progesterone may be dropping around this point in a cycle, which can make some people more reactive.";

/**
 * Last-line guard on AI replies in distress-related modes. Sentences that state hormones as fact are removed.
 * After distress ("post"), one hedged sentence replaces them. In other modes hormones are not mentioned at all.
 */
export function sanitizeHormoneClaims(text: string, mode: DistressAiMode): string {
  let removed = false;
  const out = text.replace(/[^.!?\n]+[.!?]+/g, (sentence) => {
    if (!HORMONE_RE.test(sentence)) return sentence;
    if (mode === "post" && HEDGE_RE.test(sentence) && !/\b(?:the|a)\s+(?:sharp |big |massive |sudden )?(?:drop|fall|dip|crash)\b/i.test(sentence)) return sentence;
    removed = true;
    return "";
  }).replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (removed && mode === "post") return `${out}${out ? " " : ""}${HEDGED_HORMONE_SENTENCE}`;
  return out;
}
