# AGENTS.md

Full manual: `docs/agent-manual.md` (product, stack, auth, chat, credits, tables, secrets names, design, testing). Read it before any change.

## Do Not Change Without Explicit Approval
Auth (sign-in, callbacks, roles, has_role), DB (migrations, RLS, grants, triggers, cron, data writes), billing (credits, Stripe), AI behavior (prompts, voice, guardrails, boundaries, memory, offers), cycle logic (math, anchors, archive, life-stage/BC detection), privacy/analytics (AnalyticsGate, consent), production config (config.toml, .env, generated client/types, secrets, index.html head), design tokens/fonts/tab order.

## Always
- Never name medication or dosage. Never claim a write that was not saved and re-read.
- Client and server cycle math stay identical (parity test).
- Test: `tsgo`, `bunx vitest run`, `deno test supabase/functions/_shared/topicBoundaries.test.ts`; Playwright for UI.
- Never print secret values.

## Technical decisions
- Partner heads-ups: settings/events live in partner_headsup_settings / partner_headsup_events (own-row RLS); message text is never stored, and the app never sends to the other person — she sends from her own WhatsApp.
- Partner heads-ups are gated by feature_flags.partner_headsup (on for everyone) else admin/super_admin only; checked client-side (usePartnerHeadsupFlag) and server-side (_shared/partnerHeadsupFlag.ts).
- partner-headsup-daily edge function (hourly pg_cron) owns scheduled heads-up work; offers post on any run, notifications must fire at the user's local time via participants.timezone (IANA) and localParts().
- Heads-up draft text is generated on demand by partner-headsup-draft and cached only in the browser (localStorage, cleared on send/skip); the only stored wording is her last 5 edited messages (partner_headsup_style_examples), deleted with "Turn off and delete history".
- Browser push uses the Firebase connector via _shared/partnerHeadsup.ts sendPush(); device tokens live in push_tokens.
- Insight measurement lives in insight_feedback_events (no text) via src/lib/insightFeedback.ts; admin weekly counts come from admin_measurement_weekly().
- GA and LiveSession are injected only by AnalyticsGate (src/lib/thirdPartyAnalytics.ts); never add their tags to index.html.
- Insight corrections become user_memory_notes rows via chat-ai (_shared/memoryNotes.ts), injected into chat, opener and daily-insight prompts; confirm only after save.
- Partner daily tips live in daily_home_insights.succeed_partner_text / dont_mess_up_partner_text (*_him_text deprecated, never write); Home picks relationship 'partner' first.
- Every write to participants.last_period_start sets cycle_anchor_type explicitly (bleed/marker/current for date edits); archived cycle_history rows take the prior type. Why: anchor type drives copy and must never be inherited by accident.
- You-tab pattern status (Confirmed/Emerging/Watching) is computed client-side from symptom_logs.cycle_day in src/components/you/YourPatterns.tsx; no stored pattern table. Why: read-only, no schema change.
- Her chosen watch list (max 3) lives in participants.watch_symptoms, falling back to anchor_symptom; injected into chat-ai, generate-insight and generate-daily-insights prompts. Why: one source for You tab and AI priorities.
- Chat never writes symptom_logs on its own: chat-ai puts metadata.log_offer on the reply and LogOfferCard writes only on her tap (Undo deletes those rows; dismiss/logged state kept in localStorage per message). Explicit dated backfill requests still write server-side. Why: never log without her tap.
- Pattern page explanations come from the pattern-explain edge function (not stored; cached in localStorage). Pattern fixes are user_memory_notes: timing as insight_correction ("Your X usually comes around days A to B."), removal as pattern_hidden; YourPatterns parses both. Why: no new table.
- Symptom names: aliases live in symptom_aliases (alias -> main_name; old logs are never rewritten). Any code that counts, groups or matches symptoms must go through canonicalSymptom()/sameSymptom() in src/lib/symptomCatalog.ts client-side and together_canonical() server-side. Why: duplicates split Together totals and patterns.
- "Your words" rename/remove live in user_word_prefs (own-row RLS; legacy localStorage copies are moved in and cleared on load), affect future logs only, and are deleted by "Delete all memory" and account deletion. Why: follows her across devices; old logs stay untouched.
- Together is the only symptom library and logging screen (Everyone / Mine lenses plus log mode in TogetherTab, opened app-wide via openTogether() in src/lib/togetherOpen.ts); the in-chat LogOfferCard is the only other way to log. Viewing Together needs no consent; together_consent only decides whether her logs count. Why: one place, so totals and her symptoms never drift apart.
