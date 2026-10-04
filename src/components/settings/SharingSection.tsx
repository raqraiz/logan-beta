import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePartnerHeadsupFlag } from "@/hooks/usePartnerHeadsupFlag";
import { PartnerHeadsupManage } from "@/components/partner/PartnerHeadsupManage";

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
  const [status, setStatus] = useState<"Off" | "On">("On");

  useEffect(() => {
    if (!userId) return;
    const load = () =>
      supabase
        .from("partner_headsup_settings")
        .select("enabled")
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data }) => setStatus(!data || data.enabled ? "On" : "Off"));
    load();
    window.addEventListener("logan:headsup-updated", load);
    return () => window.removeEventListener("logan:headsup-updated", load);
  }, [userId]);

  const [manageOpen, setManageOpen] = useState(false);
  const open = () => setManageOpen(true);

  return (
    <div className="headsup-surface border-t border-border/50 pt-4 space-y-3">
      <h3 className="headsup-headline text-2xl">Sharing</h3>
      <p className="text-xs text-muted-foreground">What Logan helps you share, and with whom. Nothing is shared without you.</p>

      <div className="rounded-[20px] border border-border/50 p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Heads-ups</span>
          <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${status === "On" ? "headsup-chip-active" : "bg-muted text-muted-foreground"}`}>
            {status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          When you tell me things are tough, I'll offer to help you tell someone close.
        </p>
        <button onClick={open} className="headsup-primary min-h-[44px] rounded-full px-5 text-sm font-medium">
          Manage
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
      {userId && (
        <PartnerHeadsupManage userId={userId} open={manageOpen} onOpenChange={setManageOpen} />
      )}
    </div>
  );
}
