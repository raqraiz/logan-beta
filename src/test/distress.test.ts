import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CHECKIN_REPLY, EMERGENCY_NUMBERS, sanitizeHormoneClaims, acuteReply, breatheReply, detectAcuteDistress, detectCalm, detectSelfHarm, detectSelfHarmAmbiguous,
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
  "I want to die", "i wanna die", "I want to end it all", "I want to end my life", "I'm going to hurt myself",
  "thinking about killing myself", "kms", "I'm suicidal", "sucide", "I wish I was dead", "everyone would be better off without me",
  "I don't want to live", "I'm going to take all my pills", "self-harm", "I want to cut myself",
  "אני רוצה למות", "מחשבות אובדניות", "לא רוצה לחיות", "אני רוצה לפגוע בעצמי",
];
const AMBIG_YES = ["I can't do this anymore", "I want to end it", "i don't want to be here anymore", "ending it", "I wish I could disappear", "אני לא רוצה להיות פה"];
const SELF_NO = ["I can't do this anymore", "I don't want to be here anymore", "I'm so tired", "my period is killing me", "I feel like I'm going to die, panic attack", "what's for dinner"];

describe("distress detection", () => {
  it.each(ACUTE_YES)("acute: %s", (m) => expect(detectAcuteDistress(m)).toBe(true));
  it.each(ACUTE_NO)("not acute: %s", (m) => expect(detectAcuteDistress(m)).toBe(false));
  it.each(SELF_YES)("self-harm: %s", (m) => expect(detectSelfHarm(m)).toBe(true));
  it.each(SELF_NO)("not self-harm: %s", (m) => expect(detectSelfHarm(m)).toBe(false));
  it.each(AMBIG_YES)("ambiguous tier: %s", (m) => { expect(detectSelfHarmAmbiguous(m)).toBe(true); expect(detectSelfHarm(m)).toBe(false); });
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
    expect(il).toContain("Panic attacks can feel really scary, and they do pass.");
    expect(il).not.toMatch(/frightening/);
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
    expect(yes.message).toBe("Logged for today.");
    expect(yes.logSymptoms).toEqual([{ name: "Anxiety", severity: 3 }]);
    expect(yes.metadata.log_offer).toBeUndefined();
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
    expect(distressPromptBlock("post", "IL")).toMatch(/may be dropping/);
    expect(distressPromptBlock("self_harm", "IL")).toMatch(/NO cycle talk/);
  });
  it("stripDeepDive removes the See more section", () => {
    expect(stripDeepDive("short\n---\nlong hormone text")).toBe("short");
  });
});

describe("self-harm session and check-in", () => {
  const T = "Asia/Jerusalem";
  const now = new Date("2026-10-08T12:00:00Z");
  const at = (m: Record<string, unknown>, min = 5) => ({ metadata: m, created_at: new Date(now.getTime() - min * 60000).toISOString() });
  const rep = (p: ReturnType<typeof planDistressTurn>) => { if (p?.type !== "reply") throw new Error("expected reply"); return p; };

  it("ambiguous phrase → gentle check-in with the approved wording, not the full reply, not counted", () => {
    const p = rep(planDistressTurn("I can't do this anymore", T, null, now));
    expect(p.message).toBe("That sounds like a lot to carry. When you say that, do you mean you're having thoughts of hurting yourself or not wanting to be alive? Either way, I'm here.");
    expect(p.message).toBe(CHECKIN_REPLY);
    expect(p.metadata.distress_checkin).toBe(true);
    expect(p.metadata.conversation_starters).toEqual(["Yes", "No, just exhausted", "Talk it through"]);
    expect(p.metadata.distress_mode).toBeUndefined();
    expect(p.enteredKind).toBeUndefined();
  });
  it("check-in: yes → full reply (counted); explicit phrase → full reply; no → normal chat without cycle attribution", () => {
    const last = at({ distress_checkin: true });
    expect(rep(planDistressTurn("yes", T, last, now)).enteredKind).toBe("self_harm");
    expect(rep(planDistressTurn("kind of", T, last, now)).message).toContain("1201");
    expect(rep(planDistressTurn("I want to die", T, last, now)).message).toContain("1201");
    expect(planDistressTurn("no, just exhausted", T, last, now)).toEqual({ type: "ai", mode: "checkin_no" });
    expect(distressPromptBlock("checkin_no", "IL")).toMatch(/Do NOT mention her cycle, phase, hormones/);
    expect(planDistressTurn("my boss is awful", T, last, now)).toEqual({ type: "ai", mode: "checkin_open" });
    expect(rep(planDistressTurn("Yes", T, last, now)).message).toContain("1201");
    expect(planDistressTurn("No, just exhausted", T, last, now)).toEqual({ type: "ai", mode: "checkin_no" });
    expect(planDistressTurn("Talk it through", T, last, now)).toEqual({ type: "ai", mode: "checkin_open" });
  });
  it("after the full reply: safe → supportive + crisis line + invite; not safe → emergency number first", () => {
    const last = at({ distress_mode: "self_harm", distress_safety_ask: true });
    const opts = { selfHarmSessionActive: true };
    const safe = rep(planDistressTurn("yes I'm safe", T, last, now, opts));
    expect(safe.message).toContain("1201");
    expect(safe.message).toMatch(/keep talking/);
    expect(safe.message).not.toMatch(/cycle|phase|hormon/i);
    const unsafe = rep(planDistressTurn("no, I'm not safe", T, last, now, opts));
    expect(unsafe.message.startsWith("Please call Magen David Adom on 101 now.")).toBe(true);
    expect(rep(planDistressTurn("I have the pills", T, last, now, opts)).message).toContain("101");
  });
  it("stays in self-harm mode for the whole session, even on calm-sounding messages, and has no chips except Talk it through", () => {
    const opts = { selfHarmSessionActive: true };
    for (const m of ["I'm ok now", "feeling better", "what should I eat today?", "why did that happen?"]) {
      expect(planDistressTurn(m, T, at({}), now, opts)).toEqual({ type: "ai", mode: "self_harm" });
    }
    const again = rep(planDistressTurn("I want to die", T, at({ distress_mode: "self_harm" }), now, opts));
    expect(again.enteredKind).toBeUndefined();
    expect(again.metadata.conversation_starters).toEqual(["Talk it through"]);
  });
  it("exits only on a new session", () => {
    expect(planDistressTurn("what should I eat today?", T, at({}, 600), now, { selfHarmSessionActive: false })).toBeNull();
  });
  it("self-harm mode ignores acute handling and log offers", () => {
    const p = planDistressTurn("I'm having a panic attack", T, at({ distress_mode: "self_harm" }), now, { selfHarmSessionActive: true });
    expect(p).toEqual({ type: "ai", mode: "self_harm" });
  });
});

