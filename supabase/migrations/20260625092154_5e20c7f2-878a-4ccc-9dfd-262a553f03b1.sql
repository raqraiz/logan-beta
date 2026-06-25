CREATE OR REPLACE FUNCTION public.get_referral_count(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.profiles WHERE referred_by = _user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_referral_count(uuid) TO authenticated;