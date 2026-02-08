-- Update the auto_assign_admin_role function to include the email variant without dot
CREATE OR REPLACE FUNCTION public.auto_assign_admin_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  authorized_emails text[] := ARRAY['raquella.siegel@gmail.com', 'liying.i.wang@gmail.com', 'raquellasiegel@gmail.com'];
BEGIN
  IF NEW.email = ANY(authorized_emails) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- Also update handle_new_user_admin function
CREATE OR REPLACE FUNCTION public.handle_new_user_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  authorized_emails text[] := ARRAY['raquella.siegel@gmail.com', 'liying.i.wang@gmail.com', 'raquellasiegel@gmail.com'];
BEGIN
  IF NEW.email = ANY(authorized_emails) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- Grant admin to the existing raquellasiegel@gmail.com user
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'raquellasiegel@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;