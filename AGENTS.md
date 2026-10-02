
- Partner heads-ups: settings/events live in partner_headsup_settings / partner_headsup_events (own-row RLS); message text is never stored, and the app never sends to the other person — she sends from her own WhatsApp.
- Partner heads-ups are gated by feature_flags.partner_headsup (on for everyone) else admin/super_admin only; checked client-side (usePartnerHeadsupFlag) and server-side (_shared/partnerHeadsupFlag.ts).
- partner-headsup-daily edge function (daily pg_cron 06:00 UTC) owns scheduled heads-up work: offer moments now, draft prep in part 2.
