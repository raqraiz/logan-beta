CREATE INDEX IF NOT EXISTS idx_chat_messages_onboarding_complete
  ON public.chat_messages (user_id)
  WHERE (metadata ->> 'onboarding_complete') = 'true';

CREATE OR REPLACE FUNCTION public.count_onboarded_users()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)
    THEN (
      SELECT count(*)::int FROM public.profiles p
      WHERE EXISTS (
        SELECT 1 FROM public.chat_messages cm
        WHERE cm.user_id = p.id
          AND (cm.metadata ->> 'onboarding_complete') = 'true'
      )
    )
    ELSE NULL
  END
$$;

REVOKE ALL ON FUNCTION public.count_onboarded_users() FROM public;
GRANT EXECUTE ON FUNCTION public.count_onboarded_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_onboarded_users() TO service_role;