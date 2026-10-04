
- Partner heads-ups: settings/events live in partner_headsup_settings / partner_headsup_events (own-row RLS); message text is never stored, and the app never sends to the other person — she sends from her own WhatsApp.
- Partner heads-ups are gated by feature_flags.partner_headsup (on for everyone) else admin/super_admin only; checked client-side (usePartnerHeadsupFlag) and server-side (_shared/partnerHeadsupFlag.ts).
- partner-headsup-daily edge function (hourly pg_cron) owns scheduled heads-up work; offers post on any run, notifications must fire at the user's local time via participants.timezone (IANA) and localParts().
- Heads-up draft text is generated on demand by partner-headsup-draft and cached only in the browser (localStorage, cleared on send/skip); the only stored wording is her last 5 edited messages (partner_headsup_style_examples), deleted with "Turn off and delete history".
- Browser push uses the Firebase connector via _shared/partnerHeadsup.ts sendPush(); device tokens live in push_tokens.
- Insight measurement lives in insight_feedback_events (shown/confirmed/not_confirmed/corrected, no text) written via src/lib/insightFeedback.ts; admin weekly counts come from the admin-only admin_measurement_weekly() function.
- Google Analytics and LiveSession are injected only by AnalyticsGate (src/lib/thirdPartyAnalytics.ts): signed-out pages, or GA after consent / LiveSession for admin testing; never add their tags to index.html.
- Insight corrections become rows in user_memory_notes via chat-ai (_shared/memoryNotes.ts) and are injected into chat, opener and daily-insight prompts; confirmation only after the row is saved.
- Partner-facing daily tips live in daily_home_insights.succeed_partner_text / dont_mess_up_partner_text (the *_him_text columns are deprecated, never write them); Home picks the saved person with relationship 'partner' first, because the most recent recipient may not be her partner.
