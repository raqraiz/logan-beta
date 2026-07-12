REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_referral_count(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_referral_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_auth_email() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM PUBLIC, anon, authenticated;