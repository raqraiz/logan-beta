## Goal

Let each user connect their own Whoop and/or Fitbit account so Logan auto-imports sleep, recovery/HRV, workouts, and resting heart rate — feeding the same widgets and chat insights as the existing history importer, but continuously instead of one-shot.

## Why per-user OAuth (not a Lovable connector)

Lovable's built-in connectors authenticate the workspace owner's account (good for "post to *our* Slack"). Whoop and Fitbit data is personal — every Logan user must grant access to *their own* account. That means we register Logan as an OAuth app with each provider and run the flow per user.

Neither Whoop nor Fitbit is in the Lovable connector catalog, so this is the only path either way.

## What the user sees

- **Settings → Connected devices** (new section): two cards, "Whoop" and "Fitbit", each with a Connect button.
- Tapping Connect opens the provider's auth page in a new tab. After approval they land back in Logan with a green check + "Pulling your last 30 days…".
- A new **`Recovery`** widget on Home showing today's HRV, resting HR, sleep score, and a phase-correlation insight ("Your HRV dips ~12% in luteal — track this").
- Chat picks it up: "Your recovery is low today and you're entering luteal — want a lighter plan?"
- Disconnect button revokes the token and stops syncing (kept data stays).

## Provider setup (one-time, by you)

| Provider | Where | What we need |
|---|---|---|
| Whoop | developer.whoop.com → create app | Client ID + Secret, redirect URI `https://asklogan.ai/integrations/whoop/callback`, scopes: `read:recovery read:sleep read:workout read:cycles read:profile offline` |
| Fitbit | dev.fitbit.com → register app (type: Server) | Client ID + Secret, redirect URI `https://asklogan.ai/integrations/fitbit/callback`, scopes: `activity heartrate sleep profile`, OAuth 2.0 + PKCE |

Both also need the same redirect for the preview domain during testing.

Secrets to store in Lovable Cloud: `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`.

## Architecture

```text
User → Logan UI → /integrations/{provider}/connect (edge fn)
                       ↓ redirect with state
                 Provider auth page
                       ↓
           /integrations/{provider}/callback (edge fn)
              - exchange code → access+refresh token
              - store encrypted in user_integrations
              - kick off initial backfill (last 30d)
                       ↓
             sync-{provider} edge fn (cron, hourly)
              - refresh token if needed
              - pull deltas → tracker_logs / cycle_history
              - update last_synced_at
```

### New table

`public.user_integrations`
- `user_id`, `provider` (`'whoop'|'fitbit'`), `access_token`, `refresh_token`, `expires_at`, `provider_user_id`, `scopes`, `last_synced_at`, `status`
- Unique on (`user_id`, `provider`). RLS: user reads/deletes own; service role writes.

### Data mapping (reuses existing tables)

| Provider field | Logan destination |
|---|---|
| Sleep duration / score | `tracker_logs` under "Sleep hours" + new "Sleep score" tracker |
| HRV (RMSSD) | new "HRV" tracker |
| Resting HR | new "Resting HR" tracker |
| Workouts (count, strain) | `tracker_logs` under "Workouts" |
| Recovery score (Whoop) | new "Recovery" tracker |

All scaled to 1–5 where needed so existing phase-correlation logic works automatically.

### Edge functions

- `oauth-whoop-start`, `oauth-whoop-callback`, `sync-whoop`
- `oauth-fitbit-start`, `oauth-fitbit-callback`, `sync-fitbit`
- One scheduled cron (pg_cron) calls each `sync-*` hourly for active users.

## Frontend changes

- `SettingsDialog.tsx` — add "Connected devices" section with two `ProviderConnectCard` components.
- `src/components/settings/ProviderConnectCard.tsx` — new, shows status (Not connected / Connected since X / Last sync Y), Connect/Disconnect buttons.
- `src/pages/IntegrationCallback.tsx` — new route `/integrations/:provider/callback`, shows spinner, calls callback edge fn, then closes/redirects.
- New `RecoveryWidget` on Home feeding off the new trackers.

## Limits & guardrails

- Rate limits: Whoop 100 req/min, Fitbit 150 req/hr per user. Hourly cron + delta sync stays well under.
- Token refresh handled in `sync-*` before each pull; failed refresh → mark `status='reauth_required'` and prompt in Settings.
- Idempotent inserts (dedupe by `(user_id, provider, external_id)`) so re-syncs are safe.
- Disconnect revokes token at the provider, deletes the row, keeps imported data.

## Phasing suggestion

1. **Phase 1** — Fitbit only (simpler OAuth, larger user base). Sleep + HRV + workouts + resting HR.
2. **Phase 2** — Whoop (adds recovery score + strain).
3. **Phase 3** — Apple Health auto-sync via the iOS shortcut pattern (still file-based but scheduled).

## Files added or changed

- `supabase/migrations/...` — `user_integrations` table + RLS, new tracker seed.
- `supabase/functions/oauth-{whoop,fitbit}-start/index.ts` — new.
- `supabase/functions/oauth-{whoop,fitbit}-callback/index.ts` — new.
- `supabase/functions/sync-{whoop,fitbit}/index.ts` — new.
- `supabase/config.toml` — register the 6 new functions.
- `src/components/chat/SettingsDialog.tsx` — add Connected devices section.
- `src/components/settings/ProviderConnectCard.tsx` — new.
- `src/pages/IntegrationCallback.tsx` + route in `App.tsx` — new.
- `src/components/home/RecoveryWidget.tsx` — new Home widget.

## What I need from you to start

1. Confirm we go **Fitbit first**, then Whoop (or both at once).
2. You register the OAuth apps at dev.fitbit.com / developer.whoop.com and share Client IDs + Secrets when ready — I'll request them via the secrets tool.
3. Confirm the callback URL `https://asklogan.ai/integrations/{provider}/callback` is fine (we'll also whitelist the preview URL).
