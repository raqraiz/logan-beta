# Diagnosis: "Really really sad. Can't stop the bad thoughts" (Oct 8, ~23:25 Asia/Jerusalem)

Diagnostic notes only. No code changed. Awaiting founder OK before any fix.

## Short answer
Distress mode is merged, but it was never built to catch this message. Sadness and intrusive thoughts fall in the gap
between "acute" (panic and physical symptoms) and "self-harm" (suicide and self-injury wording). The message went
through the normal chat pipeline, which then added hormone explanations. Logging failed for a separate reason.

## Part 1: Distress mode
**a) Merged and live?** Merged to `main` (PRs #12 to #26, last on Oct 8 15:46 +03; `_shared/distress.ts` last changed in
4f60899). `chat-ai/index.ts` imports it (line ~22) and runs `planDistressTurn` before every other flow (~line 1393).
Whether the *deployed* function matches `main` cannot be confirmed from the repo (edge functions deploy via a Lovable
prompt). Check: the Lovable/Supabase deploy log for `chat-ai` after Oct 8 15:46. Replies 3 and 4 look like the normal
pipeline, which is what the code would produce either way, so they do not settle it.

**b) Detection.** Ran message 2 through `detectAcuteDistress`, `detectSelfHarm`, `detectSelfHarmAmbiguous` and
`planDistressTurn` (Asia/Jerusalem, no prior distress): all false, plan = null. Reasons:
- `ACUTE_PATTERNS` are panic / anxiety attack / can't breathe / can't calm down / chest pain / fainting / "losing it".
  Nothing for low mood, sadness, or intrusive thoughts. "Can't stop the bad thoughts" is not matched ("can't stop"
  only matches shaking, trembling, panicking, spiralling).
- Self-harm tiers need explicit words (die, kill myself, end it, can't go on ...). None present.
- The second net, `acuteFromSymptomNames` (~line 5343), only runs the *same acute patterns* over symptom names the
  extractor found, so it cannot catch what the patterns do not know. The extractor returned "sad"-type mood names at
  best, which are not acute patterns.
So the AI-instruction fallback (`distressPromptBlock`) never ran. The reply came from the normal prompt.

**c) Chips.** Generated at ~line 5261 by a second small model call (gemini-2.5-flash-lite) from the user message and
Logan's reply. Only in distress mode are they replaced by the fixed set (Breathe with me / I'm feeling calmer / Talk it
through; `applyDistressMeta`). Outside it, the prompt only tells the model to avoid cycle talk and be neutral *if*
`emotionalContextActive` is true. On message 4 ("Log it for me") it was false: see (g). The filter list only blocks
data-changing chips and medical red-flag chips, nothing about tone. "Wish it would hurry up" passed.

## Part 2: Logging
**d) Path.** There is no model tool or intent for logging. Logging is keyword based (~line 2885): symptom names matched
in *the current message only* (catalog + aliases + a small LLM extractor), then offered as a tap-to-log card. There is
also a backfill path for "log X on April 15", which also reads symptoms from the current message only.
- "I want to log" / "I want to log it" / "Log it for me" contain no symptom word. The code is deliberately written not to
  borrow symptoms from earlier messages, so nothing is detected, no card, and the model just chats.
- "Really really sad..." did have a mood term, but the card filter (~line 5373) removes emotion names (sad, mood,
  anxious ...) whenever `emotionalContextActive` is true. "sad" trips it, so no card.
**e)** Distress mode was not active, so logging was not suppressed by it. Logging is broken independently: any "log it"
without a named symptom does nothing, and mood-only reports never get a card.
**f)** No false success claim found in the reported replies. The no-write-no-claim guard exists at ~lines 5241 and 5393
(`hasLoggingClaim` / `stripUnbackedLoggingClaims`). Caveat: it only strips claims worded like logging; it does not
touch hormone claims.

## Part 3: Tone
**g)** Model improvisation, steered by the system prompt. No stored phase text says "hormones at their lowest" or "total
lack of hormonal support". Contributing prompt lines in `chat-ai/index.ts`:
- The standing "specific actions" examples (~line 5786) use a GOOD example that attributes a mood to hormones
  ("racing-thoughts thing at day 22? Progesterone dropping.").
- The emotional-moment override (~line 4895) still allows "one short line of validation" about the phase, so
  mentioning the phase is permitted, and nothing limits how it is worded or forbids causal claims.
- Message 3 ("I want to log it") hit `introducesNewTopic` (the word "log"), so `isEmotionalFollowUp` returned false, and
  the emotional override was off for messages 3 and 4. Those got the full phase-coaching prompt, "See more" and
  free chips. This is why the hormone framing got stronger on later turns.
- Late-luteal wording is not clamped. Only distress modes use `sanitizeHormoneClaims` / hedging.

## Proposed fix plan (small, separate tasks; none started)
1. **Detection.** Add a "low mood / intrusive thoughts" tier to distress detection ("so sad", "bad thoughts",
   "can't stop thinking", "pouring in", "hopeless", "can't take it"). Broad, false positives okay. Decide first whether
   it uses the acute mode or a new gentler "heavy mood" mode (no panic script, no breathing exercise).
2. **Chips.** In any emotional or distress turn, use a fixed safe chip set; add a tone filter on generated chips
   ("hurry up", "wish it", "get it over with").
3. **Emotional carry-over.** Don't let the word "log" break the emotional thread (fix `introducesNewTopic` for bare
   log requests, and keep the window 10 min).
4. **Logging.** "Log it" with no symptom: use the last 1 to 2 user messages to build the tap-to-log card. Allow mood
   entries (sad, low mood, intrusive thoughts) on the card in emotional turns instead of filtering them out. Never
   auto-write.
5. **Hormone framing.** Remove the "Progesterone dropping" example, ban causal "your mood is because of hormones /
   lowest / lack of support" wording in the system prompt, and run `sanitizeHormoneClaims` on all emotional turns.
6. **Tests.** Add the Oct 8 exchange as a regression test in `src/test/distress.test.ts`.
7. **Deploy.** After merge: Lovable prompt to deploy `chat-ai` (and check what is currently deployed).
