# Onboarding v2: Phase 0 inventory

Status: inventory only. No app code, schema or data was changed to produce this document.
Branch of record: `main` at `1cc9931` (8 Oct 2026).

## How to read this

- Sections **a to e** answer the five questions in the brief. Section **f** covers every extra flag. Section **g** lists the decisions only the founder can make. Section **h** has read-only checks to run against the live database before Phase 1.
- **Caveat: no live database access.** The schema below is read from `supabase/migrations/` (149 files), `drizzle/migrations/` (0000 to 0029) and the generated `src/integrations/supabase/types.ts`. A recent commit ("Sync visible-symptoms migration with live DB") shows the repo and the live database can drift. Anything marked **(verify)** should be confirmed with the queries in section h.
- Two migration folders feed one database. `supabase/migrations/` holds the original schema (participants, life stage, postpartum, feeding, loss, pregnancy, `has_uterus`, `is_breastfeeding`, `refresh_postpartum_state`, the `onboarded_profiles` view). `drizzle/migrations/` holds the newer Lovable-applied SQL (birth control method, `asked_at`, `watch_symptoms`, `cycle_anchor_type`, Together consent columns, symptom aliases, Together aggregates). `drizzle/schema.ts` is intentionally blank. Any new column must say which folder it goes in.
- File paths are relative to the repo root. Line numbers are for `main` at the commit above.

---

## a. Every step today

### a.1 Before the first question

Brand-new visitors see `TrialChat` (`src/components/chat/TrialChat.tsx`), then the sign-up form `InlineChatAuth` (`src/components/chat/InlineChatAuth.tsx`). `src/pages/Auth.tsx` is the admin-only login at `/logan-admin-access` and has no consent boxes.

Sign-up form, exact copy:

| Element | Copy |
|---|---|
| Name label / placeholder | "What should I call you?" / "Your name" |
| Email label / placeholder | "Email" / "you@example.com" |
| Password label | "Password" (min 6 characters) |
| Referral link | "Have a referral code?" then "Referral code (optional)", placeholder "e.g. 3NTUDWM" |
| Required consent checkbox | "I agree to Logan's **terms & privacy policy**, including consent to store and use my wellness data to personalize my experience." (link goes to `/privacy`) |
| Optional Together checkbox (unticked) | "Add my logs, without my name, to what women see in Together." |
| Submit button | "Start my journey" (disabled until the required box is ticked) |
| Switch links | "Already have an account? Sign in" / "New here? Create an account" / "Forgot password?" / "← Back to sign in" |
| Sign-in view | "Welcome back. Sign in to pick up where we left off." button "Continue chatting" |
| Forgot view | "No worries, enter your email and I'll send you a link to reset your password." button "Send reset link" |
| Errors | "Please enter a valid email"; "Password must be at least 6 characters"; "Please enter your name"; "Consent required: Please review and accept the terms to continue."; "Account exists: This email is already registered. Try signing in instead."; "Something went wrong" + the error message |
| Success | "Welcome to Logan"; a welcome email is sent by `send-welcome-email` |

On sign-up the form sends these values to Supabase Auth as user metadata: `full_name`, `consent_given: true`, `consent_given_at` (browser clock), `together_answered: true`, `together_consent` (the optional box), `together_consent_version: "together-v1"`, `timezone`, attribution fields, and an optional `manual_referral_code`.

Sign-in is email plus password. `useAuth` also exposes `signInWithMagicLink`, but the chat sign-up surface uses the password form.

### a.2 Welcome message

Sent by `chat-onboarding` action `init` (`supabase/functions/chat-onboarding/index.ts:377`). It only runs when the user has **zero** `chat_messages`.

> "Hey {first name}! I'm Logan — your cycle companion. Let me learn a few things about you so I can make this personal. It'll take about 2 minutes."

Stored with `message_type = 'onboarding'`, `metadata = { onboarding_step: -1, insight_type: "welcome" }`. About 600 ms later the first question is inserted.

### a.3 The question list and branch order

The question list is `ONBOARDING_QUESTIONS` (`chat-onboarding/index.ts:98`). Steps are skipped by `makeShouldSkip` (line 250) using life stage and two flags. The index of each key is its `onboarding_step`.

| # | key | Asked when |
|---|---|---|
| 0 | `age` | always |
| 1 | `life_stage` | always |
| 2 | `birth_date` | postpartum |
| 3 | `feeding` | postpartum |
| 4 | `cycle_return` | postpartum |
| 5 | `postpartum_bc` | postpartum |
| 6 | `due_date` | pregnant |
| 7 | `loss_date` | pregnancy_loss |
| 8 | `cycle_length` | cycling, perimenopause |
| 9 | `last_period` | cycling, perimenopause |
| 10 | `irregular_bc` | irregular |
| 11 | `has_uterus` | irregular **and** `on_hormonal_bc === false` |
| 12 | `irregular_last_period` | irregular **and** `has_uterus !== false` |
| 13 | `symptoms` | always |
| 14 | `anchor_symptom` | always |
| 15 | `topics` | always |
| 16 | `complete` | always (final message, not a question) |

Resulting paths:

| Stage picked | Questions, in order |
|---|---|
| Cycling | age, stage, cycle length, last period, symptoms, anchor, topics |
| Perimenopause | same as cycling |
| Irregular | age, stage, birth control yes/no, (uterus, only if "No"), last period (skipped if no uterus), symptoms, anchor, topics |
| Postpartum | age, stage, birth date, feeding, period back?, birth control, symptoms (extra postpartum group), anchor, topics (extra "Feeding & lactation" topic) |
| Pregnant | age, stage, due date, symptoms, anchor, topics |
| Pregnancy loss | age, stage, loss date (optional), symptoms, anchor, topics |
| Menopause | age, stage, symptoms, anchor, topics (no timing question, no period question) |

Main-branch users who are cycling or perimenopausal are **never asked about birth control** during onboarding. Birth control is only asked for irregular and postpartum.

### a.4 Exact copy per step

Each step's server message, then the on-screen control. Controls are in `src/pages/Chat.tsx` (line numbers given) and the picker components.

**0. Age** (text box, placeholder "Type your answer...")
- "First things first — how old are you?"
- No validation. The server takes the first digits it finds; if there are none it saves **30**.

**1. Life stage** (`Chat.tsx:2391`). Question: "Which best describes where you are right now?"

| Option label | Subtext | Stored value |
|---|---|---|
| I have a regular cycle | Currently menstruating | `cycling` |
| Irregular or on hormonal BC | PMOS (formerly PCOS), unpredictable cycles, or pill/IUD/implant | `irregular` |
| Pregnant | Currently pregnant | `pregnant` |
| Postpartum | Had a baby. Periods back or not, pick this. | `postpartum` |
| Pregnancy loss | Miscarriage or loss, whenever it happened | `pregnancy_loss` |
| Perimenopause | Still getting periods, but the pattern is shifting | `perimenopause` |
| Menopause | 12+ months without a period | `menopause` |

Any free-typed answer that matches none of the keywords is saved as `cycling`.

After the stage answer (every stage except pregnant, pregnancy loss, postpartum) Logan posts a hormone card with one of:
- menopause: "Your hormones are shifting into a new pattern. Understanding what's changing helps you navigate it:"
- perimenopause: "Perimenopause means your cycle is still happening, but the pattern is shifting. Logan will track your cycle and watch for the new signals coming in:"
- others: "Your body has two main hormones that rise and fall each month — they're behind most of what you feel:"

**2. Birth date** (postpartum; date picker, range 5 years ago to today; no Skip)
- "Your body is doing a lot right now — recovering, adjusting, rebuilding. Logan meets you where you actually are, not where a general cycle timeline says you should be.\n\nWhen was your baby born? I'll use it to track your recovery timeline."
- Echo: "Birth date: {date}"

