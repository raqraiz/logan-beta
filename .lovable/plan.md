# Unified Tracking Surface

## What changes for the user

Today the Home tab has two separate widgets (Symptom Tracker, Cycle Correlations). They overlap, so users duplicate entries to test which one is "right," and rich phase-pattern analytics only exist on the symptom side.

After this change there is **one widget — "Track"** on Home. Every signal a user cares about (cramps, mood, surfing, loneliness, cervical fluid, cervix position, BBT…) lives in the same list, with the same logging UI, and feeds the same phase-correlation engine that powers Symptom History today.

New abilities:
- **Categorical (nominal) trackers** — e.g. discharge type (dry / sticky / creamy / egg-white / watery). Logan correlates each option to phase.
- **Logan-suggested presets** — when a user names a tracker, Logan proposes sensible options (Billings for discharge, low/mid/high + firm/soft + closed/open for cervix, etc.). User can edit before saving.
- **One-tap "Enable FAM tracking"** — adds Cervical Fluid, Cervix Position, Cervix Texture, Cervix Opening, BBT as pre-built trackers.

Old data is preserved: existing symptom logs become a built-in tracker type and continue to show up in history + correlations.

## Build phases

### 1. Schema (one migration)
- `custom_trackers`: add `tracker_type` (`scale_0_5` | `single_choice`, default `scale_0_5`), `options` (jsonb array of strings, null for scale), `is_fam` (bool, default false), `is_builtin` (bool, default false).
- `tracker_logs`: add `option_value` (text, null for scale logs). Keep `intensity` for scale type.
- Backfill existing custom_trackers as `scale_0_5`.
- Backfill: for each distinct symptom name in `symptom_logs` per user, create a `custom_trackers` row (`source = 'symptom'`, type `scale_0_5`, `is_builtin = true`) and migrate the per-symptom severity entries into `tracker_logs`. Keep `symptom_logs` table around for read-only fallback (no destructive drop in this pass).

### 2. New unified widget `TrackWidget`
Replaces both `SymptomLogWidget` and `CycleCorrelationsWidget` in HomeTab + widget preferences. Same date picker. Per-tracker row renders either the 0–5 chip strip (existing) or a horizontal option-pill row for nominal trackers. "Track something else" opens the upgraded `AddTrackerDialog`.

### 3. `AddTrackerDialog` upgrade
- Type toggle (Scale 0–5 / Choose one).
- When type = Choose one, an editable options list.
- "Suggest options" button → calls a small edge function `suggest-tracker-options` (Lovable AI Gateway, Gemini Flash) with the tracker name + (optional) description and returns a JSON option array the user can accept / edit.
- "Enable FAM tracking" CTA at the top: inserts the 5 FAM trackers in one batch if not already present.

### 4. Unified analytics
- Extend `cycleCorrelation.ts` with a `analyzeNominalCorrelation` that, per option value, computes phase distribution (which phase each option appears in most) and surfaces the strongest signal (e.g. "Egg-white discharge peaks in Ovulation").
- `CycleCorrelationDetail` gains a nominal mode: shows a phase × option heatmap instead of a bar chart.
- `SymptomHistory` (renamed "Tracking History" in copy) reads from `tracker_logs` (unified) so symptoms + custom trackers + FAM all appear in one timeline + phase pattern view.

### 5. Chat awareness
`chat-ai` context builder pulls recent tracker logs (already does for symptoms) including option-typed entries, so Logan can reference "your fluid has been creamy for 3 days" naturally.

### 6. Cleanup
- Remove `SymptomLogWidget` and `CycleCorrelationsWidget` from `WIDGET_TYPES` and migrate any existing `home_widget_preferences.widget_order` entries to the new `track` id at load time (defensive map in `useWidgetPreferences`).
- Update memory: replace `mem://features/symptom-tracking` and `mem://features/cycle-correlations` with a single `mem://features/track-widget`.

## What I will not touch
- Lab Results, Daily Briefing, Cycle Forecast widgets.
- Chat layout, onboarding flow, monetization.
- The biological-model phase math.

## Technical notes
- One Supabase migration with all schema + backfill in a single transaction.
- New edge function `suggest-tracker-options` (verify_jwt = false; reads JWT in code; no secrets needed beyond `LOVABLE_API_KEY`).
- Frontend: 1 new component (`TrackWidget`), 1 rewritten dialog (`AddTrackerDialog`), 1 extended detail view (`CycleCorrelationDetail` → `TrackerDetail`), shared analytics module updated.
- Old `symptom_logs` reads remain functional during transition; new writes go to `tracker_logs`.

## Open question I'll resolve while building, unless you object
Whether to **delete** the legacy `SymptomLogWidget` / `CycleCorrelationsWidget` files immediately or leave them as dead code for one release. Default: delete — they're confusing if they linger.
