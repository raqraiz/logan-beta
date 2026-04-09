
-- Create a table for tracking user activity (clicks, page views, navigation)
CREATE TABLE public.user_activity_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- 'page_view', 'click', 'tab_switch', 'widget_interact'
  page_path TEXT,
  element_label TEXT, -- human-readable label of what was clicked
  element_type TEXT, -- 'button', 'link', 'tab', 'widget', etc.
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for efficient session queries
CREATE INDEX idx_user_activity_user_time ON public.user_activity_events (user_id, created_at DESC);
CREATE INDEX idx_user_activity_time ON public.user_activity_events (created_at DESC);

-- Enable RLS
ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

-- Users can insert their own events
CREATE POLICY "Users can insert their own activity events"
ON public.user_activity_events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Admins can view all activity events
CREATE POLICY "Admins can view all activity events"
ON public.user_activity_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