**3. Feeding** (postpartum). "How are you feeding right now?"

| Label | Subtext | Value |
|---|---|---|
| Breastfeeding | Exclusively or mostly | `breastfeeding` |
| Combination | Breast and formula | `combination` |
| Formula / not breastfeeding | (none) | `formula` |
| Weaned | Recently or fully stopped | `weaned` |

Echo: "Feeding: {label}".

**4. Period back?** (postpartum). "Has your period come back yet?"

| Label | Subtext | Value |
|---|---|---|
| Not yet | No period since birth | `not_yet` |
| Yes, and it's regular | (none) | `regular` |
| Yes, but it's irregular | Normal while hormones rebuild | `irregular` |
| Not sure | Some bleeding, hard to tell | `not_sure` |

Echo: "Cycle status: {label}".

**5. Birth control, postpartum.** "Are you using any birth control right now?"

| Label | Subtext | Value |
|---|---|---|
| None | (none) | `none` |
| Hormonal | Mini-pill, hormonal IUD, implant, injection | `hormonal` |
| Non-hormonal | Copper IUD, condoms, other | `non_hormonal` |
| Prefer not to say | Logan will keep it general | `prefer_not_to_say` |

Picking Hormonal or Non-hormonal opens a second prompt, "Which kind?" (`Chat.tsx:2418`), with chips from `src/lib/bcMethod.ts` plus "Skip". Hormonal chips: Pill with a monthly break; Pill every day, no break; Mini pill; Hormonal IUD (like Mirena or Kyleena); Implant; Shot; Ring or patch; Something else; Not sure. Non-hormonal chips: Copper IUD (non-hormonal); Something else; Not sure. Echo: "Birth control: {label}" or "Birth control: {label} · {kind}".

**6. Due date** (pregnant; date picker from today to today + 42 weeks)
- "When is your due date? Even a rough estimate is fine — I'll use it to track your pregnancy week and trimester. If you don't know your due date, share how far along you are and I'll work with that."
- The typed-date box accepts relative phrases like "in 20 weeks". The picker itself has no "I don't know" button. Echo: "Due date: {date}".

**7. Loss date** (pregnancy loss; date picker 40 years back to today)
- "When did it happen? Pick the date, or skip if you'd rather not say."
- Button "Skip" (echo "Skipped"); skipping saves nothing.

**8. Cycle length** (cycling, perimenopause; text box)
- "How many days is your cycle? (From the start of one period to the start of the next.)\n\nMost people are somewhere between 24 and 35 days. If your cycle is irregular or you're not sure, tap "I'm not sure" below."
- Link "I'm not sure" opens: **"Not sure about your cycle length?"** / "Your cycle length is the number of days from the start of one period to the start of the next. Most cycles are between 24-35 days. If you've never tracked it, that's totally fine!" / button "Use 28 days (average)".
- No range check. If no digits are found it saves **28**.

**9. Last period** (cycling, perimenopause; date picker, up to 5 years back)
- "When did your last period start? Even a rough guess works — you can update it later."
- "I'm not sure" opens **"Can't remember exactly?"** / "Try to think about your last period, even a rough guess helps Logan get started. You can always update this later as you track." / button "It was about 2 weeks ago". That button **saves a real date: today minus 14 days.**
- After this answer Logan posts a day-and-phase message ("You're on **day N** — ...") with the cycle ring, then a symptom explainer: "Most of what you feel follows a pattern tied to your cycle. Here's what that looks like:". The phase lines are `chat-onboarding/index.ts:726 to 729`.

**10. Birth control, irregular** (bc picker). "Are you on hormonal birth control right now? (Pill, mini-pill, hormonal IUD, implant, ring, or patch.)"

| Label | Subtext | Value |
|---|---|---|
| Yes | Pill, mini-pill, hormonal IUD, implant, ring, or patch | `bc_yes` (then the "Which kind?" chips) |
| No | Not on hormonal contraception | `bc_no` |
| Prefer not to say | Logan will keep it general | `bc_unknown` |

**11. Uterus** (irregular and answered "No" above). "Uterus removed, ovaries intact?\n\nIf your uterus was removed but your ovaries are still there, you still cycle hormonally — you just won't bleed. Logan will stop asking you for period dates."

| Label | Subtext | Value |
|---|---|---|
| Yes | Uterus removed, ovaries still there, no periods, but your hormones still cycle | `uterus_removed_yes` (saves `has_uterus = false`) |
| No | My uterus is intact | `uterus_removed_no` (`true`) |
| Prefer not to say | Logan won't assume either way | `uterus_prefer_not` (`NULL`) |

**12. Last period, irregular.** "Do you know roughly when your last period started? (No worries if not — Logan works without it.)" Date picker plus "I'm not sure", which opens **"No worries, you can skip this"** / "Logan works without a last period date. If you remember later, you can add it anytime in settings." / button "Skip this, I'm not sure". Skipping saves nothing.

**13. Symptoms** (`SymptomPicker.tsx`)
- "Now let's talk about what you feel most often, not just right now. Pick anything that sounds familiar."
- Helper text "Select all that apply"; group headings and chips:
  - **EMOTIONAL & COGNITIVE:** Rage spikes, Anxiety spikes, Short fuse, Sudden dread, Feeling overwhelmed, Low stress tolerance, Irritability, Brain fog, Mood swings, Insomnia or poor sleep.
  - **PHYSICAL:** Energy crashes, Wired but tired, Full body inflammation, Bloating, Breast tenderness, Acne breakouts, Cramps, Nausea, Dizziness, Ringing in ears, Muffled hearing, Migraines, Deep fatigue, Back pain, Digestive issues, Cravings, Smell sensitivity, Knee pain.
  - **IS IT JUST ME?:** Random shame spiral, One stinky armpit, Wanting space from people, Sudden urge to delete your whole life online.
  - **POSTPARTUM-SPECIFIC** (postpartum only): Night sweats, Hair shedding, Healing/incision pain, Engorgement or feeding pain, Postpartum rage, Intrusive thoughts, Touched out.
- "Not on the list?" text area, placeholder "Add anything else, like symptoms we missed or patterns you've noticed..."; button "Continue"; counter "{n} symptom(s) selected".
- The echo bubble reads "Selected: a, b, c". Logan then replies with a stage-specific validation message (`chat-onboarding/index.ts:777 to 811`) and a card "Now let's pick your anchor symptom:".

**14. Anchor symptom** (`AnchorPicker.tsx`)
- "Which one disrupts your life the most? This becomes your anchor, the signal Logan watches most closely."
- Helper text "Choose the one that affects your life the most"; chips are the symptoms she just selected, plus "Other" which opens a box with placeholder "Describe your main symptom..."; button "Continue". Echo: "Anchor symptom: {name}".

**15. Focus areas** (`TopicPicker.tsx`). "Last one: what areas do you want Logan to focus on? Pick as many as you like."

| id | Label | Subtext |
|---|---|---|
| diet | Diet & nutrition | What to eat and when |
| exercise | Exercise & movement | Workouts that match your energy |
| sleep | Sleep & recovery | Rest strategies by phase (swapped to "Rest strategies for right now" / "...for each trimester" / "...for this stage" for loss, postpartum, pregnant, menopause) |
| mood | Mood & emotions | Navigating emotional shifts |
| energy | Energy & productivity | When to push vs. protect |
| skin | Skin & body | Breakouts, bloating, inflammation |
| feeding | Feeding & lactation | Fuel, supply, and recovery while feeding (postpartum only) |

Helper "Pick as many as you like"; button "Continue", or "All of the above" if nothing is ticked (which saves every id). Echo: "Focus areas: a, b".

