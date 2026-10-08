import { describe, expect, it } from "vitest";
import {
  EMERGENCY_NUMBERS, acuteReply, breatheReply, detectAcuteDistress, detectCalm, detectSelfHarm,
  distressPromptBlock, planDistressTurn, regionForTimezone, selfHarmReply, stripDeepDive,
} from "../../supabase/functions/_shared/distress.ts";

const ACUTE_YES = [
  "I'm having a panic attack", "I think I'm having a panic attack", "im having a pannic attack", "having a panik atack",
  "I'm panicking", "i am panicing so bad", "I can't breathe", "cant breath", "i can't catch my breath", "I'm hyperventilating",
  "I can't calm down", "cant calm down at all", "I'm freaking out", "im freakin out", "I'm losing it", "can't stop shaking",
  "I feel like I'm dying", "anxiety attack right now", "אני בפאניקה", "יש לי התקף חרדה", "אני לא יכולה לנשום", "אני מתחרפנת",
];
const ACUTE_NO = [
  "I had a panic attack last night, why does that happen?", "What is a panic attack?", "I get panic attacks sometimes",
  "my cramps are bad today", "I can't sleep", "היה לי התקף חרדה אתמול", "I'm tired and bloated",
];
const SELF_YES = [
  "I want to die", "i wanna die", "I don't want to be here anymore", "I want to end it all", "ending it", "I'm going to hurt myself",
  "thinking about killing myself", "kms", "I'm suicidal", "sucide", "I wish I was dead", "everyone would be better off without me",
  "I don't want to live", "I can't do this anymore", "I'm going to take all my pills", "self-harm", "I want to cut myself",
  "אני רוצה למות", "מחשבות אובדניות", "לא רוצה לחיות", "אני רוצה לפגוע בעצמי",
];
const SELF_NO = ["I'm so tired", "my period is killing me", "I feel like I'm going to die, panic attack", "what's for dinner"];

describe("distress detection", () => {
  it.each(ACUTE_YES)("acute: %s", (m) => expect(detectAcuteDistress(m)).toBe(true));
  it.each(ACUTE_NO)("not acute: %s", (m) => expect(detectAcuteDistress(m)).toBe(false));
  it.each(SELF_YES)("self-harm: %s", (m) => expect(detectSelfHarm(m)).toBe(true));
  it.each(SELF_NO)("not self-harm: %s", (m) => expect(detectSelfHarm(m)).toBe(false));
  it("self-harm is never treated as acute", () => expect(detectAcuteDistress("I want to die, I'm panicking")).toBe(false));
  it.each(["I'm ok now", "I'm feeling calmer", "feeling better", "it passed", "אני בסדר"])("calm: %s", (m) => expect(detectCalm(m)).toBe(true));
  it.each(["I'm not ok", "still panicking", "I'm not feeling better", "it's not helping"])("not calm: %s", (m) => expect(detectCalm(m)).toBe(false));
});

describe("region and numbers", () => {
  it("maps timezones", () => {
    for (const z of ["Asia/Jerusalem", "Asia/Hebron", "Asia/Tel_Aviv"]) expect(regionForTimezone(z)).toBe("IL");
    expect(regionForTimezone("America/New_York")).toBe("US");
    expect(regionForTimezone("Europe/London")).toBe("UK");
    expect(regionForTimezone("Europe/Paris")).toBeNull();
    expect(regionForTimezone(null)).toBeNull();
  });
  it("each situation lists at most 3 entries", () => {
    for (const r of Object.values(EMERGENCY_NUMBERS)) for (const list of Object.values(r)) expect(list!.length).toBeLessThanOrEqual(3);
  });
  it("acute reply shows only the emergency number, no hotline list", () => {
    const il = acuteReply("IL", "I'm having a panic attack", false);
    expect(il).toContain("101");
    for (const x of ["1201", "sahar", "118", "NATAL"]) expect(il).not.toContain(x);
    expect(acuteReply(null, "panic attack", false)).toContain("your local emergency number");
    expect(acuteReply("US", "panic attack", false)).toContain("911");
    expect(acuteReply("UK", "panic attack", false)).toContain("999");
  });
  it("abuse and trauma numbers appear only when her message points there", () => {
    expect(selfHarmReply("IL", "I want to die", false)).not.toMatch(/118|NATAL/);
    expect(selfHarmReply("IL", "I want to die, he hits me", false)).toContain("118");
    expect(acuteReply("IL", "panic attack, the sirens", false)).toContain("NATAL");
  });
  it("self-harm reply shows ERAN phone + WhatsApp, 101 and SAHAR; unmapped zone uses generic wording", () => {
    const r = selfHarmReply("IL", "I want to die", false);
    for (const x of ["1201", "052-8451201", "101", "sahar.org.il"]) expect(r).toContain(x);
    expect(r).not.toMatch(/Arabic/i);
    expect(selfHarmReply(null, "I want to die", false)).toContain("your local emergency number");
    expect(selfHarmReply("US", "I want to die", false)).toContain("988");
    expect(selfHarmReply("UK", "I want to die", false)).toContain("116 123");
  });
  it("no hormone or cycle words in any canned reply", () => {
    const all = [acuteReply("IL", "", false), acuteReply("IL", "", true), breatheReply("IL"), selfHarmReply("IL", "", false)].join(" ");
    expect(all).not.toMatch(/progesterone|estrogen|hormon|luteal|phase|cycle|Day \d/i);
  });
});

