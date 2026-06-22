UPDATE public.chat_messages
SET content = replace(content, 'Hey there!', 'Hey Cray!')
WHERE user_id='586f5a1b-9f55-4eb7-8e6f-d88eab07cc71'
  AND role='assistant'
  AND content LIKE 'Hey there!%';