**16. Complete.** "You're all set! Logan now knows your stage, your signals, and what matters to you. From here, everything gets personal." This message carries `onboarding_complete: true`. Then Logan posts a first personal insight (templates at `chat-onboarding/index.ts:893 to 959`) and a final note starting "One quick housekeeping note 💚 — I just sent a welcome email to the address you signed up with...".

### a.5 Chrome around the steps (`Chat.tsx`)

- Progress bar: "Step {n} of {total}" + "/ {label}" + "~{m} min left" or "All done" (`OnboardingProgress.tsx`). Branch counts are exact for postpartum and pregnancy loss only. The general path counter is index-driven with `totalSteps = 5` and six labels (Age, Cycle length, Last period, Symptoms, Anchor symptom, Focus areas), so the labels do not line up with the real steps.
- "Back" button (left of the bar, shown after step 0) calls `go_back`.
- Text box placeholder "Type your answer..."; footer "Answer Logan's questions to personalize your experience".
- Error banner: "Something went wrong, try again" + button "Retry". Requests time out after 20 seconds.
- Post-onboarding "Choose your Focus Areas" prompt (see section d): "Pick the topics you want Logan to focus on, diet, exercise, sleep, and more."; success toast "Focus areas saved!" / "Your insights will now be tailored to these topics."

### a.6 Post-onboarding walkthrough (`src/components/chat/CoachMarkTour.tsx`)

Opens 400 ms after the last `respond` returns `onboardingComplete`. It is held in React state only, so it is **not stored anywhere** and never reappears. Existing users never see it, because it is triggered by the response of the final step, not by a stored flag.

- Step 1, spotlights the You tab: "Quick tour, tap through.\n\nThe You tab is your daily check-in, log symptoms, meals, and weight, and see what to expect today."
- Step 2, spotlights the Logan tab: "Logan is right here, anytime something feels off, ask me. No 3am googling."
- Step 3, spotlights the Together tab: "Together shows what women like you are feeling, without sharing who you are."
- Counter "{n} of 3", buttons "Next" / "Finish", a close control labelled "Skip tour".
- Final dialog: "You told me {anchor} is the one to watch. Want to log today's now, so I can start finding your pattern?" (or "Want to log how you're feeling today, so I can start finding your pattern?" with no anchor). Buttons: "Log it now" (opens Together log mode with the anchor preselected), "Take me to You", "Later".

### a.7 Settings and other places that edit the same values

| Value | Where it can be edited | Notes |
|---|---|---|
| Life stage, birth date, loss date, due date, LMP, breastfeeding, birth control yes/no, birth control method, uterus, phase lengths, timezone | `src/components/chat/SettingsDialog.tsx` (Save at line 139). Writes through `updateParticipant` (`src/lib/participantWrite.ts`) | Settings title "Settings", intro "Update your life stage. Logan will adapt all tabs and guidance to match." |
| Age, anchor symptom, goals, typical symptoms, additional notes | `src/components/you/YourDataPage.tsx` (Facts tab, per-fact edit and "forget") | Age must be 18 to 120 here. "Delete all memory" clears age, anchor, goals, typical symptoms, notes, birth control method, `on_hormonal_bc` and `watch_symptoms` (line 20) |
| Watched (★) symptoms | `WatchChooser.tsx` ("What should I watch for you?", pick up to 3), `YourPatterns.tsx`, `TogetherTab.tsx` (un-star) | Writes `participants.watch_symptoms` |
| Together consent | `PrivacySection.tsx` ("Count me in Together" switch, leave confirmation "Leave Together? Your logs will stop counting from today."), `TogetherTab.tsx` Count me in sheet, `TogetherAskCard.tsx` one-time chat ask | Writes `profiles.together_consent*` |
| Last period start | Plan tab, period check-in chips, and `chat-ai` ("Noted — logging **Day 1**...") | Not in Settings |
| Life stage by chatting | `chat-ai` life-stage detectors (`chat-ai/index.ts` around 3034 to 3480) switch stage after "Yes" and a verified write | |
| Everything | Admin `ProfilesTab.tsx` | Admin only |

Settings does **not** edit: age, feeding status, cycle-return status, postpartum birth control status, symptoms, goals, or consent boxes.

---

## b. What each step saves

Writer for every onboarding step is `chat-onboarding` using the service role. It updates `participants` by id. The participant row is found by **email** (`.eq("email", user.email).single()`, line 340), but every client read and RLS rule uses `user_id`.

If no participant row exists, it is created on the **first answer** (the age step) with `consent_given = true`, `consent_given_at = now()`, `preferred_channel = 'web'`, `whatsapp_number = email`, `user_id` set explicitly. If that insert fails the error is only logged (line 666) and onboarding carries on.

### b.1 Save map

| Item | Step | Table.column | Value |
|---|---|---|---|
| **Consent (health data)** | sign-up form | `auth.users.raw_user_meta_data`: `consent_given`, `consent_given_at` | `true`, browser ISO time. No version |
| | first onboarding answer | `participants.consent_given`, `participants.consent_given_at` | hard-coded `true`, server time when the row is created. Not the sign-up time. Not versioned |
| **Consent (Together)** | sign-up form | `auth.users.raw_user_meta_data`: `together_answered`, `together_consent`, `together_consent_version` | `true`, box value, `"together-v1"` |
| | first chat load after sign-in (`Chat.tsx:1499`) | `profiles.together_consent`, `together_consent_at`, `together_consent_version`, `together_consent_shown_at` | if ticked: `true`, now, `"together-v1"`; always sets `shown_at` so she is never asked again. If unticked only `shown_at` is set |
| **Life stage** | 1 | `participants.life_stage` | one of the 7 values (CHECK `life_stage_check`; default `cycling`) |
| | any free-text answer | `participants.life_stage` → `irregular`, `on_hormonal_bc` → `true`, `last_period_start` → `NULL` | cross-cutting detector (`bcDetection.ts`), see f.10 |
| **Due date** | 6 | `participants.due_date` | picked date |
| **Trimester** | not stored | computed from `due_date` / `pregnancy_lmp` in `together_stage()` and client code | |
| **Pregnancy LMP** | not asked | `participants.pregnancy_lmp` | stays `NULL` (Settings can set it) |
| **Birth date** | 2 | `participants.postpartum_start_date` | picked date |
| **Weeks since birth** | not stored | computed from `postpartum_start_date` (`src/lib/postpartumTimeline.ts`, `supabase/functions/_shared/postpartumTimeline.ts`) | |
| **cycle_return_status** | 4 | `participants.cycle_return_status` | `not_yet / regular / irregular / not_sure` |
| **Feeding** | 3 | `participants.feeding_status` and `participants.is_breastfeeding` | status string; `is_breastfeeding = true` for breastfeeding or combination, `false` for formula or weaned |
| **Loss date** | 7 | `participants.loss_date` | picked date; skip saves nothing |
| **Menopause timing** | not asked | none | nowhere to store it today |
| **Hormonal yes/no** | 10 (irregular) | `participants.on_hormonal_bc` | `true / false / NULL` |
| | 5 (postpartum) | `participants.birth_control_status` | `none / hormonal / non_hormonal / prefer_not_to_say` (**`on_hormonal_bc` is not touched**) |
| **birth_control_method** | "Which kind?" chip | `participants.birth_control_method` | method code, or `NULL` for Skip. Only written with a "yes" / "hormonal" / "non_hormonal" answer. A yes with no chip **overwrites any existing method with `NULL`** |
| **birth_control_method_asked_at** | never written by onboarding | `participants.birth_control_method_asked_at` | only `chat-ai` sets it (`index.ts:5355`) when Logan asks "which kind" in chat |
| **Uterus** | 11 | `participants.has_uterus` | `false` = removed (ovaries intact), `true`, `NULL` |
| **Cycle length** | 8 | `participants.cycle_length_days` | number, "not sure" saves 28 (column default is also 28) |
| **Last period** | 9 / 12 | `participants.last_period_start` | date. `cycle_anchor_type` is **not set** (relies on column default `bleed`), against the AGENTS.md rule that every write sets it |
| **Symptoms** | 13 | `participants.typical_symptoms` (text[]) | the tapped chip names, exactly as written in the picker |
| **Anchor symptom** | 14 | `participants.anchor_symptom` | chip name or the "Other" text |
| **Goals** | 15 | `participants.goals` (text[]) | topic ids (`diet`, `exercise`, ...) |
| **Age** | 0 | `participants.age` | integer, default **30** if no digits |
| **Completion** | 16 | `chat_messages.metadata.onboarding_complete = true` | see section d |
| Timezone | not asked | `participants.timezone` | column default `'Asia/Jerusalem'` until `Chat.tsx fetchLifeStage` silently replaces it with the phone's timezone after completion. The sign-up metadata `timezone` is not copied |

