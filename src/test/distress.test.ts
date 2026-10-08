import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CHECKIN_REPLY, EMERGENCY_NUMBERS, sanitizeHormoneClaims, acuteReply, breatheReply, detectAcuteDistress, detectCalm, detectSelfHarm, detectSelfHarmAmbiguous,
  distressPromptBlock, planDistressTurn, regionForTimezone, selfHarmReply, stripDeepDive,
  detectSafeConfirmation, detectCalmSignal, finalizeDistressReply, postCrisisMetadata, postCrisisSupportLine,
  isFactualCycleQuestion, hasRecentDistress, asksWhyItHappened,
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
    // Feeling calmer alone does not end it: it is only recorded, and the reply is still the strict self-harm one.
    for (const m of ["what should I eat today?", "why did that happen?"]) {
      expect(planDistressTurn(m, T, at({}), now, opts)).toEqual({ type: "ai", mode: "self_harm" });
    }
    for (const m of ["I'm ok now", "feeling better"]) {
      expect(planDistressTurn(m, T, at({}), now, opts)).toEqual({ type: "ai", mode: "self_harm", carry: { distress_calm: true } });
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
    expect(src.match(/finalizeDistressReply\(/g)?.length).toBe(1);
    expect(src.match(/sanitizeHormoneClaims\(/g)).toBeNull();
    const i = src.indexOf("finalizeDistressReply(");
    expect(src.slice(src.lastIndexOf("\n    if (", i), i)).toContain("if (distressAiMode) {");
  });
});

