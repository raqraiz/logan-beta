
CREATE TABLE public.policy_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  recipient_email text NOT NULL,
  policy_version text NOT NULL,
  email_sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX policy_notifications_unique_email_version
  ON public.policy_notifications (recipient_email, policy_version);

GRANT SELECT ON public.policy_notifications TO authenticated;
GRANT ALL ON public.policy_notifications TO service_role;

ALTER TABLE public.policy_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view policy notifications"
  ON public.policy_notifications
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
