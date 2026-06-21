
-- Promote existing admins (founding emails) to super_admin
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'super_admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) = ANY(ARRAY['raquella.siegel@gmail.com','liying.i.wang@gmail.com','raquellasiegel@gmail.com'])
ON CONFLICT (user_id, role) DO NOTHING;

-- Update auto-assign trigger function so authorized emails get super_admin
CREATE OR REPLACE FUNCTION public.auto_assign_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  authorized_emails text[] := ARRAY['raquella.siegel@gmail.com', 'liying.i.wang@gmail.com', 'raquellasiegel@gmail.com'];
BEGIN
  IF lower(NEW.email) = ANY(authorized_emails) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  authorized_emails text[] := ARRAY['raquella.siegel@gmail.com', 'liying.i.wang@gmail.com', 'raquellasiegel@gmail.com'];
BEGIN
  IF lower(NEW.email) = ANY(authorized_emails) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