### b.2 Saved in two places, or only in chat

- **Consent** is in auth metadata, `participants.consent_given*` and (Together) `profiles.together_consent*`. The health-data consent has **no queryable versioned home**; `participants.consent_given_at` is the server time of the first answer.
- **Feeding** is in `feeding_status` and `is_breastfeeding`. Settings only edits `is_breastfeeding`, so the two can disagree later. `chat-ai` also checks `feeding_status === "mixed"` (`index.ts:3941`) but onboarding writes `"combination"`.
- **Postpartum birth control** is in `birth_control_status` (onboarding) while the rest of the app reads `on_hormonal_bc` and `birth_control_method` (Settings, chat). `chat-ai` (line 5749) and the stage metrics (`src/lib/metrics/lifeStage.ts`) read both.
- **Anchor vs watch list.** `anchor_symptom` is set by onboarding; `watch_symptoms` is **never** set by onboarding. Readers fall back from watch list to anchor (`YourPatterns.tsx:91`).
- **Only in `chat_messages` (not parsed into a column):**
  - The "Not on the list?" symptom free text. It is appended to the echo message as "Selected symptoms: ... Additional notes: ..." and then discarded by the server.
  - Everything typed into the age and cycle-length boxes beyond the first number.
  - The chosen BC chip labels and the date echoes (display only).
- `profiles.full_name` and `participants.full_name` both hold her name.

---

## c. What reads each value

"Cycle ring" below means `LoganTodaySection.tsx` (`TodayRing`) plus `ChatCycleCircle.tsx`.

| Value | Cycle predictions and phase ring | Together cohorts | Together › Mine / ★ | Logan chat context (`chat-ai`) | Today tips | Partner features |
|---|---|---|---|---|---|---|
| `life_stage` | `isPhaseTrackingOn()` is true only for `cycling` and `perimenopause` (`src/lib/cyclePhase.ts`, `supabase/functions/_shared/cyclePhase.ts`). Used by `PlanTab.tsx`, `DailyBriefingHero.tsx`, `ChatCycleCircle.tsx`, `generate-insight`, `generate-widget`. `TodayRing` itself only tracks `cycling` (`LoganTodaySection.tsx:50`) | `together_stage()` (`drizzle/migrations/0022_migration.sql:20`): `cycling` and `irregular` → `cycle`; pregnant → trimester bucket; postpartum → age bucket; `perimenopause`, `menopause`, `pregnancy_loss` own buckets | none | stage text block `chat-ai/index.ts:5698 to 5760` | `generate-daily-insights/index.ts:212 to 229` picks stage context | same daily-insights function writes partner tip lists |
| `last_period_start`, `cycle_length_days` | `src/lib/cycleCalculations.ts`, `src/lib/nextPeriod.ts`, `supabase/functions/_shared/cycleCalculations.ts`, `PlanTab.tsx:342`, `Chat.tsx:859` | `cycle_day` cohorts are computed from them, only for stage `cycle` (`0025_together_aggregates_cohort_women.sql`) | cycle-aware pattern windows (`TogetherTab.tsx`, `src/lib/patternCycles.ts`) | day/phase in context | phase wording | `_shared/partnerHeadsup.ts:105`, `src/lib/partnerHeadsup.ts` read `last_period_start` and `cycle_history` |
| `postpartum_start_date`, `postpartum_active` | postpartum timeline in `LoganTodaySection.tsx:139`, `Chat.tsx:865` (postpartum with no birth date is treated as cycling) | postpartum age bucket | none | postpartum phase guidance `chat-ai/index.ts:5730 to 5760` | `generate-daily-insights` | none directly |
| `due_date`, `pregnancy_lmp` | pregnancy week UI (`HomeTab.tsx`, `YourDataPage` props) | trimester buckets | none | pregnancy context | pregnant stage context | none directly |
| `loss_date` | gentle recovery count (`chat-ai/index.ts:4713`, guarded `if (lossDate)`) | none (stage only) | none | recovery context | stage context | none |
| `is_breastfeeding`, `feeding_status`, `cycle_return_status` | none | none | none | `ppKnownFacts` (`chat-ai/index.ts:5745 to 5752`); "already tracked as postpartum" check (line 3939) | none | none; **`is_breastfeeding` is read by `refresh_postpartum_state()`** (below) |
| `on_hormonal_bc`, `birth_control_method`, `birth_control_status` | never turn phase tracking off (comment in `cyclePhase.ts`) | none | none | `buildBcMethodRule()` and `bcFramingSummary()` (`supabase/functions/_shared/bcMethod.ts`); Settings sync rule `hormonalAnswerForMethod` | `generate-daily-insights/index.ts:175 to 180` | none |
| `has_uterus` | `chat-ai/index.ts:1337 to 1341` stops asking for period dates | none | none | same | none | none |
| `typical_symptoms`, `anchor_symptom` | none | none | `anchor_symptom` is the fallback for the watch list when `watch_symptoms` is empty (`YourPatterns.tsx:91`) | `chat-ai/index.ts:5880 to 5881`; `generate-insight/index.ts:503 to 505, 641 to 643` | anchor passed to `generate-daily-insights` | none |
| `watch_symptoms` | none | none | ★ bubbles, WatchChooser, un-star (`TogetherTab.tsx:86,167`, `WatchChooser.tsx`, `YourPatterns.tsx`) | `chat-ai/index.ts:5880`, `generate-insight/index.ts:568,746` | `generate-daily-insights/index.ts:178 to 180` | none |
| `goals` | none | none | none | `chat-ai/index.ts:5698, 5783`; `generate-insight` | none | none |
| `age` | none | none | none | `chat-ai/index.ts:5697, 5782` (`|| null`) | none | none |
| `profiles.together_consent` | none | decides who is counted in `refresh_together_aggregates()` and who can post tips (`together-tip-submit/index.ts:128`) | decides whether her logs count; viewing needs no consent | none | none | none |

Notes:
- **Together › Mine only lists symptoms she has logged.** The bubbles are built from her last 12 months of `symptom_logs` (`TogetherTab.tsx:200 to 205`). A ★ symptom with zero logs is not drawn. Onboarding picks are never written as logs, and AGENTS.md says the app must not log without her tap.
- **`refresh_postpartum_state(uuid)`** (`supabase/migrations/20260911060342_...sql`, execute revoked from app roles in `20260911060357_...sql` and `20261007150000_pre_launch_security_hardening.sql`). It reads `life_stage`, `postpartum_start_date`, `is_breastfeeding`, and the last three `cycle_history` rows through `evaluate_postpartum_regularity()`. It writes `postpartum_regular_periods_confirmed`, and when `life_stage = 'postpartum'` **and** `postpartum_start_date` is set **and** `COALESCE(is_breastfeeding, false) = false` **and** the last three cycles are each 21 to 35 days and within 7 days of each other, it flips `life_stage` to `cycling` and `postpartum_active` to `false`. It is only triggered by changes to `cycle_history` and by `UPDATE OF is_breastfeeding`. It does not fire when a participant is created or when the birth date changes.
- "Today tips" here means the daily headline and Do / Don't lists in `daily_home_insights` (`generate-daily-insights`, `src/hooks/useDailyHomeInsights.ts`, `src/lib/neutralTips.ts`). The Together "What helped" tips use `life_stage`, `last_period_start`, `cycle_length_days`, `due_date`, `pregnancy_lmp`, `postpartum_start_date` for their stage label (`together-tip-submit/index.ts:15 to 21, 134`; `src/lib/tips.ts:77`).
- Partner features have no dependency on onboarding answers beyond `last_period_start`, `cycle_history` and the daily-insights stage context. Partner heads-ups are gated by `feature_flags.partner_headsup`.

