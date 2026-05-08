-- 1. Atomic promo decrement
CREATE OR REPLACE FUNCTION public.redeem_promo_code_atomic(_promo_id uuid)
RETURNS public.promo_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result public.promo_codes;
BEGIN
  UPDATE public.promo_codes
  SET uses_remaining = uses_remaining - 1
  WHERE id = _promo_id
    AND is_active = true
    AND uses_remaining > 0
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_promo_code_atomic(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code_atomic(uuid) TO service_role;

-- 2. Realtime topic scoping
DROP POLICY IF EXISTS "Authenticated users can subscribe to realtime" ON realtime.messages;

CREATE POLICY "Users can subscribe to their own and shared realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = 'online-users'
  OR realtime.topic() LIKE 'user:' || (auth.uid())::text || '%'
  OR realtime.topic() LIKE 'participant:' || (auth.uid())::text || '%'
  OR (
    realtime.topic() IN ('admin-updates')
    AND public.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- 3. Lock down trigger-only SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.handle_new_user_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_assign_admin_role() FROM PUBLIC, anon, authenticated;
