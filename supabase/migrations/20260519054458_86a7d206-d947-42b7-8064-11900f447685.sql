ALTER TABLE public.custom_trackers ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user';

-- Backfill: trackers auto-created by Whoop sync are tagged
UPDATE public.custom_trackers
SET source = 'whoop'
WHERE description = 'Auto-synced from Whoop'
   OR name IN ('Recovery','Sleep score','Sleep hours','Sleep efficiency','HRV','Resting HR','Skin temperature','Respiratory rate','SpO2','Day strain','Workouts');

CREATE INDEX IF NOT EXISTS idx_custom_trackers_user_source ON public.custom_trackers (user_id, source, is_active);