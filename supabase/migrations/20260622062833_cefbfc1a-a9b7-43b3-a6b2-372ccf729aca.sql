
-- Add referral system to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_referred_by_idx ON public.profiles(referred_by);

-- Allow attribution_events to capture a referral code from anon visitors
ALTER TABLE public.attribution_events
  ADD COLUMN IF NOT EXISTS ref_code text;

-- Generate a unique, friendly referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
  exists_count int;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..7 LOOP
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    SELECT count(*) INTO exists_count FROM public.profiles WHERE referral_code = code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN code;
END;
$$;

-- Trigger to assign a referral code on profile insert (and backfill if NULL on update)
CREATE OR REPLACE FUNCTION public.assign_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_assign_referral_code ON public.profiles;
CREATE TRIGGER profiles_assign_referral_code
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.assign_referral_code();

-- Backfill existing profiles
UPDATE public.profiles
SET referral_code = public.generate_referral_code()
WHERE referral_code IS NULL;

-- Allow looking up a user_id by referral code without exposing the profiles table widely.
CREATE OR REPLACE FUNCTION public.resolve_referral_code(_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE referral_code = upper(_code) LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_referral_code(text) TO anon, authenticated;
