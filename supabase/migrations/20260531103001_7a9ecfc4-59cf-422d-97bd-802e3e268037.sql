DROP VIEW IF EXISTS public.community_messages_public CASCADE;
DROP TABLE IF EXISTS public.community_messages CASCADE;
DROP TABLE IF EXISTS public.calendar_tokens CASCADE;
DROP TABLE IF EXISTS public.promo_redemptions CASCADE;
DROP TABLE IF EXISTS public.promo_codes CASCADE;
DROP FUNCTION IF EXISTS public.redeem_promo_code_atomic(uuid) CASCADE;