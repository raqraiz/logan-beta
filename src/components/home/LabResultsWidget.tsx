import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FlaskConical, ChevronRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { LabResultsHistory } from "./LabResultsHistory";

interface LabResultsWidgetProps {
  userId: string;
}

interface Panel {
  id: string;
  taken_on: string | null;
  lab_name: string | null;
  created_at: string;
}

interface Marker {
  id: string;
  name: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  flag: string | null;
}

const COLORS = {
  border: "border-l-teal-500",
  bgGradient: "from-teal-500/10 via-teal-500/5 to-transparent",
  iconBg: "bg-teal-500/15",
  iconColor: "text-teal-400",
  labelColor: "text-teal-400/80",
};

export function LabResultsWidget({ userId }: LabResultsWidgetProps) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [totalPanels, setTotalPanels] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: panels, count } = await supabase
        .from("lab_panels")
        .select("id, taken_on, lab_name, created_at", { count: "exact" })
        .eq("user_id", userId)
        .order("taken_on", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (cancelled) return;
      setTotalPanels(count ?? 0);
      const latest = panels?.[0] ?? null;
      setPanel(latest);

      if (latest) {
        const { data: m } = await supabase
          .from("lab_markers")
          .select("id, name, value_numeric, value_text, unit, flag")
          .eq("panel_id", latest.id)
          .order("flag", { ascending: false, nullsFirst: false });
        if (!cancelled) setMarkers(m ?? []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) return null;

  const flagged = markers.filter(m => m.flag === "low" || m.flag === "high" || m.flag === "critical");
  const hasData = !!panel;

  return (
    <>
      <button
        onClick={() => setShowHistory(true)}
        className={`w-full text-left rounded-2xl border border-border/40 ${COLORS.border} border-l-[3px] bg-card overflow-hidden relative transition-opacity active:opacity-90`}
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${COLORS.bgGradient} pointer-events-none`} />
        <div className="relative px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className={`w-7 h-7 rounded-lg ${COLORS.iconBg} flex items-center justify-center`}>
                <FlaskConical className={`w-4 h-4 ${COLORS.iconColor}`} />
              </div>
              <span className={`text-[10px] font-semibold uppercase tracking-widest ${COLORS.labelColor}`}>
                Lab Results
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/60" />
          </div>

          {!hasData ? (
            <div className="text-[14px] text-foreground/75 leading-snug">
              No blood tests imported yet. Upload a lab report from the chat settings to see your markers here.
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-2.5">
                <div className="text-[13px] text-foreground/85 font-medium">
                  {panel.lab_name || "Latest panel"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {panel.taken_on
                    ? format(new Date(panel.taken_on + "T12:00:00"), "MMM d, yyyy")
                    : format(new Date(panel.created_at), "MMM d, yyyy")}
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3">
                {flagged.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 text-[11px] font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    {flagged.length} flagged
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    All in range
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {markers.length} markers
                </span>
              </div>

              {flagged.length > 0 && (
                <ul className="space-y-1.5">
                  {flagged.slice(0, 4).map(m => (
                    <li key={m.id} className="flex items-center justify-between text-[13px]">
                      <span className="text-foreground/85 truncate pr-2">{m.name}</span>
                      <span className={`font-medium tabular-nums whitespace-nowrap ${
                        m.flag === "critical" ? "text-rose-400"
                        : m.flag === "high" ? "text-amber-400"
                        : "text-sky-400"
                      }`}>
                        {m.value_numeric ?? m.value_text}
                        {m.unit ? ` ${m.unit}` : ""}
                        <span className="ml-1.5 text-[10px] uppercase opacity-70">{m.flag}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {totalPanels > 1 && (
                <div className="mt-3 text-[11px] text-muted-foreground/80">
                  {totalPanels} panels on file · tap to browse
                </div>
              )}
            </>
          )}
        </div>
      </button>

      <LabResultsHistory
        open={showHistory}
        onOpenChange={setShowHistory}
        userId={userId}
      />
    </>
  );
}
