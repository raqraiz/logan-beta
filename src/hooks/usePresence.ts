import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks user presence via Supabase Realtime.
 * Call once in the main authenticated layout so admins can see who's online.
 */
export const usePresence = (userId: string | undefined, userEmail?: string, userName?: string) => {
  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel("online-users", {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        // no-op on client side; admin dashboard reads state
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: userId,
            email: userEmail || "",
            full_name: userName || "",
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, userEmail, userName]);
};