describe("hedged hormone wording after distress", () => {
  it("post prompt asks for the hedged line and forbids stating hormone levels", () => {
    const p = distressPromptBlock("post", "IL");
    expect(p).toContain("progesterone may be dropping around this point, which can make some people more reactive");
    expect(p).toMatch(/Never state her hormone levels/);
  });
  it("rewrites the live-test sentence into a hedged one", () => {
    const bad = "Stress and poor sleep can do this. Since you are on day 27, the sharp drop in progesterone can also make your nervous system much more reactive.";
    const out = sanitizeHormoneClaims(bad, "post");
    expect(out).toContain("Stress and poor sleep can do this.");
    expect(out).not.toMatch(/day 27|sharp drop/);
    expect(out).toContain("Progesterone may be dropping around this point in a cycle, which can make some people more reactive.");
  });
  it("keeps an already hedged sentence, and drops hormone talk entirely in acute and check-in modes", () => {
    const ok = "Progesterone may be dropping around this point, which can make some people more reactive.";
    expect(sanitizeHormoneClaims(ok, "post")).toBe(ok);
    expect(sanitizeHormoneClaims("Breathe slowly. Your progesterone is low.", "acute")).toBe("Breathe slowly.");
    expect(sanitizeHormoneClaims("That sounds hard. Hormones may play a part.", "checkin_no")).toBe("That sounds hard.");
  });
});

describe("hormone rewrite is limited to the post-distress why-answer", () => {
  const T = "Asia/Jerusalem";
  const now = new Date("2026-10-08T12:00:00Z");
  const post = { metadata: { distress_post: true, distress_log_ask: true }, created_at: new Date(now.getTime() - 60000).toISOString() };

  it("why-questions about the episode get the post mode", () => {
    for (const m of ["why did this happen?", "Why did that happen", "why does it happen to me", "what caused this?", "is it my hormones?", "where did that come from"]) {
      expect(planDistressTurn(m, T, post, now)).toEqual({ type: "ai", mode: "post" });
    }
  });
  it("a normal luteal-phase question right after distress is plain chat: no mode, so nothing is rewritten", () => {
    for (const m of ["what happens in the luteal phase?", "why does the luteal phase make me tired?", "how does progesterone change before my period?", "thanks", "what should I eat today?"]) {
      expect(planDistressTurn(m, T, post, now)).toBeNull();
    }
  });
  it("the rewrite is called in exactly one place in chat-ai, inside the distress-only block", () => {
    const src = readFileSync("supabase/functions/chat-ai/index.ts", "utf8");
    expect(src.match(/sanitizeHormoneClaims\(/g)?.length).toBe(1);
    const i = src.indexOf("sanitizeHormoneClaims(");
    expect(src.slice(src.lastIndexOf("\n    if (", i), i)).toContain("if (distressAiMode) {");
  });
});
