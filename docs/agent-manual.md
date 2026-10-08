# Logan agent manual

Practical manual for any AI coding agent working on this repository alongside Lovable. If anything here conflicts with the code, stop and ask.

## 1. What Logan is
Logan (asklogan.ai) is a chat-first health and performance companion for women. It turns cycle data, life stage and logged symptoms into short, biology-grounded, predictive guidance.
- Life stages: cycling, postpartum (incl. postpartum + cycling), pregnancy loss, perimenopause/menopause, irregular, hormonal birth control (method-specific: pill vs hormonal IUD vs copper IUD).
- Persona: knowledgeable, grounded friend. Grace over guilt. Strengths first.
- Surfaces: Logan (chat, default tab), You (Home widgets), Plan (calendar/forecast), Settings, Admin.

## 2. Stack
- Frontend: React 18, Vite 5, TypeScript 5, Tailwind v3, shadcn/ui (Radix), react-router v6, React Query v5, recharts, date-fns, lucide-react, next-themes, react-markdown, dnd-kit, Firebase (push only).
- Backend: Lovable Cloud (Postgres + RLS, Auth, Storage, Deno edge functions). No Node server; never add one.
- AI: Lovable AI Gateway (Gemini), called only from edge functions.
- Integrations: Stripe, Lovable email (auth + transactional), Brevo, Firebase Cloud Messaging, Whoop OAuth, Apple Health / CSV import.
- One backend instance serves preview and production.

## 3. Frontend structure
- `src/App.tsx`: providers, `Seo`, `AnalyticsGate`, routes: `/` (Chat shell), `/s/:slug`, `/auth/callback`, `/logan-admin-access`, `/admin`, `/consent`, `/privacy`, `/reset-password`, `/integrations/:provider/callback`, `/unsubscribe`, `*`.
- `src/pages/Chat.tsx`: onboarding chat, thread, `BottomTabBar` (You, Logan, Plan), Home/Plan tabs, Settings.
- `src/components/chat|home|tabs|partner|settings|admin|ui`.
- `src/lib/`: cycle math, phase, staleness, postpartum timeline, BC method, attribution, analytics gate, insight feedback, heads-up client, phase tints, metrics.
- `src/hooks/`: auth, flags, widget prefs, daily insights, activity tracking, stage boundaries.
- Styling: tokens in `src/index.css` + `tailwind.config.ts`; phase colors only via `src/lib/phaseTints.ts`.

## 4. Backend usage
- Client import `@/integrations/supabase/client`. Never edit `client.ts`, `previewAuthStorage.ts`, `types.ts`, `.env`, `supabase/config.toml`.
- Browser reads/writes own rows under RLS. Privileged/AI work runs in edge functions, which verify the caller's JWT and may then use the service role. Shared code: `supabase/functions/_shared/`.
- Roles: `user_roles` + `has_role()` (admin, user, super_admin). Never roles on profiles or in localStorage.
- Private buckets: cycle-images, history-imports, meal-photos, resources, database_export_21_07_26.
- Scheduled jobs: pg_cron in the database (not in repo).
- Functions: chat/AI (`chat-ai`, `chat-onboarding`, `trial-chat`, `generate-insight`, `generate-daily-insights`, `generate-widget`, `confirm-insight-memory`, `partner-headsup-draft`); data (`import-history`, `import-blood-test`, `analyze-meal`, `generate-meal-plan`, `swap-meal`, Whoop functions); billing (`get-credits`, `create-checkout`, `stripe-webhook`); accounts/admin (`add-admin`, `manage-admins`, `delete-account`, `delete-user`, `backfill-attribution`); email (`auth-email-hook`, `send-*`, `preview-transactional-email`, `handle-email-events`, `track-email-open`, `brevo-add-contact`).

## 5. Authentication
- `src/hooks/useAuth.tsx`: passwordless magic link / OTP, `/auth/callback`, password reset page.
- `ensureProfile` creates/patches `profiles` with first-touch attribution; manual referral codes via `resolve_referral_code`; `backfill-attribution` reconciles.
- Onboarding happens in chat; explicit consent flow at `/consent`.
- Admin: sign-in at `/logan-admin-access`; DB triggers give `super_admin` to an email allow-list; `/admin` checks roles server-side.
- Edge functions take identity from the bearer token only.

