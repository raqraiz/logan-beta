import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { herCounts } from "@/components/together/TogetherLogMode";
import { useWordPrefs } from "@/hooks/useWordPrefs";
import { OWN_LOG_WINDOW_DAYS } from "@/lib/realCycleDays";
import { loadAliases } from "@/lib/symptomCatalog";
import { PATTERNS_CHANGED } from "@/lib/patternCycles";
import type { SymptomPageLog } from "@/lib/symptomPage";

/** One row: her top 3 symptoms (last 12 months), opening Together on Mine. */
export function YourSymptomsCard({ userId, onOpen }: { userId: string; onOpen: () => void }) {
  const [logs, setLogs] = useState<SymptomPageLog[] | null>(null);
  const { prefs } = useWordPrefs(userId);
  useEffect(() => {
    const load = () => {
      const since = new Date(Date.now() - OWN_LOG_WINDOW_DAYS * 86400000).toISOString();
      Promise.all([loadAliases(), supabase.from("symptom_logs").select("logged_at, cycle_day, symptoms").eq("user_id", userId).gte("logged_at", since)])
        .then(([, { data }]) => setLogs((data ?? []) as SymptomPageLog[]));
    };
    load();
    globalThis.addEventListener(PATTERNS_CHANGED, load);
    return () => globalThis.removeEventListener(PATTERNS_CHANGED, load);
  }, [userId]);
  const counts = logs ? herCounts(logs, prefs) : [];
  const top = counts.slice(0, 3).map((c) => c.name);
  const more = counts.length - top.length;
  const line = logs === null ? "" : top.length === 0 ? "Nothing logged yet. Tap to tell me how you feel." : `${top.join(", ")}${more > 0 ? ` and ${more} more` : ""}`;
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-[22px] border border-border bg-card px-5 py-4 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-foreground">Your symptoms</span>
        <span className="block truncate text-[13px] text-muted-foreground">{line}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}
