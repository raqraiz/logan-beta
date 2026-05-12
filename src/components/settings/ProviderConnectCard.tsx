import { useEffect, useState } from "react";
import { Activity, Loader2, Plug, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface Props {
  provider: "whoop";
  userId?: string;
}

const PROVIDER_LABELS = {
  whoop: { name: "Whoop", desc: "Sleep, recovery, HRV, strain, workouts" },
};

export function ProviderConnectCard({ provider, userId }: Props) {
  const meta = PROVIDER_LABELS[provider];
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [integration, setIntegration] = useState<{
    connected_at: string;
    last_synced_at: string | null;
    status: string;
  } | null>(null);

  const refresh = async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("user_integrations")
      .select("connected_at, last_synced_at, status")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();
    setIntegration(data ?? null);
    setLoading(false);
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [userId]);

  const connect = async () => {
    setBusy("connect");
    try {
      const { data, error } = await supabase.functions.invoke(`oauth-${provider}-start`);
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No auth URL returned");
      }
    } catch (e) {
      toast({
        title: "Couldn't start connection",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
      setBusy(null);
    }
  };

  const sync = async () => {
    if (!userId) return;
    setBusy("sync");
    try {
      const { error } = await supabase.functions.invoke(`sync-${provider}`, {
        body: { user_id: userId, backfill_days: 14 },
      });
      if (error) throw error;
      toast({ title: "Sync started", description: `${meta.name} is pulling fresh data now.` });
      setTimeout(refresh, 1500);
    } catch (e) {
      toast({
        title: "Sync failed",
        description: e instanceof Error ? e.message : "Try again later.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!userId) return;
    if (!confirm(`Disconnect ${meta.name}? Synced data stays on your account.`)) return;
    setBusy("disconnect");
    const { error } = await supabase
      .from("user_integrations")
      .delete()
      .eq("user_id", userId)
      .eq("provider", provider);
    setBusy(null);
    if (error) {
      toast({ title: "Couldn't disconnect", description: error.message, variant: "destructive" });
      return;
    }
    setIntegration(null);
    toast({ title: `${meta.name} disconnected` });
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-md p-3 space-y-2">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center text-primary flex-shrink-0">
          <Activity className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{meta.name}</p>
            {integration?.status === "active" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">Connected</span>
            )}
            {integration?.status === "reauth_required" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive">Reconnect</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{meta.desc}</p>
          {integration?.last_synced_at && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              Last sync {formatDistanceToNow(new Date(integration.last_synced_at), { addSuffix: true })}
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-1">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : !integration ? (
        <Button size="sm" className="w-full" onClick={connect} disabled={busy === "connect"}>
          {busy === "connect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
          Connect {meta.name}
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={sync} disabled={busy === "sync"}>
            {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync now
          </Button>
          <Button size="sm" variant="outline" onClick={disconnect} disabled={busy === "disconnect"}>
            {busy === "disconnect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
            Disconnect
          </Button>
        </div>
      )}
    </div>
  );
}
