-- Create a function to auto-assign admin role for authorized emails
CREATE OR REPLACE FUNCTION public.auto_assign_admin_role()
RETURNS TRIGGER AS $$
DECLARE
  authorized_emails text[] := ARRAY['raquella.siegel@gmail.com', 'liying.i.wang@gmail.com'];
BEGIN
  -- Check if the user's email is in the authorized list
  IF NEW.email = ANY(authorized_emails) THEN
    -- Insert admin role if not exists
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on auth.users (using a wrapper approach via handle_new_user)
-- Note: We'll handle this in the existing flow or create a new trigger
CREATE OR REPLACE FUNCTION public.handle_new_user_admin()
RETURNS TRIGGER AS $$
DECLARE
  authorized_emails text[] := ARRAY['raquella.siegel@gmail.com', 'liying.i.wang@gmail.com'];
BEGIN
  IF NEW.email = ANY(authorized_emails) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;