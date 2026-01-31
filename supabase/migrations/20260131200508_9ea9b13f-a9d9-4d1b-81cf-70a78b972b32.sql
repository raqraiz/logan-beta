-- Add telegram_chat_id to participants table
ALTER TABLE public.participants 
ADD COLUMN telegram_chat_id text;