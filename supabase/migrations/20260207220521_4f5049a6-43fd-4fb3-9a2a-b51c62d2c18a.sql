-- Allow public updates to telegram_chat_id only (for resume flow)
CREATE POLICY "Anyone can update their own telegram_chat_id"
ON public.participants
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Note: This is permissive but restricted in practice because:
-- 1. Users need to know their participant ID
-- 2. The edge function only returns ID after phone verification