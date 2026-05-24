
-- 1. Dedupe any existing duplicate user_credits rows, keeping the oldest
WITH ranked AS (
  SELECT id, user_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.user_credits
),
keep AS (
  SELECT user_id,
         SUM(free_credits) AS free_sum,
         SUM(paid_credits) AS paid_sum,
         BOOL_OR(bonus_credits_awarded) AS bonus_awarded
  FROM public.user_credits
  GROUP BY user_id
)
UPDATE public.user_credits uc
SET free_credits = LEAST(keep.free_sum, 5),
    paid_credits = keep.paid_sum,
    bonus_credits_awarded = keep.bonus_awarded
FROM keep, ranked
WHERE uc.id = ranked.id
  AND ranked.rn = 1
  AND uc.user_id = keep.user_id;

DELETE FROM public.user_credits
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC, id ASC) AS rn
    FROM public.user_credits
  ) t WHERE rn > 1
);

-- 2. Enforce one credits row per user
ALTER TABLE public.user_credits
  ADD CONSTRAINT user_credits_user_id_unique UNIQUE (user_id);

-- 3. Remove client-side insert into promo_redemptions (server-only via redeem-promo edge function)
DROP POLICY IF EXISTS "Users can insert their own redemptions" ON public.promo_redemptions;

-- 4. Lock down SECURITY DEFINER helpers that should never be called by clients
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.redeem_promo_code_atomic(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_assign_admin_role() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
-- Keep has_role and get_auth_email callable — they are used inside RLS policies as auth.uid()-scoped helpers.