## 6. AI chat
1. Client saves user message, calls `chat-ai`.
2. `chat-ai` authenticates, deducts a credit, loads participant (life stage, cycle, BC, timezone), last 50 messages with dated local markers, active topic boundaries, memory notes (corrections first), symptoms/trackers.
3. Cycle day/phase computed live (`_shared/cycleCalculations.ts`), gated by `isPhaseTrackingOn()`.
4. Prompt = persona + `_shared/voiceRule.ts` + BC rule + anchor rule + boundaries + memory; gateway call; post-processing (dash stripping, `---` "See more", emotional rules, visual suppression); reply saved with metadata.
5. Side paths are confirmation-based: period/marker check-ins, life-stage switches only after Yes + verified write, boundary capture, corrections to memory, heads-up offers (try/catch, never break replies).
Rules: 2-4 short sentences, no lists/headers, one idea, no em dashes, no medication/dosage, no claim without a saved write.

## 7. Data and usage limits
- `user_credits`: 5 free per 24h, paid credits, one-time 10 bonus. 1 credit per message in `chat-ai`, logged in `credit_transactions`. Zero returns `no_credits`; client shows purchase UI.
- `create-checkout` (new tab) -> `stripe-webhook` adds credits. `get-credits` returns balance.
- Measurement: `insight_feedback_events`, `feature_events`, `user_activity_events` (no typed text, numbers as `#`), `admin_measurement_weekly()`; `profiles.is_internal` excluded.
- GA/LiveSession only via `AnalyticsGate`; consent in `profiles.analytics_consent`.

## 8. Tables and relationships
- Identity: `profiles` (1-1 auth user; attribution, referral_code, referred_by -> profiles, is_internal), `participants` (user_id; life stage, cycle, `last_period_start`, `cycle_anchor_type`, BC, postpartum, timezone), `user_roles`.
- Cycle: `cycle_history`, `cycle_updates` (-> participants), `symptom_logs`, `custom_trackers` 1-n `tracker_logs`, `community_symptoms`, `user_hidden_symptoms`, `symptom_reports`.
- Chat: `chat_messages` (metadata drives check-ins/offers), `insights`, `feedback`, `daily_home_insights`, `insight_feedback_events`, `user_memory_notes`, `user_topic_boundaries`.
- Billing: `user_credits`, `credit_transactions`.
- Heads-ups: `partner_headsup_settings`, `partner_headsup_events`, `partner_headsup_style_examples`, `headsup_people`, `push_tokens`, `feature_flags`.
- Other: widget/notification prefs, nutrition (`meals`, `nutrition_goals`, `user_dietary_prefs`), `weight_logs`, `lab_panels` 1-n `lab_markers`, `user_resources`, `user_integrations`, `history_imports`, attribution/short links, email tables, admin tables.
- Key triggers: clear period pending on period change, postpartum regularity refresh, referral codes, admin auto-assign, community symptom guards.

## 9. Env vars and secrets (names only)
- Client: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
- Functions: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `LOVABLE_API_KEY`, `LOVABLE_SEND_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FIREBASE_MESSAGING_API_KEY`, `BREVO_API_KEY`, `BREVO_LIST_ID`, `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`.
- Present but unused in code: Telegram and Twilio secrets.
- Never print, log, commit or return values.

## 10. Design conventions
- Quicksand (body), Cormorant Garamond 600 (headings). Light/dark follows phone, default light. Semantic tokens only.
- Flat calm surfaces, 22px cards, pill buttons/chips, teal accent, thin gradient rings, phase colors only for cycle data, predicted days dashed.
- Tabs You / Logan / Plan, Logan default. Wordmark-only header. Sentence case, no UI emojis, no em dashes.

## 11. Critical logic
- Cycle math parity client/server (14-day luteal, noon-UTC parsing); phase/day computed live.
- `isPhaseTrackingOn()` gates phase UI everywhere; hormonal IUD alone never disables tracking.
- No silent life-stage/BC switches; confirm, write, re-read.
- Boundaries respected on all surfaces; never medication/dosage.
- Archive gate 15-60 days; postpartum regularity = three consecutive 21-35 day cycles; period pending flag.
- Heads-ups sent only by the user from WhatsApp; text never stored.
- Analytics never contain message or symptom content.

## 12. Testing
1. `tsgo`  2. `bunx vitest run`  3. `deno test supabase/functions/_shared/topicBoundaries.test.ts`
4. UI: Playwright on `http://localhost:8080`, light + dark, 375px.
5. Edge functions: check logs; test a plain message and the affected trigger.
6. Read-only DB checks only. Report what was and was not verified.

## 13. Do Not Change Without Explicit Approval
- Authentication, roles, admin access.
- Database schema, RLS, grants, triggers, functions, cron, any data writes/backfills (show SQL first).
- Billing: credits, resets, Stripe.
- AI behavior: prompts, voice, model, guardrails, boundaries, memory, offers.
- Cycle logic and life-stage/BC detection.
- Privacy/analytics gating and consent.
- Production config: config.toml, .env, generated files, secrets, domains, index.html head, email setup.
- Design system and tab order.
- Deleting or rewriting user data.
