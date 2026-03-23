
-- Create a view that masks user_id for anonymous messages
CREATE OR REPLACE VIEW public.community_messages_public AS
SELECT
  id,
  CASE WHEN is_anonymous = true THEN NULL ELSE user_id END AS user_id,
  channel,
  content,
  display_name,
  is_anonymous,
  is_pinned,
  created_at
FROM public.community_messages;

-- Grant access to the view
GRANT SELECT ON public.community_messages_public TO anon, authenticated;

-- Drop the old public SELECT policy on the base table
DROP POLICY "Anyone can read community messages" ON public.community_messages;

-- Add a new SELECT policy: only admins and message owners can read base table
CREATE POLICY "Users can read own messages"
ON public.community_messages
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all messages"
ON public.community_messages
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable RLS on the view (views inherit from base table, but we need anon access via the view)
-- Since the view uses SECURITY INVOKER by default, we need to allow anon to read the base table
-- but only through the view. Instead, let's make the view SECURITY DEFINER owned by postgres.
ALTER VIEW public.community_messages_public SET (security_invoker = false);
