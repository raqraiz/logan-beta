UPDATE public.participants
SET last_period_start = '2026-09-12',
    current_period_end_date = NULL
WHERE id = '8e7d39c4-e2fb-47a0-aaa3-277897a4c014';

UPDATE public.participants
SET period_still_active = true
WHERE id = '8e7d39c4-e2fb-47a0-aaa3-277897a4c014';

INSERT INTO public.cycle_updates (participant_id, update_type, description, category)
VALUES (
  '8e7d39c4-e2fb-47a0-aaa3-277897a4c014',
  'phase_adjustment',
  'Manual correction: reverted bad auto-write from ambiguous chat message "Follicular phase huh" (2026-09-16 10:01 UTC). Restored last_period_start 2026-09-15 -> 2026-09-12, cleared current_period_end_date (was 2026-09-15), period_still_active -> true.',
  'data_correction'
);