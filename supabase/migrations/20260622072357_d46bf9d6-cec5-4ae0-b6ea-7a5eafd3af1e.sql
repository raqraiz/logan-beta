-- Backfill Cray's missing profile and fix participant name
INSERT INTO public.profiles (id, email, full_name)
SELECT id, email, raw_user_meta_data->>'full_name'
FROM auth.users
WHERE id='586f5a1b-9f55-4eb7-8e6f-d88eab07cc71'
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name WHERE public.profiles.full_name IS NULL OR public.profiles.full_name = '' OR public.profiles.full_name = split_part(EXCLUDED.email, '@', 1);

UPDATE public.participants SET full_name = 'Cray' WHERE email='heycrayofficial@gmail.com' AND full_name='heycrayofficial';