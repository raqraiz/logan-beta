
CREATE TABLE public.email_opens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL,
  template_name text,
  recipient_email text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip text
);

CREATE INDEX email_opens_message_id_idx ON public.email_opens (message_id);
CREATE INDEX email_opens_recipient_idx ON public.email_opens (recipient_email);
CREATE INDEX email_opens_opened_at_idx ON public.email_opens (opened_at DESC);

GRANT SELECT ON public.email_opens TO authenticated;
GRANT ALL ON public.email_opens TO service_role;

ALTER TABLE public.email_opens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read email opens"
ON public.email_opens
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);