---

## d. How the app decides onboarding is finished

### d.1 The marker

**Confirmed.** A user is onboarded when she has any `chat_messages` row whose `metadata->>'onboarding_complete' = 'true'`.

- Written by `chat-onboarding/index.ts:855` on the last "You're all set!" message. Every earlier question message is written with `onboarding_complete: false`.
- The `public.onboarded_profiles` view (`supabase/migrations/20260901023036_a30ab773-a1c6-40cb-b680-c7563ff6a54f.sql`) is `profiles` rows with such a message. It is `security_invoker`, granted to `authenticated` and `service_role`.
- Supporting objects: partial index `idx_chat_messages_onboarding_complete`, and `count_onboarded_users()` (security definer, admin only) in `20260901114253_d1ad4357-...sql`.
- The marker means "she answered the last question and the server posted the closing message". It does **not** check that `participants` saved correctly (see d.4).

### d.2 Everything that depends on it

| Surface | File | Effect |
|---|---|---|
| Admin "User" definition | `src/lib/onboardedUsers.ts`, `src/lib/metrics/definitions.ts` | every admin count of "users" |
| Admin Overview, Users leaderboard, Attribution, Growth tracker, Investor summary, Profiles | `OverviewTab.tsx`, `UsersLeaderboard.tsx`, `AttributionTab.tsx`, `GrowthTrackerTab.tsx`, `InvestorSummaryPanel.tsx`, `ProfilesTab.tsx` | read `onboarded_profiles` |
| Engagement averages | `src/lib/admin/engagementMetrics.ts` | denominator = cumulative onboarded users |
| Active-user eligibility, life-stage engagement table, W4 retention | `src/lib/metrics/lifeStage.ts:169` | the first completion timestamp is each user's "onboarded at" |
| Total-user count | `count_onboarded_users()` RPC | |
| Proactive insight generation | `supabase/functions/generate-insight/index.ts:79` | returns `skipped: onboarding_incomplete` when the marker is missing |
| Broadcast audience filter | `supabase/functions/send-broadcast/index.ts:137`, `NotificationsTab.tsx:19,504 to 532` | "Onboarded only" / "Incomplete onboarding only" |
| Credit check | `supabase/functions/chat-ai/index.ts:1222` | `CREDITS_ENABLED = false` today, so no effect |
| In-app gating | `src/pages/Chat.tsx:389 to 431` | forces the Ask tab, hides the tab bar, hides Today, Together ask card, topic prompt, feedback prompt, installs prompts; triggers on-open insight, credits and life-stage fetch |
| Home placeholder | `src/components/tabs/HomeTab.tsx:546` | "Complete your onboarding in the Ask tab to see your cycle overview here." |

### d.3 How the client decides

`refreshMessages` (`Chat.tsx:350`) loads the latest 100 messages and computes:
- `hasOnboardingMessages` = any message with `message_type = 'onboarding'` or `metadata.onboarding_step` defined
- `isOnboardingComplete` = any loaded message with `metadata.onboarding_complete === true`
- `inferredComplete` = no onboarding messages in the window **and** at least one message
- `isOnboarding = hasOnboardingMessages && !isOnboardingComplete`
- A user with **zero** messages gets `chat-onboarding init`.

### d.4 What protects users who already finished, and what could re-onboard them

Protections:
- `init` is a no-op when any `chat_messages` row exists (`index.ts:378`).
- `respond` for a finished user returns `onboardingComplete: true` without changing anything (the last onboarding message is the final step).
- The client treats "has messages but none are onboarding messages" as complete.
- Because the completion message is newer than all question messages, any 100-message window that contains a question also contains the completion message.

Paths that could send a finished user back through onboarding:

1. **`go_back` has no server-side guard** (`index.ts:980`). Any signed-in call with `targetStep` below 16 deletes **all** of her `chat_messages` from the first matching onboarding message onwards, including the completion marker and her whole history. The next load then shows onboarding at that step. The button only appears in the UI during onboarding, so this needs a direct API call, but there is no check on the server.
2. **Zero messages.** Anything that leaves her with no `chat_messages` (admin `delete-user`, `delete-account`, or manual deletion) starts `init` again. Those two functions also delete the participant, so that is a fresh account.
3. **Accounts from before the marker existed (verify).** A legacy user with `message_type = 'onboarding'` rows but no `onboarding_complete` true, whose recent 100 messages still include an onboarding row, would be shown the onboarding UI and be excluded from `onboarded_profiles`. Run query h.2.
4. **Users mid-flow when v2 ships.** Their open question is stored by `question_key`; if v2 renames, reorders or removes keys the lookup falls back to the raw index (`index.ts:497 to 498`) and lands on the wrong question.
5. **Not re-onboarding but re-asking:** `check_topics` / `set_topics` re-show the "Choose your Focus Areas" prompt to **finished users whose `goals` is empty** (`Chat.tsx:429`, `chat-onboarding/index.ts:356`). `TogetherAskCard` asks the Together question once to anyone with no `together_consent_shown_at`.

Also worth knowing: `go_back` only deletes chat rows. It does **not** undo values already written to `participants` (for example a feeding answer stays after she goes back to the stage question).

---

## e. Mapping the new flow

Legend: **E** = existing field, **N** = new field needed, **D** = dropped from the new flow.

### e.1 Answer-by-answer

