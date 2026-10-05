ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS cycle_anchor_type text NOT NULL DEFAULT 'bleed'
  CONSTRAINT participants_cycle_anchor_type_check CHECK (cycle_anchor_type IN ('bleed','marker'));

ALTER TABLE public.cycle_history
  ADD COLUMN IF NOT EXISTS cycle_anchor_type text NOT NULL DEFAULT 'bleed'
  CONSTRAINT cycle_history_cycle_anchor_type_check CHECK (cycle_anchor_type IN ('bleed','marker'));

COMMENT ON COLUMN public.participants.cycle_anchor_type IS 'What last_period_start represents: bleed (period Day 1) or marker (cycle started without a bleed). Copy only, never cycle math.';
COMMENT ON COLUMN public.cycle_history.cycle_anchor_type IS 'Anchor type of cycle_start_date for this archived cycle.';