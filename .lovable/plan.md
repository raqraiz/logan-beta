## Goal
Send a second app email automatically 3 days after a user signs up, with subject "How's Logan feeling so far? 💚" and the copy you provided. Personalize with the user's name; fall back to "Hi there".

## Approach
Lovable Emails doesn't have native scheduled/delayed sends, so we'll add a tiny scheduler: a cron job runs an Edge Function hourly that finds users whose account is between 3 and 4 days old and haven't received the check-in yet, then invokes the existing `send-transactional-email` with an idempotency key so each user only ever gets it once.

## Steps

1. **New template** — `supabase/functions/_shared/transactional-email-templates/day-3-checkin.tsx`
   - Subject: `How's Logan feeling so far? 💚`
   - Greeting: `Hi ${name}` or `Hi there` if no name.
   - Body: exact copy you provided, signed by Raquella.
   - Same brand styling as the welcome email (white body, DM Sans, teal `#15B88C` accents, plain-text fallback).
   - Register in `_shared/transactional-email-templates/registry.ts` as `day-3-checkin`.

2. **New Edge Function** — `supabase/functions/send-day-3-checkins/index.ts`
   - Uses the service role to query `auth.users` for accounts created between 72h and 96h ago (the 24h window matches the hourly cron and prevents misses).
   - For each user, reads `raw_user_meta_data.full_name` (or `name`) for personalization.
   - Invokes `send-transactional-email` with:
     - `templateName: "day-3-checkin"`
     - `recipientEmail: user.email`
     - `idempotencyKey: "day-3-checkin-${user.id}"` ← guarantees one send per user even if the job runs multiple times
     - `templateData: { name: <name or null> }`
   - Skips users already in `suppressed_emails` (the send function also checks this as a safety net).
   - Returns a small JSON summary (processed/sent/skipped) for logs.

3. **Cron schedule** — Enable `pg_cron` + `pg_net` if not already, then schedule `send-day-3-checkins` to run every hour. Done via `supabase--insert` since the URL/anon key are project-specific.

4. **Deploy** the new function and template.

## Notes
- Existing welcome email and all other flows are untouched.
- Backfill: only users who sign up from deploy-time forward will get this. If you want to backfill the last few days too, say the word and I'll widen the initial window once.
- Monitoring: sends will appear in Cloud → Emails like the welcome email, and the cron job's invocations will show in Edge Function logs.
- Unsubscribe footer is appended automatically by the email system — template stays clean.
