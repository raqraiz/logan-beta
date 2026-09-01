CREATE OR REPLACE VIEW public.onboarded_profiles
WITH (security_invoker = on) AS
SELECT p.*
FROM public.profiles p
WHERE EXISTS (
  SELECT 1 FROM public.chat_messages cm
  WHERE cm.user_id = p.id
    AND cm.metadata->>'onboarding_complete' = 'true'
);

GRANT SELECT ON public.onboarded_profiles TO authenticated;
GRANT SELECT ON public.onboarded_profiles TO service_role;