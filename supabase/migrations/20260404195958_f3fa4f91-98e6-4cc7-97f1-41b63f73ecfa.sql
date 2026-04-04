
-- 2. Remove chat_messages from realtime publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.chat_messages;
  END IF;
END $$;

-- 3. Harden has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (_user_id = auth.uid() OR EXISTS(
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      ))
  )
$$;

-- 4. Make cycle-images bucket private
UPDATE storage.buckets SET public = false WHERE id = 'cycle-images';
DROP POLICY IF EXISTS "Public can view cycle images" ON storage.objects;
