
DROP POLICY IF EXISTS "Admins view all integrations" ON public.user_integrations;

REVOKE SELECT ON public.user_integrations FROM authenticated;
REVOKE SELECT ON public.user_integrations FROM anon;

GRANT SELECT (
  id, user_id, provider, provider_user_id, status, connected_at,
  last_synced_at, scopes, expires_at, created_at, updated_at
) ON public.user_integrations TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can delete own cycle images" ON storage.objects;