| New answer | Maps to | Notes |
|---|---|---|
| Welcome, sign-in | existing Supabase Auth, `profiles` via `ensureProfile` | **E**. Key everything on `user_id`, not email (see f.14) |
| Health-data consent (required) | **N** `profiles.health_consent_at`, `profiles.health_consent_version` | no existing versioned field (see e.2) |
| Together consent (optional, unticked) | **E** `profiles.together_consent`, `together_consent_at`, `together_consent_version` (`"together-v1"`), `together_consent_shown_at` | the new label is word-for-word the existing checkbox, so the existing version string stays valid |
| Stage: cycle | **E** `participants.life_stage = 'cycling'` | |
| Stage: pregnant + due date | **E** `life_stage = 'pregnant'`, `due_date` | trimester is computed |
| Stage: had a baby + birth date | **E** `life_stage = 'postpartum'`, `postpartum_start_date` | breastfeeding not asked, see f.2 |
| Stage: pregnancy loss | **E** `life_stage = 'pregnancy_loss'`, `loss_date = NULL` | see f.3 |
| Stage: through menopause | **E** `life_stage = 'menopause'` | |
| Menopause: how long since last period | **N** `participants.menopause_timing` | see e.2 |
| Stage: not sure | **E** `life_stage = 'cycling'` (the column default) | no new stage value; see f.11 |
| Birth control (single choice) | **E** `on_hormonal_bc`, `birth_control_method`, `birth_control_method_asked_at`; postpartum also `birth_control_status` | value-by-value table in f.1 |
| Cycle trait: little or no bleeding | **N** `participants.cycle_traits` | nothing stores this. Closest is `cycle_anchor_type = 'marker'`, but that only describes what `last_period_start` means |
| Cycle trait: irregular | **E** `life_stage = 'irregular'` (founder decision, see g.2) | alternatively `cycle_regularity`, an old unused text column |
| Cycle trait: perimenopause signs | **E** `life_stage = 'perimenopause'` (founder decision, see g.2) | |
| Cycle trait: had a baby recently | **E** `postpartum_active = true` + `postpartum_start_date` (this is the existing "cycling again after a baby" state) | needs a birth date. See f.4 |
| Condition: PCOS | **N** `participants.conditions` | |
| Condition: endometriosis, thyroid, fibroids | **N** `participants.conditions` | no field today; AI prompts say "never state or imply a condition" (`chat-ai/index.ts:5637`) |
| Condition: no uterus | **E** `has_uterus = false` for the uterus fact, plus `conditions` value `no_uterus` only if the founder wants it kept separately | see f.5 |
| Free text on stage, birth control, traits, conditions | **E** `user_memory_notes` (`source = 'onboarding'`, note ≤ 300 characters) | the Facts page already labels `source = 'onboarding'` as "You told me when we met" (`MemorySection.tsx:52`). Caveat in f.12 |
| Last period date | **E** `last_period_start` + explicit `cycle_anchor_type` | |
| "Not sure" / "No periods now" | **E** leave `last_period_start = NULL` (no invented date). "No periods now" matches the existing no-real-period route (`life_stage = 'irregular'`, date `NULL`) | v1 saves "2 weeks ago" for not sure; v2 should not |
| Harder and good symptoms | **E** `typical_symptoms`, stored through `canonicalSymptom()` | see f.8 |
| "Bothers you most" (one) | **E** `anchor_symptom` **and** `watch_symptoms[0]` | written to both on purpose |
| "Want more of" (one) | **E** `watch_symptoms[1]` | the array holds up to 3 and already allows good-day states (column comment, `WatchChooser.tsx` `GOOD_DAYS`) |
| What would help (3 options) | **N** `participants.help_goals` | `goals` holds focus topics, see e.2 |
| First-run tour | **E** `CoachMarkTour.tsx`, same trigger (end of onboarding) | no stored flag needed, see f.13 |
| Age | **D** not in the new flow | `age` stays `NULL`; readers use `|| null` |
| Cycle length | **D** | stays at the column default 28; "Auto" recalculation from history already exists |
| Focus areas (`goals`) | **D** | see f.9 |
| Timezone | **E** `participants.timezone` | set it from the sign-up metadata when the participant row is created |

### e.2 The smallest set of new fields

Nullable, `NULL` for every existing user, meaning "never asked".

| # | Field | Type | Allowed values | Existing users | Why no existing field works |
|---|---|---|---|---|---|
| 1 | `profiles.health_consent_at` | `timestamptz` | any time | `NULL` | `participants.consent_given_at` is set by the server when the first answer arrives, is hard-coded `true`, and has no version. Auth metadata is not queryable or versioned. `together_consent_*` is a different, optional consent |
| 2 | `profiles.health_consent_version` | `text` | e.g. `'health-v1'` | `NULL` | same. Put it on `profiles` (created at sign-in, before any participant row) so the App Store app can write it too |
| 3 | `participants.menopause_timing` | `text` with CHECK | `'under_12_months'`, `'1_to_5_years'`, `'5_plus_years'`, `'not_sure'` | `NULL` | `last_period_start` is the cycle-math anchor and Settings clears it for menopause. A bucket avoids false precision |
| 4 | `participants.cycle_traits` | `text[]` with CHECK `<@` allowed list | `'little_or_no_bleeding'` only to start. Irregular, perimenopause and recently-had-a-baby are written to their existing fields, not here, to avoid two sources of truth | `NULL` | nothing records "little or no bleeding" |
| 5 | `participants.conditions` | `text[]` with CHECK | `'pcos'`, `'endometriosis'`, `'thyroid'`, `'fibroids'` (and `'no_uterus'` only if kept separate from `has_uterus`) | `NULL` | no condition field exists. `user_memory_notes` is for free text and is injected as overriding corrections, wrong for a checklist |
| 6 | `participants.help_goals` | `text[]` with CHECK | `'understand_body'`, `'talk_to_doctor'`, `'help_partner'` | `NULL` | `goals` holds topic ids (`diet`, `sleep`...) read as "topics" by `chat-ai`, `generate-insight` and the admin editor. Mixing meanings would corrupt those prompts, and a non-empty `goals` would also silently switch off the focus-area prompt |

Six columns on two tables: `profiles` (1 to 2) and `participants` (3 to 6). `NULL` (not `'{}'`) for the arrays so "never asked" differs from "asked, none".

