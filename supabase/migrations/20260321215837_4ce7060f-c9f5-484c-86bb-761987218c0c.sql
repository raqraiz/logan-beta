
-- Community messages table
CREATE TABLE public.community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'general',
  content text NOT NULL,
  display_name text NOT NULL,
  is_anonymous boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can read (public)
CREATE POLICY "Anyone can read community messages"
  ON public.community_messages FOR SELECT
  TO anon, authenticated
  USING (true);

-- Authenticated users can post
CREATE POLICY "Authenticated users can post community messages"
  ON public.community_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admins can delete
CREATE POLICY "Admins can delete community messages"
  ON public.community_messages FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update (for pinning)
CREATE POLICY "Admins can update community messages"
  ON public.community_messages FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
