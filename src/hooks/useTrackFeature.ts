import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks a feature view event once per mount (debounced).
 * Only fires for authenticated users.
 */
export function useTrackFeature(featureName: string, enabled = true) {
  const tracked = useRef(false);

  useEffect(() => {
    if (!enabled || tracked.current) return;
    tracked.current = true;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("feature_events").insert({
        user_id: user.id,
        feature_name: featureName,
      } as any).then(() => {});
    });
  }, [featureName, enabled]);
}
