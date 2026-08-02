create or replace function public.get_referral_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.profiles where referred_by = auth.uid();
$$;

revoke all on function public.get_referral_count() from public, anon;
grant execute on function public.get_referral_count() to authenticated;