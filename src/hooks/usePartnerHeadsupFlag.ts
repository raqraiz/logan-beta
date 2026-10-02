import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Partner heads-ups are visible when the feature flag is on, or to admin accounts. */
export function usePartnerHeadsupFlag(userId?: string | null): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!userId) { setVisible(false); return; }
    let cancelled = false;
    Promise.all([
      supabase.from("feature_flags").select("enabled").eq("key", "partner_headsup").maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "super_admin"]),
    ]).then(([flag, roles]) => {
      if (cancelled) return;
      setVisible(!!flag.data?.enabled || (roles.data?.length ?? 0) > 0);
    });
    return () => { cancelled = true; };
  }, [userId]);
  return visible;
}
