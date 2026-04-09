
CREATE TABLE public.home_widget_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  widget_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.home_widget_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own widget preferences"
ON public.home_widget_preferences
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own widget preferences"
ON public.home_widget_preferences
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own widget preferences"
ON public.home_widget_preferences
FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_home_widget_preferences_updated_at
BEFORE UPDATE ON public.home_widget_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
