
-- Store each completed cycle's length for historical tracking
CREATE TABLE public.cycle_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  cycle_start_date DATE NOT NULL,
  cycle_end_date DATE NOT NULL,
  cycle_length_days INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cycle_history ENABLE ROW LEVEL SECURITY;

-- Admins can manage cycle history
CREATE POLICY "Admins can manage cycle history"
  ON public.cycle_history FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Index for fast lookups by participant
CREATE INDEX idx_cycle_history_participant ON public.cycle_history(participant_id, cycle_start_date DESC);
