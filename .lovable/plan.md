## The problem

Logan's current-cycle phase is computed from `last_period_start + cycle_length_days`, with **menstruation hardcoded as days 1–5**. If a user's period only lasts 4 days, day 5 still shows as "Menstruation" even though biologically she's already in the Follicular phase. There is no way to tell Logan "my bleed ended."

The phase-edit UI I just added to Cycle Analytics only affects *completed* cycles in history — it doesn't influence the live phase of the cycle she's currently in.

## The fix

Add a per-user "current period end date" that overrides the menstruation window for the in-progress cycle only.

### 1. Schema

Add to `participants`:
- `current_period_end_date date` (nullable)

Cleared automatically whenever a new `last_period_start` is written.

### 2. Phase calculation

Update `calculateCycleInfo` in `src/components/chat/ChatCycleCircle.tsx` to accept an optional `periodEndDate`:

```text
if periodEndDate is set and reference date > periodEndDate:
    menstruationEnd = max(1, daysBetween(periodStart, periodEndDate) + 1)
else:
    menstruationEnd = 5   // current default
```

Everything else (Follicular / Ovulation / Luteal boundaries) stays the same.

### 3. Plumb the value through

- `Chat.tsx`: include `current_period_end_date` in the participants select + realtime subscription, pass it into `calculateCycleInfo`.
- Same for the other consumers that call `calculateCycleInfo`: `ChatCycleCircle`, `PlanTab`, `SymptomLogWidget`, `CycleCorrelationsWidget`, `DischargeTrackerWidget`, `CycleForecast`, `admin/ProfilesTab`. Each reads `last_period_start` already; they'll read the end date alongside it.

### 4. UI to set it

Add a small "My period ended" action on the Home tab, near the cycle circle:
- Shown only when current `cycleDay <= 8` and `current_period_end_date` is not set.
- Tap opens a tiny date picker defaulted to today, with options: today, yesterday, 2 days ago.
- Saves to `participants.current_period_end_date`. Real-time subscription updates the phase instantly across tabs.
- Once set, the chip turns into "Period ended {date} · edit" so she can correct it.

When she logs a new period start (existing flow), `current_period_end_date` is set back to `null` automatically — handled in the same UPDATE that writes the new `last_period_start`.

### 5. Cycle Analytics

When the current cycle eventually closes and gets added to `cycle_history`, populate `menstruation_days` from `current_period_end_date - last_period_start + 1` so her Phase Breakdown reflects reality without manual editing.

## Out of scope

- No change to luteal-length assumption (14d) — that's a separate ask.
- No automatic period-end detection from symptom logs.
