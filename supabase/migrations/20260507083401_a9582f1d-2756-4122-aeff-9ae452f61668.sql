
-- 1. Fix community_messages_public view: enforce SECURITY INVOKER and mask display_name for anonymous posts
CREATE OR REPLACE VIEW public.community_messages_public
WITH (security_invoker = true) AS
SELECT
  id,
  CASE WHEN is_anonymous = true THEN NULL::uuid ELSE user_id END AS user_id,
  channel,
  content,
  CASE WHEN is_anonymous = true THEN 'Anonymous' ELSE display_name END AS display_name,
  is_anonymous,
  is_pinned,
  created_at
FROM public.community_messages;

-- 2. Tighten community_messages base table SELECT: only owner or admin can read raw rows (with user_id).
-- Public reads must go through the masking view.
DROP POLICY IF EXISTS "Anyone can read community messages" ON public.community_messages;

CREATE POLICY "Owners and admins can read community messages"
ON public.community_messages
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- 3. Make cycle-images bucket private and remove public-read policy
UPDATE storage.buckets SET public = false WHERE id = 'cycle-images';
DROP POLICY IF EXISTS "Public can view cycle images" ON storage.objects;
