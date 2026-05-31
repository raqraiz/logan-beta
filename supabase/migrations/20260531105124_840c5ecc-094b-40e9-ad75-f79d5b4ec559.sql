REVOKE SELECT (admin_notes, ai_prompt_used) ON public.insights FROM authenticated;
REVOKE SELECT (admin_notes, ai_prompt_used) ON public.insights FROM anon;