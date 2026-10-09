import { supabase } from "@/integrations/supabase/client";

/** Confirm (true) or unconfirm (false) a tracked cycle. Returns an error message, or null on success. */
export async function setCycleConfirmed(cycleId: string, confirmed: boolean): Promise<string | null> {
  const { error } = await supabase
    .from("cycle_history")
    .update({ confirmed_by_user_at: confirmed ? new Date().toISOString() : null })
    .eq("id", cycleId);
  return error ? error.message : null;
}
