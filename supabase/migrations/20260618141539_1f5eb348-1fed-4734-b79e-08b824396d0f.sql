
-- weight_logs
CREATE TABLE public.weight_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_kg numeric(6,2) NOT NULL,
  logged_on date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, logged_on)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weight_logs TO authenticated;
GRANT ALL ON public.weight_logs TO service_role;
ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weight_logs_own_select" ON public.weight_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "weight_logs_own_insert" ON public.weight_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "weight_logs_own_update" ON public.weight_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "weight_logs_own_delete" ON public.weight_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER weight_logs_updated BEFORE UPDATE ON public.weight_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_weight_logs_user_date ON public.weight_logs(user_id, logged_on DESC);

-- meals
CREATE TABLE public.meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  calories integer NOT NULL DEFAULT 0,
  protein_g numeric(6,1) NOT NULL DEFAULT 0,
  carbs_g numeric(6,1) NOT NULL DEFAULT 0,
  fat_g numeric(6,1) NOT NULL DEFAULT 0,
  image_path text,
  source text NOT NULL DEFAULT 'text', -- 'text' | 'photo' | 'manual'
  ai_confidence text, -- 'low' | 'medium' | 'high'
  logged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meals TO authenticated;
GRANT ALL ON public.meals TO service_role;
ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meals_own_select" ON public.meals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "meals_own_insert" ON public.meals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "meals_own_update" ON public.meals FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "meals_own_delete" ON public.meals FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER meals_updated BEFORE UPDATE ON public.meals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_meals_user_logged ON public.meals(user_id, logged_at DESC);

-- nutrition_goals
CREATE TABLE public.nutrition_goals (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  calorie_target integer,
  protein_target_g integer,
  carbs_target_g integer,
  fat_target_g integer,
  weight_goal_kg numeric(6,2),
  weight_goal_direction text, -- 'lose' | 'maintain' | 'gain'
  height_cm numeric(5,1),
  age integer,
  activity_level text, -- 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
  auto_calculated boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_goals TO authenticated;
GRANT ALL ON public.nutrition_goals TO service_role;
ALTER TABLE public.nutrition_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nutrition_goals_own_select" ON public.nutrition_goals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "nutrition_goals_own_insert" ON public.nutrition_goals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nutrition_goals_own_update" ON public.nutrition_goals FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "nutrition_goals_own_delete" ON public.nutrition_goals FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER nutrition_goals_updated BEFORE UPDATE ON public.nutrition_goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