describe("soft exit: post-crisis mode", () => {
  const T = "Asia/Jerusalem";
  const now = new Date("2026-10-08T12:00:00Z");
  const shAt = new Date(now.getTime() - 60 * 60000).toISOString();
  const at = (m: Record<string, unknown>, min = 2) => ({ metadata: m, created_at: new Date(now.getTime() - min * 60000).toISOString() });
  const rep = (p: ReturnType<typeof planDistressTurn>) => { if (p?.type !== "reply") throw new Error("expected reply"); return p; };
  const sh = { selfHarmSessionActive: true, selfHarmAt: shAt };
  const askLast = at({ distress_mode: "self_harm", distress_safety_ask: true });
  const plainLast = at({ distress_mode: "self_harm" });
  // In post-crisis mode the previous reply is a post-crisis one, not a self-harm-mode one.
  const pcLast = at(postCrisisMetadata("IL", shAt, now));

  describe("what counts as safe", () => {
    it("'yes' counts only as a direct reply to the safety question", () => {
      expect(detectSafeConfirmation("yes", true)).toBe(true);
      expect(detectSafeConfirmation("yeah", true)).toBe(true);
      expect(detectSafeConfirmation("yes", false)).toBe(false);
      expect(detectSafeConfirmation("yeah sure", false)).toBe(false);
      expect(detectSafeConfirmation("I'm ok", false)).toBe(false);
    });
    it("explicit phrases count anywhere", () => {
      for (const m of ["I'm safe", "I am safe", "I'm somewhere safe", "im safe now", "I'm in a safe place", "אני בטוחה"]) {
        expect(detectSafeConfirmation(m, false)).toBe(true);
      }
    });
    it("negated answers never count, even as a direct reply", () => {
      for (const m of ["I'm not safe", "no", "no I'm not safe", "yes but I'm not safe", "I don't feel safe", "לא בטוחה"]) {
        expect(detectSafeConfirmation(m, true)).toBe(false);
        expect(detectSafeConfirmation(m, false)).toBe(false);
      }
    });
    it("the words that confirm safety don't also count as calmer", () => {
      expect(detectCalmSignal("I'm safe", false)).toBe(false);
      expect(detectCalmSignal("I'm ok", true)).toBe(false);
      expect(detectCalmSignal("yes", true)).toBe(false);
      expect(detectCalmSignal("yes, I feel calmer", true)).toBe(true);
      expect(detectCalmSignal("I'm feeling calmer", false)).toBe(true);
      expect(detectCalmSignal("I'm not feeling better", false)).toBe(false);
    });
  });

  it("a bare 'yes' that does not answer the safety question changes nothing", () => {
    expect(planDistressTurn("yes", T, plainLast, now, sh)).toEqual({ type: "ai", mode: "self_harm" });
    // and calm after it still isn't enough
    expect(planDistressTurn("I'm feeling calmer", T, plainLast, now, sh)).toEqual({ type: "ai", mode: "self_harm", carry: { distress_calm: true } });
  });

  it("safe then calmer → post-crisis (safe reply first, then normal answers)", () => {
    const safe = rep(planDistressTurn("yes", T, askLast, now, sh));
    expect(safe.message).toContain("1201");
    expect(safe.metadata.distress_mode).toBe("self_harm");
    expect(safe.metadata.distress_safe).toBe(true);
    expect(safe.metadata.distress_post_crisis).toBeUndefined();
    const calm = planDistressTurn("I'm feeling calmer now", T, at(safe.metadata), now, { ...sh, sessionFlags: { safe: true } });
    if (calm?.type !== "ai" || calm.mode !== "post_crisis") throw new Error("expected post_crisis");
    expect(calm.metadata?.distress_post_crisis).toBe(true);
    expect(calm.metadata?.distress_support_line).toBe("ERAN 1201 is there anytime.");
  });

  it("calmer then safe → post-crisis, with the fixed safe reply carrying the quiet-line markers", () => {
    const calm = planDistressTurn("I feel better", T, askLast, now, sh);
    expect(calm).toEqual({ type: "ai", mode: "self_harm", carry: { distress_calm: true } });
    const safe = rep(planDistressTurn("yes", T, at({ distress_mode: "self_harm", distress_safety_ask: true, distress_calm: true }), now, { ...sh, sessionFlags: { calm: true } }));
    expect(safe.metadata.distress_post_crisis).toBe(true);
    expect(safe.metadata.distress_support_line).toBe("ERAN 1201 is there anytime.");
  });

  it("one answer can't do both jobs: 'I'm okay' to the safety question is safe only", () => {
    const p = rep(planDistressTurn("I'm okay", T, askLast, now, sh));
    expect(p.metadata.distress_safe).toBe(true);
    expect(p.metadata.distress_calm).toBeUndefined();
    expect(p.metadata.distress_post_crisis).toBeUndefined();
  });

  it("safe alone, or calm alone, keeps full self-harm mode", () => {
    expect(planDistressTurn("I'm safe", T, plainLast, now, sh)).toEqual({ type: "ai", mode: "self_harm", carry: { distress_safe: true } });
    expect(planDistressTurn("what should I eat?", T, plainLast, now, { ...sh, sessionFlags: { safe: true } })).toEqual({ type: "ai", mode: "self_harm", carry: { distress_safe: true } });
  });

  it("in post-crisis mode normal questions go to the AI, with a window that never restarts", () => {
    const p = planDistressTurn("what should I eat today?", T, pcLast, now, { ...sh, postCrisis: true });
    if (p?.type !== "ai" || p.mode !== "post_crisis") throw new Error("expected post_crisis");
    expect(p.metadata?.distress_window_end).toBe(new Date(new Date(shAt).getTime() + 6 * 3600_000).toISOString());
    // the marker on the last reply is enough on its own, until the window ends
    const marked = at(postCrisisMetadata("IL", shAt, now));
    expect(planDistressTurn("hi", T, marked, now)).toMatchObject({ type: "ai", mode: "post_crisis" });
    expect(planDistressTurn("hi", T, marked, new Date(now.getTime() + 6 * 3600_000))).toBeNull();
  });

  it("relapse: self-harm, ambiguous or acute language goes straight back to the full reply and resets confirmations", () => {
    const opts = { ...sh, postCrisis: true };
    for (const m of ["I want to die", "I can't do this anymore", "I'm having a panic attack"]) {
      const p = rep(planDistressTurn(m, T, pcLast, now, opts));
      expect(p.metadata.distress_mode).toBe("self_harm");
      expect(p.metadata.distress_safety_ask).toBe(true);
      expect(p.metadata.distress_safe).toBeUndefined();
      expect(p.metadata.distress_calm).toBeUndefined();
      expect(p.message).toContain("1201");
      expect(p.enteredKind).toBe("self_harm");
    }
  });

  it("acute language during full self-harm mode resets earlier confirmations", () => {
    expect(planDistressTurn("I can't breathe", T, plainLast, now, { ...sh, sessionFlags: { safe: true, calm: true } })).toEqual({ type: "ai", mode: "self_harm" });
  });

  it("'not safe' in self-harm mode gets the emergency number and does not count", () => {
    expect(rep(planDistressTurn("I'm not safe", T, askLast, now, sh)).message.startsWith("Please call Magen David Adom")).toBe(true);
  });

  it("the window ends 6 hours after the last self-harm message", () => {
    expect(planDistressTurn("what should I eat today?", T, at({}, 600), now, { selfHarmSessionActive: false })).toBeNull();
  });

  describe("quiet line", () => {
    it("is region mapped with a generic fallback", () => {
      expect(postCrisisSupportLine("IL")).toBe("ERAN 1201 is there anytime.");
      expect(postCrisisSupportLine("US")).toBe("988 is there anytime.");
      expect(postCrisisSupportLine("UK")).toBe("Samaritans 116 123 is there anytime.");
      expect(postCrisisSupportLine(null)).toBe("A crisis line in your area is there anytime.");
    });
  });

  describe("AI instruction and backup filter", () => {
    it("the AI instruction forbids attributing her mood to hormones or cycle, and allows factual answers", () => {
      const p = distressPromptBlock("post_crisis", "IL");
      expect(p).toMatch(/Don't attribute her mood or emotions to hormones or her cycle/);
      expect(p).toMatch(/factual cycle answers/);
      expect(p).toMatch(/No partner suggestions, no announcements/);
    });
    it("the backup filter removes only sentences linking HER mood or emotions to hormones or cycle", () => {
      const bad = "Thanks for telling me. Your anxiety is probably your luteal phase. Since you are on day 27, the drop in progesterone can make your nervous system more reactive. Be gentle with yourself.";
      const out = finalizeDistressReply(bad, "post_crisis");
      expect(out).toBe("Thanks for telling me. Be gentle with yourself.");
    });
    it("no hedged hormone sentence is added in post-crisis mode", () => {
      expect(finalizeDistressReply("Your mood is driven by your cycle.", "post_crisis")).toBe("");
    });
    // Realistic complete answers, with the "See more" divider, must come back byte for byte.
    const PHASE_ANSWER = "You're on day 22 of your cycle, which puts you in the luteal phase.\n\nProgesterone is usually higher in this phase, and your next period is expected in about 6 days.\n---\n### The Science\nAfter ovulation the corpus luteum makes progesterone. If there's no pregnancy, it breaks down and both progesterone and estrogen fall, which triggers your period.";
    const LUTEAL_ANSWER = "The luteal phase runs from ovulation until your next period, usually 12 to 14 days.\n\nProgesterone rises, then falls if there's no pregnancy. Body temperature stays slightly higher, and many people notice changes in appetite, sleep or bloating.\n\nSome people also notice mood changes before their period, which is what PMS describes.\n---\n### The Science\nThe corpus luteum releases progesterone and some estrogen. When it fades, the lining sheds.";
    it("'what phase am I in?' comes back complete", () => {
      expect(finalizeDistressReply(PHASE_ANSWER, "post_crisis")).toBe(PHASE_ANSWER);
      const plan = planDistressTurn("what phase am I in?", T, pcLast, now, { ...sh, postCrisis: true });
      expect(plan).toMatchObject({ type: "ai", mode: "post_crisis" });
    });
    it("'what happens in the luteal phase?' comes back complete", () => {
      expect(finalizeDistressReply(LUTEAL_ANSWER, "post_crisis")).toBe(LUTEAL_ANSWER);
      const plan = planDistressTurn("what happens in the luteal phase?", T, pcLast, now, { ...sh, postCrisis: true });
      expect(plan).toMatchObject({ type: "ai", mode: "post_crisis" });
    });
    it("other modes still drop the deep-dive section", () => {
      expect(finalizeDistressReply(PHASE_ANSWER, "acute")).not.toContain("The Science");
    });
    it("the post-crisis reply path in chat-ai keeps cycle context and the full answer", () => {
      const src = readFileSync("supabase/functions/chat-ai/index.ts", "utf8");
      const i = src.indexOf('if (distressAiMode === "post_crisis") {');
      expect(i).toBeGreaterThan(0);
      const branch = src.slice(i, src.indexOf("} else {", i));
      expect(branch).not.toMatch(/cycle_day|cycle_phase/);
      expect(branch).not.toContain("stripDeepDive");
      // the strict "emotional moment" rules (60 words, no physiology) are not forced on by post-crisis mode
      expect(src).toContain('distressAiMode !== "post_crisis"');
    });
  });
});

describe("factual cycle question right after acute distress (live bug)", () => {
  const T = "Asia/Hebron";
  // Exact sequence from the live test: panic → "I'm ok now" → "Yes, log it" → Undo → luteal-phase question.
  const QUESTION = "what happens in the luteal phase?";
  const BAD_REPLY = "This crash is what usually triggers those physical symptoms and mood spikes right before your period starts. It can make you feel more sensitive to stress on Day 27. Progesterone may be dropping around this point in a cycle, which can make some people more reactive.";
  const FULL_ANSWER = "The luteal phase is the second half of your cycle, from ovulation until your next period, usually 12 to 14 days.\n\nAfter ovulation progesterone rises, and if there is no pregnancy, progesterone and estrogen both fall. That fall is what triggers your period, and it is also why many people notice PMS symptoms like bloating, tender breasts or mood changes.\n\nBody temperature stays slightly higher in this phase.\n---\n### The Science\nThe corpus luteum releases progesterone and some estrogen. When it breaks down, the lining sheds.";

  function runSequence() {
    let now = new Date("2026-10-08T10:19:18Z");
    let last: { metadata: Record<string, unknown>; created_at: string } | null = null;
    const log: { msg: string; plan: ReturnType<typeof planDistressTurn> }[] = [];
    const send = (msg: string) => {
      const plan = planDistressTurn(msg, T, last, now);
      log.push({ msg, plan });
      if (plan?.type === "reply") {
        const metadata = { ...plan.metadata } as Record<string, unknown>;
        delete metadata.conversation_starters;
        if (plan.logSymptoms) metadata.distress_logged_ids = ["34c73b77-c8e5-4a45-af21-29141a0e2a8b"];
        last = { metadata, created_at: now.toISOString() };
      }
      now = new Date(now.getTime() + 45_000);
      return plan;
    };
    return { send, log, last: () => last, now: () => now };
  }

  it("the planner never sends the question to a distress rewrite, and no hedge or removal can apply", () => {
    const run = runSequence();
    expect(run.send("I'm having a panic attack")).toMatchObject({ type: "reply", metadata: { distress_mode: "acute" } });
    expect(run.send("im ok now")).toMatchObject({ type: "reply", metadata: { distress_post: true, distress_log_ask: true } });
    expect(run.send("Yes, log it")).toMatchObject({ type: "reply", message: "Logged for today." });
    // Undo only deletes the symptom log in the app; it sends no chat message, so the last reply is still "Logged for today."
    expect(run.last()?.metadata.distress_post).toBe(true);
    expect(run.send(QUESTION)).toBeNull();
  });

  it("any filter that did run would leave the reply byte for byte untouched", () => {
    for (const mode of ["post", "post_crisis"] as const) {
      expect(finalizeDistressReply(FULL_ANSWER, mode, QUESTION)).toBe(FULL_ANSWER);
    }
    // even if the post-distress mode were somehow applied, the rewrite refuses to touch a non-"why" message
    expect(finalizeDistressReply(FULL_ANSWER, "post", QUESTION)).not.toContain("may be dropping");
    expect(finalizeDistressReply(BAD_REPLY.replace(/ Progesterone may.*$/, ""), "post", QUESTION)).toBe(BAD_REPLY.replace(/ Progesterone may.*$/, ""));
  });

  it("the question counts as factual, and the emotional follow-up rule is switched off for it", () => {
    const last = { metadata: { distress_post: true, distress_logged_ids: ["x"] }, created_at: "2026-10-08T10:20:07Z" };
    expect(isFactualCycleQuestion(QUESTION)).toBe(true);
    expect(hasRecentDistress(last, new Date("2026-10-08T10:20:58Z"))).toBe(true);
    const src = readFileSync("supabase/functions/chat-ai/index.ts", "utf8");
    expect(src).toContain("const factualAfterDistress = isFactualCycleQuestion(userMessage) && hasRecentDistress(lastAssistantMsg as any);");
    expect(src).toContain("const emotionalFollowUp = !factualAfterDistress && isEmotionalFollowUp(");
    expect(src).toContain('if (distressAiMode === "post" && isFactualCycleQuestion(userMessage)) distressAiMode = null;');
    expect(src).toContain("finalizeDistressReply(finalAssistantMessage, distressAiMode, userMessage)");
  });

  it.each([
    "what phase am I in?", "what happens in the luteal phase?", "how long is the luteal phase?", "when is my next period?",
    "what is the follicular phase?", "explain ovulation", "what does progesterone do?", "which day of my cycle am I on?",
  ])("factual: %s", (m) => expect(isFactualCycleQuestion(m)).toBe(true));

  it.each([
    "why did this happen?", "why do I feel so anxious?", "is it my hormones?", "what caused that?", "I'm having a panic attack",
    "what's making my mood so bad in this phase?", "I want to die", "I can't breathe", "thanks", "what should I eat today?",
  ])("not factual: %s", (m) => expect(isFactualCycleQuestion(m)).toBe(false));

  it("the hedged 'may play a part' answer still works for a real why-question, and only for that", () => {
    const last = { metadata: { distress_post: true }, created_at: "2026-10-08T10:20:07Z" };
    const now = new Date("2026-10-08T10:21:00Z");
    for (const m of ["why did this happen?", "is it my hormones?", "what caused that?"]) {
      expect(planDistressTurn(m, T, last, now)).toEqual({ type: "ai", mode: "post" });
      expect(asksWhyItHappened(m)).toBe(true);
    }
    const raw = "Stress and poor sleep can do this. Since you are on day 27, the sharp drop in progesterone can also make your nervous system much more reactive.";
    expect(finalizeDistressReply(raw, "post", "why did this happen?")).toContain("Progesterone may be dropping around this point in a cycle");
    expect(finalizeDistressReply(raw, "post", "what happens in the luteal phase?")).toBe(raw);
  });

  it("hasRecentDistress ignores ordinary replies and old distress", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    expect(hasRecentDistress({ metadata: { cycle_day: 27 }, created_at: "2026-10-08T11:59:00Z" }, now)).toBe(false);
    expect(hasRecentDistress({ metadata: { distress_post: true }, created_at: "2026-10-08T05:00:00Z" }, now)).toBe(false);
    expect(hasRecentDistress({ metadata: { distress_post_crisis: true }, created_at: "2026-10-08T11:00:00Z" }, now)).toBe(true);
    expect(hasRecentDistress(null, now)).toBe(false);
  });
});
