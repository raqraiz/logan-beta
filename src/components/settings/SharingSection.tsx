import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HEADSUP_OPEN_EVENT, headsupStatus } from "@/lib/partnerHeadsup";
import { usePartnerHeadsupFlag } from "@/hooks/usePartnerHeadsupFlag";

interface Props {
  userId?: string;
  onOpenSetup: () => void;
}

export function SharingSection(props: Props) {
  const visible = usePartnerHeadsupFlag(props.userId);
  if (!visible) return null;
  return <SharingSectionInner {...props} />;
}

function SharingSectionInner({ userId, onOpenSetup }: Props) {
  const [status, setStatus] = useState<"Off" | "On" | "Paused">("Off");

  useEffect(() => {
    if (!userId) return;
    const load = () =>
      supabase
        .from("partner_headsup_settings")
        .select("enabled, paused_until")
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data }) => setStatus(headsupStatus(data)));
    load();
    window.addEventListener("logan:headsup-updated", load);
    return () => window.removeEventListener("logan:headsup-updated", load);
  }, [userId]);

  const open = () => {
    onOpenSetup();
    // Manage screen arrives in part 2; for now both open setup.
    setTimeout(() => window.dispatchEvent(new CustomEvent(HEADSUP_OPEN_EVENT)), 50);
  };

  return (
    <div className="headsup-surface border-t border-border/50 pt-4 space-y-3">
      <h3 className="headsup-headline text-2xl">Sharing</h3>
      <p className="text-xs text-muted-foreground">What Logan helps you share, and with whom. Nothing is shared without you.</p>

      <div className="rounded-[20px] border border-border/50 p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Partner heads-ups</span>
          <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${status === "On" ? "headsup-chip-active" : "bg-muted text-muted-foreground"}`}>
            {status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          A short message you send before your harder days, so the people close to you know what helps.
        </p>
        <button onClick={open} className="headsup-primary min-h-[44px] rounded-full px-5 text-sm font-medium">
          {status === "Off" ? "Set up" : "Manage"}
        </button>
      </div>

      <div className="rounded-[20px] border border-border/40 p-4 space-y-2 opacity-70" aria-disabled="true">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Doctor summaries</span>
          <span className="rounded-full bg-muted px-3 py-0.5 text-xs font-medium text-muted-foreground">Coming soon</span>
        </div>
        <p className="text-xs text-muted-foreground">Walk into appointments with your history and the right questions.</p>
      </div>

      <p className="text-xs font-light text-muted-foreground">
        You can turn off any kind of sharing and delete its history at any time.
      </p>
    </div>
  );
}
