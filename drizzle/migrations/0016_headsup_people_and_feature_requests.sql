CREATE TABLE public.headsup_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  whatsapp_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.headsup_people TO authenticated;
GRANT ALL ON public.headsup_people TO service_role;
ALTER TABLE public.headsup_people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own people select" ON public.headsup_people FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own people insert" ON public.headsup_people FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own people update" ON public.headsup_people FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own people delete" ON public.headsup_people FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX headsup_people_user_idx ON public.headsup_people(user_id, last_used_at DESC NULLS LAST);

INSERT INTO public.headsup_people (user_id, name, whatsapp_number, created_at, last_used_at)
SELECT user_id, trim(partner_name), whatsapp_number, created_at, created_at
FROM public.partner_headsup_settings
WHERE partner_name IS NOT NULL AND trim(partner_name) <> '';

COMMENT ON COLUMN public.partner_headsup_settings.partner_name IS 'DEPRECATED: replaced by headsup_people';
COMMENT ON COLUMN public.partner_headsup_settings.whatsapp_number IS 'DEPRECATED: replaced by headsup_people';
COMMENT ON COLUMN public.partner_headsup_settings.timing IS 'DEPRECATED: scheduling removed';
COMMENT ON COLUMN public.partner_headsup_settings.paused_until IS 'DEPRECATED: scheduling removed';
COMMENT ON COLUMN public.partner_headsup_settings.offer_before_harder_days IS 'DEPRECATED: scheduling removed';
COMMENT ON COLUMN public.partner_headsup_settings.offer_on_hard_days IS 'DEPRECATED: enabled controls offers';

CREATE TABLE public.feature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.feature_requests TO authenticated;
GRANT ALL ON public.feature_requests TO service_role;
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own feature request insert" ON public.feature_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read feature requests" ON public.feature_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

ALTER TABLE public.chat_messages DROP CONSTRAINT chat_messages_message_type_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_message_type_check CHECK (message_type IS NULL OR message_type = ANY (ARRAY['text','reaction','onboarding','resource_offer','resource','checkin','partner_headsup_ask','partner_headsup_checkin','partner_headsup_draft','partner_headsup_keep','partner_headsup_offer','partner_headsup_sendnow','partner_headsup_shared','partner_headsup_hardday','partner_headsup_resume','partner_headsup_allset','partner_headsup_schedreq']));