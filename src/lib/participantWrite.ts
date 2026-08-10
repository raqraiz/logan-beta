import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * Single write path for the `participants` table.
 *
 * `user_id` is the key enforced by RLS (`user_id = auth.uid()`), so every
 * client-side write must filter on it — filtering by `id` or `email` can
 * silently match 0 rows when the participant row's `user_id` is null.
 *
 * Returns true when at least one row was updated. Surfaces 0-row writes
 * instead of failing silently.
 */
export async function updateParticipant(
  userId: string | undefined | null,
  payload: Record<string, unknown>,
  label = "Couldn't save your change"
): Promise<boolean> {
  if (!userId) {
    console.error("[participants] update skipped — no userId", payload);
    return false;
  }

  const { data, error } = await supabase
    .from("participants")
    .update(payload as never)
    .eq("user_id", userId)
    .select("id");

  if (error) {
    console.error("[participants] update failed", { userId, payload, error });
    toast({ title: label, description: error.message, variant: "destructive" });
    return false;
  }

  if (!data || data.length === 0) {
    console.error("[participants] update affected 0 rows", { userId, payload });
    toast({
      title: label,
      description:
        "Your change didn't save because your cycle record isn't linked to your account yet. Try again in a moment — we're fixing this on our end.",
      variant: "destructive",
    });
    return false;
  }

  return true;
}