describe("planDistressTurn", () => {
  const T = "Asia/Jerusalem";
  const now = new Date("2026-10-08T12:00:00Z");
  const at = (m: Record<string, unknown>) => ({ metadata: m, created_at: "2026-10-08T11:55:00Z" });

  it("panic attack → fixed reply, chips, no log offer, counted once", () => {
    const p = planDistressTurn("I'm having a panic attack", T, null, now);
    expect(p?.type).toBe("reply");
    if (p?.type !== "reply") return;
    expect(p.message).not.toContain("---");
    expect(p.metadata.conversation_starters).toEqual(["Breathe with me", "I'm feeling calmer", "Talk it through"]);
    expect(p.metadata.log_offer).toBeUndefined();
    expect(p.enteredKind).toBe("acute");
  });
  it("still panicking → second grounding step, not counted again", () => {
    const p = planDistressTurn("I'm still panicking", T, at({ distress_mode: "acute" }), now);
    if (p?.type !== "reply") throw new Error("expected reply");
    expect(p.message).toContain("name 3 things");
    expect(p.enteredKind).toBeUndefined();
  });
  it("Breathe with me → breathing round, stays in mode", () => {
    const p = planDistressTurn("Breathe with me", T, at({ distress_mode: "acute" }), now);
    if (p?.type !== "reply") throw new Error("expected reply");
    expect(p.message).toContain("1, 2, 3, 4, 5, 6");
    expect(p.metadata.distress_mode).toBe("acute");
  });
  it("calm → ack + one log question, mode ends, then yes → log card, then 'why' → post-distress AI turn", () => {
    const calm = planDistressTurn("I'm ok now", T, at({ distress_mode: "acute" }), now);
    if (calm?.type !== "reply") throw new Error("expected reply");
    expect(calm.message).toContain("Want me to log this so we can spot patterns?");
    expect(calm.metadata.distress_mode).toBeUndefined();
    const yes = planDistressTurn("Yes, log it", T, at(calm.metadata), now);
    if (yes?.type !== "reply") throw new Error("expected reply");
    expect(yes.metadata.log_offer).toBeTruthy();
    const why = planDistressTurn("why did that happen?", T, at(yes.metadata), now);
    expect(why).toEqual({ type: "ai", mode: "post" });
  });
  it("'why did that happen?' straight after the log question is a post-distress AI turn", () => {
    const calm = planDistressTurn("I'm ok now", T, at({ distress_mode: "acute" }), now);
    if (calm?.type !== "reply") throw new Error("expected reply");
    expect(planDistressTurn("why did that happen?", T, at(calm.metadata), now)).toEqual({ type: "ai", mode: "post" });
  });
  it("saying no does not log", () => {
    const p = planDistressTurn("No thanks", T, at({ distress_post: true, distress_log_ask: true }), now);
    if (p?.type !== "reply") throw new Error("expected reply");
    expect(p.metadata.log_offer).toBeUndefined();
  });
  it("self-harm overrides acute mode; no chips except Talk it through; no log", () => {
    const p = planDistressTurn("I want to end it all", T, at({ distress_mode: "acute" }), now);
    if (p?.type !== "reply") throw new Error("expected reply");
    expect(p.metadata.distress_mode).toBe("self_harm");
    expect(p.metadata.conversation_starters).toEqual(["Talk it through"]);
    expect(p.enteredKind).toBe("self_harm");
  });
  it("normal chat is untouched", () => {
    expect(planDistressTurn("what should I eat today?", T, null, now)).toBeNull();
    expect(planDistressTurn("what should I eat today?", T, at({ distress_post: true }), new Date("2026-10-08T20:00:00Z"))).toBeNull();
  });
  it("mode expires after 6 hours", () => {
    expect(planDistressTurn("it hurts", T, at({ distress_mode: "acute" }), new Date("2026-10-08T20:00:00Z"))).toBeNull();
  });
  it("AI prompt blocks forbid hormonal attribution and keep 'may play a part' for post-distress", () => {
    expect(distressPromptBlock("acute", "IL")).toMatch(/never attribute/i);
    expect(distressPromptBlock("post", "IL")).toMatch(/may play a part/);
    expect(distressPromptBlock("self_harm", "IL")).toMatch(/NO cycle talk/);
  });
  it("stripDeepDive removes the See more section", () => {
    expect(stripDeepDive("short\n---\nlong hormone text")).toBe("short");
  });
});
