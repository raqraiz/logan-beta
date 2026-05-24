
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redeem_promo_code_atomic(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_assign_admin_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
