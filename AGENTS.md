
- Partner heads-ups: settings/events live in partner_headsup_settings / partner_headsup_events (own-row RLS); message text is never stored, and the app never sends to the other person — she sends from her own WhatsApp.
- Partner heads-ups are gated by feature_flags.partner_headsup (on for everyone) else admin/super_admin only; checked client-side (usePartnerHeadsupFlag) and server-side (_shared/partnerHeadsupFlag.ts).
- partner-headsup-daily edge function (hourly pg_cron) owns scheduled heads-up work; offers post on any run, notifications must fire at the user's local time via participants.timezone (IANA) and localParts().
- Heads-up draft text is generated on demand by partner-headsup-draft and cached only in the browser (localStorage, cleared on send/skip); the only stored wording is her last 5 edited messages (partner_headsup_style_examples), deleted with "Turn off and delete history".
- Browser push uses the Firebase connector via _shared/partnerHeadsup.ts sendPush(); device tokens live in push_tokens.
