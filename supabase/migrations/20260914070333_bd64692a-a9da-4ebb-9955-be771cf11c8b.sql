CREATE TABLE public.daily_home_insights (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  succeed_text text NOT NULL,
  dont_mess_up_text text NOT NULL,
  context_key text NOT NULL,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, local_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_home_insights TO authenticated;
GRANT ALL ON public.daily_home_insights TO service_role;

ALTER TABLE public.daily_home_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own daily insights"
  ON public.daily_home_insights FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own daily insights"
  ON public.daily_home_insights FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own daily insights"
  ON public.daily_home_insights FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own daily insights"
  ON public.daily_home_insights FOR DELETE TO authenticated
  USING (auth.uid() = user_id);