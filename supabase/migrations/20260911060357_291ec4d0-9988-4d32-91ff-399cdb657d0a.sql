REVOKE ALL ON FUNCTION public.evaluate_postpartum_regularity(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_postpartum_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_cycle_history_refresh_postpartum() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_participants_breastfeeding_change() FROM PUBLIC, anon, authenticated;