**Not needed:** a stage value for "not sure", a "tour seen" flag, a good-versus-hard symptom column, a v2 version column (put `onboarding_version: 2` in the completion message's `metadata`), age, and cycle length.

Where it goes: `profiles` and `participants` are both in the main schema. Phase 1 must pick one migration folder: `drizzle/migrations/` stops at `0029`, while the two newest changes (Oct 2026) are in `supabase/migrations/`. Confirm with Lovable which folder it applies from, and end that phase with a "Apply the latest database migration..." Lovable prompt.

---

## f. Flags

### f.1 Birth control: new single list vs existing `birth_control_method`

| New choice | `on_hormonal_bc` | `birth_control_method` | `birth_control_status` (postpartum only) | `asked_at` | What is lost |
|---|---|---|---|---|---|
| Combined pill, patch or ring | `true` | `NULL` (or a follow-up chip → `combined_pill_with_breaks` / `continuous_pill` / `ring_or_patch`) | `hormonal` | leave `NULL` if no follow-up, so Logan may ask once in chat | which of the three; pill-with-break vs continuous |
| Mini pill (progestin only) | `true` | `progestin_only_pill` | `hormonal` | now | nothing |
| Hormonal IUD | `true` | `hormonal_iud` | `hormonal` | now | nothing |
| Implant or shot | `true` | `NULL` (or follow-up → `implant` / `injection`) | `hormonal` | leave `NULL` if no follow-up | implant vs shot (label only; chat treats them the same) |
| Copper IUD | `false` | `copper_iud` | `non_hormonal` | now | nothing |
| Condoms or none | `false` | `NULL` | `none` | now | condoms vs none |
| Not sure | `NULL` | `NULL` | leave `NULL` | now | nothing (she does not know) |

Values with **no** new equivalent: `combined_pill_with_breaks`, `continuous_pill`, `ring_or_patch`, `injection`, `implant` (merged), `other`. Existing users keep theirs; Settings keeps the full list.

**Pill-break wording.** `buildBcMethodRule()` only allows pill-break, placebo-week and withdrawal-bleed language when the method is exactly `combined_pill_with_breaks` (`supabase/functions/_shared/bcMethod.ts:76 to 100`). The merged first option cannot tell that apart from `continuous_pill` or a patch/ring. Leaving the method `NULL` fails **safe**: Logan says "your birth control" and never mentions breaks. Guessing `combined_pill_with_breaks` fails **badly** for a continuous-pill user. Recommendation: add one conditional follow-up under the first option only, reusing three existing chips ("Pill with a monthly break", "Pill every day, no break", "Ring or patch"). No new column.

Other details:
- `hormonalAnswerForMethod` already enforces copper IUD → `false`, hormonal methods → `true`. Reuse it.
- v2 asks birth control of **every** stage; v1 only asks irregular and postpartum. Cycling users were never asked.
- For postpartum, write `birth_control_status` as well, or `ppKnownFacts` (`chat-ai/index.ts:5745`) will not know the answer and Logan may ask again.
- If "Not sure" were stored as method `not_sure`, `canAskBcMethod()` would stop Logan from ever asking again; `NULL` plus `asked_at` does the same job without a fake method.

### f.2 "Had a baby" no longer asks about breastfeeding

`refresh_postpartum_state()` treats `NULL` as "not breastfeeding" (`COALESCE(is_breastfeeding, false) = false`). With v2, a breastfeeding mother has `is_breastfeeding = NULL` and `feeding_status = NULL`. She would leave postpartum automatically once three consecutive logged cycles are each 21 to 35 days. That takes months, so nothing breaks at sign-up, but it is a silent wrong exit later.

Two more traps:
- Settings shows the "Currently breastfeeding/pumping" switch as **off** when the value is `NULL` (`SettingsDialog.tsx:110 to 117`), and Save writes `is_breastfeeding = false` for postpartum users (line 166). Saving any unrelated Settings change would flip `NULL` to `false`, which also fires the refresh.
- `chat-ai` only counts her as already postpartum if one of several fields is set; the birth date alone is enough, so no double prompt.

Options: (a) accept and add a gentle later question ("Are you breastfeeding or pumping?") that writes `is_breastfeeding`, (b) change the function so `NULL` blocks exit (changes behaviour for existing users with `NULL`, so not recommended), (c) ask one extra optional step. Recommendation (a), no schema change.

### f.3 Pregnancy loss has no date question

`loss_date` is already optional in v1 (Skip) and every reader is guarded (`chat-ai/index.ts:4715` `if (lossDate)`). v2 leaving it `NULL` is the same as a v1 skip. Settings still lets her add it later. No new field.

### f.4 "Had a baby recently" cycle trait vs "had a baby" stage

The data model already has both: `life_stage = 'postpartum'` (not cycling) and `life_stage = 'cycling'` + `postpartum_active = true` + `postpartum_start_date` (cycling again, still in recovery). v2's trait is the second state. Conflicts to resolve:
- A woman could pick stage "had a baby" **and** the trait. The trait must be ignored or hidden when the stage is already "had a baby".
- The existing state **requires a birth date**: Settings refuses to save it without one ("Add baby's birth date"), and `Chat.tsx:865` treats postpartum without a date as cycling. The trait has no date question, so v2 must ask for the date as a follow-up or not set `postpartum_active`.
- Together buckets her as `cycle` (stage cycling) not postpartum; that is current behaviour for this state.

### f.5 "No uterus" vs the existing hysterectomy-with-ovaries state

`has_uterus = false` today means **"uterus removed, ovaries intact, still cycling hormonally, just no bleed"** (column comment; `chat-ai/index.ts:1337 to 1341`). Effects: no period-date requests, `last_period_start` cleared. The code explicitly refuses to set `false` for "no uterus and no ovaries" (surgical menopause is left `NULL`, comments at `chat-onboarding/index.ts:521 to 523` and `chat-ai/index.ts:1339`).

The new tick says only "no uterus". If ovaries are unknown, writing `has_uterus = false` would assert that she still cycles hormonally. Options: ask one follow-up ("Are your ovaries still there?") and only write `has_uterus = false` on "yes"; otherwise store `no_uterus` in `conditions` and leave `has_uterus = NULL`. Founder decision (g.3).

### f.6 Where "irregular" and "perimenopause signs" land

Today these are **stages**, and stage drives everything (phase ring on/off, Together cohort, AI prompt). v1 puts "PMOS/PCOS, unpredictable cycles, or pill/IUD/implant" under `irregular`. In v2 they are traits on top of "cycle". See g.2.

### f.7 The "not sure" last-period answer

v1 turns "not sure" into a real date two weeks ago (`Chat.tsx:2557`), which then feeds cycle math. v2 should save `NULL`; the app already prompts for a period when `last_period_start` is empty (`needsPeriodStart`).

### f.8 `canonicalSymptom()` and its relatives

**Yes, `canonicalSymptom` exists under that exact name**: `src/lib/symptomCatalog.ts:70`, client only. It maps any typed or logged name to one display main name using the built-in `MERGES` table plus server aliases registered by `loadAliases()` / `registerAliases()` from `symptom_aliases`. Unknown names come back in sentence case (so free text is accepted, not rejected). Callers must `await loadAliases()` first or server aliases are missing.

How the pieces relate:

| Piece | What it is | Used for |
|---|---|---|
| `canonicalSymptom()` | client, display name, built-in merges + `symptom_aliases` | what she sees; logging; patterns |
| `together_canonical(name)` | SQL, `symptom_aliases` main name through `together_norm()` (lower case, singular) | Together counts: `refresh_together_aggregates()` (`drizzle/migrations/0022` and `0023`) |
| `_shared/symptomMatch.ts` | edge function mirror of `canonicalSymptom` | `chat-ai` finding symptoms in text |
| `canonicalSymptomKey()` (`src/lib/symptomDedupe.ts`) | fuzzy stem key | stopping near-duplicates entering the shared library |
| `useCanonicalSymptoms` / `resolveSymptomName` | `get_symptom_name_map()` rows, merged and retired names | old logs pointing at renamed words |
| `_visible_symptom_ids(uid)`, `get_visible_symptoms()`, `get_symptom_name_map()` (`supabase/migrations/20261008120000_security_audit_fixes.sql:17 to 78`) | decide which `community_symptoms` rows she may see: her own, admin-made, or main names of an alias. `get_visible_symptoms` also needs `approved` and not deleted | the shared symptom list in log mode |

Notes:
- `together_canonical` and `canonicalSymptom` give different output *forms* (normalised key vs display name) but the same *grouping*, because both go through `symptom_aliases`. The built-in `MERGES` table in the client has no server copy beyond `symptom_aliases`, so a name merged only in code would count separately in Together.
- A symptom counts in Together totals only when it is a built-in/approved word, or 10+ consenting women log it (`custom_ok`). A free-text symptom typed at onboarding is personal only.
- **v1 symptom names mostly do not line up with the catalogue.** `typical_symptoms` is saved exactly as the chip text and never passes through `canonicalSymptom()`. Only some chips are catalogue words or aliases (for example "Short fuse" → Irritability, "Knee pain" → Joint pain, plus Bloating, Cramps, Brain fog, Mood swings, Cravings, Nausea). Many are not ("Rage spikes", "Insomnia or poor sleep", "Wired but tired", "Energy crashes", "Migraines", "Dizziness", "Acne breakouts", "Random shame spiral", "One stinky armpit"), so they would be counted apart from the same thing logged elsewhere ("Trouble sleeping", "Headache", "Acne"). v2 should offer catalogue names (`GROUPED` in `symptomCatalog.ts`), which include good states ("Confident", "High energy", "Rested", "Sharp focus", "Positive shift").
- **How picks become ★.** Watched symptoms are the names in `participants.watch_symptoms` (max 3). Matching uses `key()` = `togetherNorm(canonicalSymptom(togetherDisplay(s)))` (`src/lib/togetherData.ts:25`), so storing the canonical display name is enough. Plan: `anchor_symptom` = bothers most; `watch_symptoms = [bothers most, want more of]`. 
- **Mine only draws logged symptoms**, so a brand-new user's ★ picks will not appear until she logs them. Do **not** fix this by writing `symptom_logs` at onboarding: AGENTS.md ("never log without her tap"), it would inflate Together totals, and patterns need real cycle days. The fix is a front-end change: draw ★ symptoms with zero logs as small empty bubbles (Phase 1, no schema).
- `WatchChooser.tsx` has its own hard-coded `GOOD_DAYS` ("Lots of energy", "Feeling confident", "Clear head", "Sleeping well") which are **not** in the catalogue. Align v2's "want more of" list with `GROUPED` and update `GOOD_DAYS` at the same time, or watched good states will not match logs.
- Only `typical_symptoms` has no polarity (hard vs good). Nothing reads it in a way that breaks if good states are mixed in, but `chat-ai` labels it "Typical symptoms" (line 5881), so relabel that line in Phase 1.

### f.9 Focus areas disappear but the prompt does not

The new flow has no focus-area question, so new users will have empty `goals`. `check_topics` then reports `needsTopics` and `Chat.tsx:429` shows the "Choose your Focus Areas" card to **every new user right after onboarding**. Phase 1 must either skip that prompt for v2 users (key on `help_goals IS NOT NULL`) or fold topics into v2.

### f.10 Cross-cutting free-text detector

`detectBcOrNoPeriod()` runs on the text of every v1 answer and can silently set `life_stage = 'irregular'`, `on_hormonal_bc = true` and clear `last_period_start` (`chat-onboarding/index.ts:585 to 602`). v2 adds free-text boxes. Text like "I'm on the pill" typed in the conditions box would flip her stage. The detector must be scoped off for v2 free text (AGENTS.md: life-stage and BC detection is "do not change without approval").

### f.11 "Not sure" stage

Adding a new `life_stage` value is risky: the CHECK constraint, `LIFE_STAGES` in `chat-ai`, `LifeStage` types in Settings and many `switch` blocks enumerate the 7 values, and `together_stage()` passes unknown values through as their own cohort. Mapping to `cycling` (v1's own fallback) is the only zero-risk choice, and then `last_period_start` decides whether the ring shows.

### f.12 Free text as memory notes

`user_memory_notes` rows are injected into every AI surface under "WHAT SHE HAS TOLD YOU ABOUT HERSELF (her own corrections; these override everything else...)" (`_shared/memoryNotes.ts:28`, newest 25 read, 15 used). That suits "in her own words", but a stray line such as "maybe pregnant" would outrank structured fields. Cap length at 300 characters (`note` CHECK), and consider whether stage free text should be stored at all.

### f.13 Post-onboarding walkthrough

What it does: see a.6. It is the right shape for the new first-run tour (spotlight three tabs, then offer to log). Recommendation: **replace its content, not the mechanism.** Keep `CoachMarkTour.tsx` and its end-of-onboarding trigger; update the copy, mention the ★ symptoms ("You're watching {x} and {y}"), and open Together › Mine on finish. It needs no stored flag because it only ever starts from the final-step response, so existing users cannot see it. A stored `tour_seen_at` would only matter if the tour should resume after being killed.

### f.14 Shared database and the App Store app

- **The completion marker must still be written.** Everything in d.2 hangs off a `chat_messages` row with `onboarding_complete: true`. `generate-insight` returns `onboarding_incomplete` without it. If the App Store app does not use the chat thread to onboard, it must still insert that closing message (add `onboarding_version: 2`), or the account is invisible to admin metrics and gets no proactive insights.
- **Participant lookup is by email in `chat-onboarding`** but by `user_id` everywhere else (RLS, `updateParticipant`). Email relay addresses ("Hide My Email" on iOS) make email unreliable. v2 should key on `user_id`. Note also that if the participant insert fails the user can still finish onboarding without a participant row (`index.ts:666`).
- **Timezone.** v1 never sets it from sign-up; the table default `'Asia/Jerusalem'` applies until a later silent sync.
- **Consent for existing users.** Everyone before v2 has the single combined checkbox and no version. Whether to ask them again is a legal/product call, outside onboarding (g.5). Do not gate them behind onboarding.

### f.15 v1 quirks not to carry over

- Raw codes appear as the user's chat bubble for several answers: `bc_no`, `bc_unknown`, `uterus_removed_yes`, `uterus_removed_no`, `uterus_prefer_not`, "28" (`Chat.tsx:167 to 185`, `ONBOARDING_ECHO_LABELS` has no entries for them).
- Age has no range check and falls back to **30**; cycle length falls back to **28**.
- The general-path progress bar uses a fixed `totalSteps = 5` and labels that do not match the questions.
- `go_back` deletes all later chat rows but not the saved profile values.
- A yes to hormonal birth control without a chip overwrites an existing `birth_control_method` with `NULL`.
- The due-date prompt invites "share how far along you are", but the control is a date picker.

---

## g. Decisions for the founder

1. **Pill-break wording:** add the one conditional follow-up under "combined pill, patch or ring" (recommended), or accept `NULL` and let Logan ask once in chat.
2. **What do "irregular" and "perimenopause signs" do?** Recommended: "irregular" and "little or no bleeding" → `life_stage = 'irregular'` (no phase predictions, as today); "perimenopause signs" → `life_stage = 'perimenopause'` (phase ring stays on). Alternative: record traits only and keep `cycling`, which means phase predictions for women who say their cycles are irregular.
3. **"No uterus":** ask the ovaries follow-up, or store it as a condition and leave the hormonal-cycling flag empty.
4. **Breastfeeding after "had a baby":** a later gentle question (recommended) or one extra optional step.
5. **Health consent for people who signed up before v2:** leave as is, or ask once, outside onboarding.
6. **Focus areas:** drop them for new users (recommended, with `help_goals` replacing them) or keep the picker.
7. **Menopause "under 12 months":** the stage is defined as 12+ months without a period. A woman who answers "under a year" probably belongs in perimenopause; decide whether to route her there.

---

## h. Read-only checks to run in Lovable before Phase 1

These are `SELECT`s only. They confirm the repo matches the live database.

```sql
-- h.1 Columns that exist on participants and profiles right now
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('participants','profiles')
order by table_name, ordinal_position;

-- h.2 Users who started onboarding but never got the completion marker
select count(distinct user_id) as started_not_finished
from chat_messages
where (message_type = 'onboarding' or metadata ? 'onboarding_step')
  and user_id not in (
    select user_id from chat_messages where metadata->>'onboarding_complete' = 'true'
  );

-- h.3 Life-stage mix of onboarded users (what v2 must not disturb)
select p.life_stage, count(*)
from participants p
join onboarded_profiles op on op.id = p.user_id
group by 1 order by 2 desc;

-- h.4 Postpartum users with no explicit breastfeeding value
select count(*) from participants
where life_stage = 'postpartum' and is_breastfeeding is null;

-- h.5 Participants with no linked user_id, or duplicate rows per email
select count(*) filter (where user_id is null) as no_user_id,
       count(*) - count(distinct email) as duplicate_emails
from participants;

-- h.6 Constraints on participants (confirm life_stage and birth_control_method checks)
select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid = 'public.participants'::regclass and contype = 'c';
```

## Appendix: files read for this inventory

`supabase/functions/chat-onboarding/index.ts`, `supabase/functions/chat-ai/index.ts` (participant, BC, life-stage and context sections), `supabase/functions/_shared/{bcMethod,bcDetection,cyclePhase,memoryNotes,symptomMatch,postpartumTimeline}.ts`, `supabase/functions/{generate-insight,generate-daily-insights,send-broadcast,together-tip-submit,partner-headsup-draft}/index.ts`, `src/pages/Chat.tsx`, `src/components/chat/{InlineChatAuth,SettingsDialog,SymptomPicker,AnchorPicker,TopicPicker,DatePickerInput,OnboardingEducation,OnboardingProgress,CoachMarkTour,LoganTodaySection}.tsx`, `src/components/you/{YourDataPage,YourPatterns}.tsx`, `src/components/together/*`, `src/components/tabs/TogetherTab.tsx`, `src/components/settings/{PrivacySection,MemorySection}.tsx`, `src/lib/{bcMethod,together,tips,onboardedUsers,participantWrite,symptomCatalog,symptomDedupe,communitySymptoms,togetherData,dateParsing,cyclePhase}.ts`, `src/lib/metrics/{lifeStage,definitions}.ts`, `src/hooks/{useAuth,useCanonicalSymptoms}.ts*`, `AGENTS.md`, `docs/agent-manual.md`, `roadmap.md`, all of `drizzle/migrations/*.sql`, and the migrations in `supabase/migrations/` that touch `participants`, `profiles`, `chat_messages`, `onboarded_profiles`, postpartum, Together and symptom visibility.
