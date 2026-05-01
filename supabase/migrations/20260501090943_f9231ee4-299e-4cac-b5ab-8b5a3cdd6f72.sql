UPDATE public.participants
SET life_stage = 'cycling',
    last_period_start = '2026-05-01',
    postpartum_start_date = NULL,
    updated_at = now()
WHERE id = 'bda2a457-8108-4a73-a405-c7c8146c8316';