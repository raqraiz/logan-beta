
# History Importer

Let users bring months of cycle, symptom, sleep, and workout history from Apple Health or any period-tracker CSV (Clue, Flo, Natural Cycles, etc.) into Logan in one upload — then have Logan post a "here's what I just learned about you" message in chat.

## What the user sees

- A new **"Import your history"** button in the chat Settings dialog (gear icon, top right of chat). Also linked from the Aha Moment after onboarding so new users can backfill immediately.
- A dialog that explains what's supported, lets them pick a file, and shows a progress + summary state:
  - File picker accepting `.zip` (Apple Health export), `.xml` (extracted Apple Health), or `.csv`.
  - Inline help tabs: "From Apple Health" (with screenshots-style instructions), "From Clue / Flo / Natural Cycles", "Generic CSV template" (download link to Logan's template).
  - After upload: "Importing 8 months of history…" with a spinner, then a green check + counts ("Imported 9 cycles · 142 symptom days · 68 workouts").
- Once import succeeds, Logan posts an assistant message in chat:
  > "I just went through 8 months of your history. Here's what stands out: your cycles run **29 days** on average, your toughest stretch is **days 24–28** (sleep + irritability), and you're sharpest **days 10–14**. I'll use this from now on."
- Cycle Analytics, Cycle Forecast, and Symptom widgets pick up the new data automatically because they read from the same tables.

## Supported sources

1. **Apple Health export** — user exports from iPhone Health app → Share → Export All Health Data → Logan accepts the resulting `export.zip` or extracted `export.xml`.
   - Periods → `MenstrualFlow` records → cycle_history rows.
   - Symptoms → records like `Headache`, `MoodChanges`, `Fatigue`, `AbdominalCramps`, `Bloating`, `Acne`, `BreastPain`, `LowerBackPain`, `Nausea`, `Insomnia`, etc. → symptom_logs.
   - Sleep → `SleepAnalysis` aggregated per day → tracker_logs under an auto-created "Sleep hours" tracker.
   - Workouts → `Workout` records (count or duration per day) → tracker_logs under "Workouts".
2. **Period-tracker CSV** (Clue, Flo, Natural Cycles, generic). We auto-detect columns:
   - Required: a date column + at least one of `period`, `flow`, `cycle_day`, or symptom columns.
   - Cycle starts → cycle_history. Symptom intensity (0–5 scale or boolean) → symptom_logs.

## Data model

Reuses existing tables — no schema changes needed for the data itself:
- `cycle_history(participant_id, cycle_start_date, cycle_end_date, cycle_length_days)`
- `symptom_logs(user_id, symptoms jsonb, logged_at, cycle_day, cycle_phase, notes)`
- `custom_trackers` + `tracker_logs(intensity 1–5, logged_at)` for sleep / workouts.

One small new table to make imports idempotent and visible in admin:

```text
public.history_imports
  id uuid pk
  user_id uuid              -- auth.uid()
  source text               -- 'apple_health' | 'csv'
  status text               -- 'processing' | 'completed' | 'failed'
  cycles_imported int
  symptom_days_imported int
  tracker_logs_imported int
  date_range_start date
  date_range_end date
  error_message text
  created_at, completed_at
```
RLS: users can SELECT/INSERT their own; admins can view all. Used to (a) prevent double-import, (b) drive the UI summary, (c) feed the recap message.

## Backend

New private storage bucket `history-imports` with per-user folder RLS (`auth.uid()` is folder name; INSERT + SELECT + DELETE for owner). Files auto-deleted after processing.

New edge function `import-history`:
1. Auth check (Bearer token → `auth.getUser`).
2. Reads `{ storage_path, source_hint }` from body.
3. Downloads the file from `history-imports` via service-role client.
4. **If `.zip`**: stream-unzip with `jsr:@zip-js/zip-js`, find `apple_health_export/export.xml`.
5. **Parse**:
   - Apple Health: streaming XML parser (`jsr:@libs/xml` or sax). Walk `<Record>` elements, bucket by type. For periods, group consecutive `MenstrualFlow` days into cycles (start date = first day, end date = day before next start, length = diff).
   - CSV: `papaparse` (already in deps if present, otherwise `jsr:@std/csv`). Header sniffing maps common column names to canonical fields.
6. Look up the user's `participants.id` by email.
7. Batch insert into `cycle_history` (skip duplicates on `(participant_id, cycle_start_date)`), `symptom_logs`, and `tracker_logs` (creating "Sleep hours" / "Workouts" trackers if missing). Use service role to bypass RLS for bulk insert.
8. Update `history_imports` row with counts + status.
9. Compute a summary (avg cycle length, top 3 luteal symptoms, top 3 follicular symptoms, sleep average) and pass it to a second AI call that writes the recap message in Logan's voice (2–4 sentences, no bullets — per project memory).
10. Insert that recap as an assistant message into `chat_messages` so it shows up in chat next time the user opens it (and via realtime if subscribed).
11. Delete the storage file.
12. Return `{ summary, counts, date_range }` so the dialog can show the green-check state.

Edge function gets `verify_jwt = false` (validated in code) and is added to `supabase/config.toml`.

## Frontend

- New `src/components/chat/HistoryImportDialog.tsx` — handles file selection, upload to storage (`supabase.storage.from('history-imports').upload(...)`), invokes `import-history` edge function, shows progress + result. Uses Tailwind tokens, dark glassmorphism per design system.
- New `src/lib/historyImport.ts` — small helpers (file type detection, byte size formatting, friendly error mapping).
- Hook into `SettingsDialog.tsx`: add "Import your history" row that opens the dialog.
- Hook into `OnboardingEducation.tsx` / Aha Moment: a soft prompt "Have history from another app? Import it →" that opens the same dialog.
- `Chat.tsx`: after a successful import, refresh the chat message list so the new assistant recap appears immediately.

## Limits & guardrails

- Max upload 50 MB (Apple Health exports for ~1 year are typically 5–30 MB; Logan rejects bigger with a friendly message asking them to export a shorter range).
- Per-user rate limit: max 3 imports per 24h (enforced via `history_imports` row count).
- Imports are de-duplicated by `(participant_id, cycle_start_date)` for cycles and by `(user_id, logged_at::date, symptom_name)` for symptoms — re-running the same file is safe.
- All AI calls use `google/gemini-2.5-flash-lite` for the parsing summary and `google/gemini-2.5-flash` for the recap message (cheap + on-brand).

## Out of scope (for this first pass)

- Live API integrations (HealthKit OAuth, Fitbit, Garmin) — file import only.
- Editing imported data inline — users still edit via chat ("change my last period to Apr 3").
- Importing from screenshots / photos.

## Files added or changed

- `supabase/migrations/...` — `history_imports` table + RLS, `history-imports` storage bucket + policies.
- `supabase/functions/import-history/index.ts` — new.
- `supabase/config.toml` — register the new function.
- `src/components/chat/HistoryImportDialog.tsx` — new.
- `src/lib/historyImport.ts` — new.
- `src/components/chat/SettingsDialog.tsx` — add entry point.
- `src/components/chat/OnboardingEducation.tsx` (or wherever Aha Moment lives) — add soft prompt.
- `mem://features/history-import` + index update — new memory file documenting the importer.

