## The bug

In `supabase/functions/generate-insight/index.ts`, the proactive on-open insight routes any non-`"cycling"` user into a single non-cycling prompt that hardcodes the stage as **Menopause**:

- Line 194: `if (userLifeStage !== "cycling")` → sends perimenopause down the non-cycling path.
- Line 565: `const stageLabel = lifeStage === "postpartum" ? "Postpartum" : "Menopause";`
- Line 568: `"${firstName} is navigating menopause. Estrogen and progesterone are declining..."`
- Line 593: `"For menopause: focus on adaptation..."` rule applied to perimenopause too.

That's why Claire (perimenopause) was told she's "navigating menopause."

The rest of the app already treats perimenopause as still-cycling (HomeTab, DailyBriefingHero, PlanTab, chat-ai system prompt all distinguish the two correctly). Only `generate-insight` collapses them.

## Fix

In `supabase/functions/generate-insight/index.ts`:

1. **Route perimenopause through the cycling insight path**, not the non-cycling one. Perimenopause users still have a cycle and `last_period_start`, so the cycling prompt (with phase/day context) is the right base.
   - Change the gate at line 194 from `userLifeStage !== "cycling"` to `userLifeStage !== "cycling" && userLifeStage !== "perimenopause"`.
   - In the cycling prompt builder, add a short perimenopause note when `lifeStage === "perimenopause"` so the AI acknowledges sharper/less predictable swings, hot flashes, sleep/mood shifts — mirroring the language already in `chat-ai/index.ts` lines 2120-2121. Explicit rule: **do not call her menopausal**.

2. **Harden the non-cycling builder** so even if a perimenopause user ever reaches it (e.g. missing `last_period_start`), the copy is correct:
   - `stageLabel`: `postpartum → "Postpartum"`, `perimenopause → "Perimenopause"`, else `"Menopause"`.
   - Add a `perimenopause` branch to `stageContext` that says she is **navigating perimenopause** (still cycling, pattern shifting) — not menopause.
   - Update the `RULES` block: separate guidance for perimenopause vs. menopause, with the explicit "perimenopause ≠ menopause" line.

3. **Audit pass** in the same file for any other `=== "menopause"` / `!== "cycling"` branch that should also recognize perimenopause (e.g. the stage-label string and any copy templates around lines 538-595). No other functions need changes — `chat-ai`, `chat-onboarding`, `generate-meal-plan`, and the frontend already handle perimenopause distinctly.

## Out of scope

- No schema or RLS changes.
- No UI changes (HomeTab/PlanTab/DailyBriefingHero already correct).
- Historical insight messages already saved with the wrong copy will not be rewritten; only new generations will be correct.
