## What we're building

A new life stage — **Pregnancy loss / miscarriage** — that turns Logan into a grief-aware companion. Cycle ring is paused; instead Logan tracks recovery (bleeding, energy, mood, sleep) and offers gentle physical + emotional support until she chooses to move on.

## How a woman enters this mode

1. **Onboarding option** — added to the life-stage picker as "Pregnancy loss or miscarriage" with a soft sub-line ("I'm currently going through or recently experienced a loss"). Asks for the date of loss (optional — "skip" allowed).
2. **Chat detection** — if Logan hears phrases like "miscarriage", "lost the baby", "pregnancy loss", "i miscarried", it asks once gently: *"I'm so sorry. Would you like me to switch into recovery support mode? I'll pause cycle tracking and focus on healing."* — and only switches if she confirms. No auto-flip without consent.
3. **Settings** — selectable manually in the life-stage radio group, with a date-of-loss field.

## What changes in the app

**Cycle ring & home tab**
- Cycle ring is hidden; replaced with a soft "Recovery — Day X" badge using a muted rose color (`#D4A5A5`).
- DailyBriefingHero shows recovery-specific headline ("Healing in progress. There's no timeline for this.") and disables the cycle circle button.
- PlanTab/CycleAnalytics/CycleForecast gracefully skip cycling logic — show "Recovery mode is on. Cycle tracking is paused" empty state.

**AI behavior (chat-ai + generate-insight)**
- New system-prompt block for `pregnancy_loss`: grief-aware language, no toxic positivity, no "silver lining" reframes, never "everything happens for a reason". Validate first, then offer practical recovery info only when asked or contextually appropriate.
- Three focus areas (matching your picks): emotional support, physical recovery (bleeding patterns, cramping, when to call a doctor, iron, rest, sleep), and resources (support groups, therapist pointers, partner communication).
- Strict guardrails: any heavy bleeding / fever / severe pain mention → immediate "please call your provider" message.
- Insights generator routes loss users to a dedicated empathetic prompt (no menstrual-phase context).

**Exit**
- User-controlled. Settings has an "I'm ready to move on" button → prompts her to set life stage back to cycling and Logan asks about her first period.

## Data model (one migration)

- Extend `life_stage` enum (text column today, not an enum — just add the literal `"pregnancy_loss"` to all guards/UI lists).
- Add `loss_date date` column on `participants` (nullable).
- No new tables — recovery symptoms reuse the existing `symptom_logs` table.

## Files touched

- `supabase/migrations/...` — add `loss_date` column.
- `supabase/functions/chat-ai/index.ts` — detection regex, system-prompt branch, guardrails.
- `supabase/functions/chat-onboarding/index.ts` — picker option + date capture.
- `supabase/functions/generate-insight/index.ts` — loss-specific prompt path.
- `src/components/chat/SettingsDialog.tsx` — new radio option + date-of-loss input + "I'm ready to move on" button.
- `src/components/home/DailyBriefingHero.tsx` — recovery view.
- `src/components/tabs/HomeTab.tsx`, `PlanTab.tsx`, `CycleAnalytics.tsx`, `CycleForecast.tsx` — pause cycle UI, show recovery card.
- `src/components/chat/ChatCycleCircle.tsx` — recovery badge variant (mirrors the postpartum pattern).
- `src/index.css` — `--phase-recovery` token (muted rose).

## Out of scope

- No dedicated support-group directory or therapist API integration (Logan points to existing resources in chat text only).
- No pregnancy tracking for women still pregnant — this mode is specifically for loss.
- No automatic exit; she stays in recovery mode until she changes it manually.
- No widget changes beyond hiding cycle-specific ones; existing symptom widgets continue to work.

Sound good? Once approved I'll ship it in one pass — migration first, then code.