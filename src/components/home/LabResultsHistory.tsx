import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { FlaskConical, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
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
  panel_id: string;
  name: string;
  category: string | null;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  flag: string | null;
}

const FLAG_CLASS: Record<string, string> = {
  critical: "text-rose-400",
  high: "text-amber-400",
  low: "text-sky-400",
  normal: "text-emerald-400/80",
};

export function LabResultsHistory({ open, onOpenChange, userId }: Props) {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [markersByPanel, setMarkersByPanel] = useState<Record<string, Marker[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const { data: p } = await supabase
        .from("lab_panels")
        .select("id, taken_on, lab_name, created_at")
        .eq("user_id", userId)
        .order("taken_on", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      const ps = p ?? [];
      setPanels(ps);

      if (ps.length) {
        const { data: m } = await supabase
          .from("lab_markers")
          .select("id, panel_id, name, category, value_numeric, value_text, unit, ref_low, ref_high, flag")
          .in("panel_id", ps.map(x => x.id));
        const grouped: Record<string, Marker[]> = {};
        (m ?? []).forEach(row => {
          (grouped[row.panel_id] ||= []).push(row as Marker);
        });
        setMarkersByPanel(grouped);
      }
      setLoading(false);
    })();
  }, [open, userId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-teal-400" />
            Your blood tests
          </DialogTitle>
          <DialogDescription>
            Every lab panel you've imported. Logan uses these in chat.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="px-6 py-4 space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : panels.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No blood tests imported yet. Open the chat settings → Import history → Blood test.
              </div>
            ) : (
              panels.map(panel => {
                const markers = markersByPanel[panel.id] ?? [];
                const flagged = markers.filter(m => m.flag && m.flag !== "normal");
                const dateLabel = panel.taken_on
                  ? format(new Date(panel.taken_on + "T12:00:00"), "MMMM d, yyyy")
                  : `Imported ${format(new Date(panel.created_at), "MMM d, yyyy")}`;
                return (
                  <div key={panel.id} className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border/30 flex items-baseline justify-between">
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {panel.lab_name || "Lab panel"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{dateLabel}</div>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {markers.length} markers · {flagged.length} flagged
                      </div>
                    </div>
                    <div className="divide-y divide-border/20">
                      {markers.map(m => {
                        const flag = m.flag ?? "";
                        const flagCls = FLAG_CLASS[flag] || "text-foreground/85";
                        const refRange = m.ref_low != null || m.ref_high != null
                          ? `Ref ${m.ref_low ?? "–"}–${m.ref_high ?? "–"}${m.unit ? " " + m.unit : ""}`
                          : null;
                        return (
                          <div key={m.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[13px] text-foreground/90 truncate">{m.name}</div>
                              {refRange && (
                                <div className="text-[10px] text-muted-foreground/70">{refRange}</div>
                              )}
                            </div>
                            <div className={`text-[13px] font-medium tabular-nums whitespace-nowrap ${flagCls}`}>
                              {m.value_numeric ?? m.value_text ?? "—"}
                              {m.unit ? ` ${m.unit}` : ""}
                              {flag && flag !== "normal" && (
                                <span className="ml-1.5 text-[10px] uppercase opacity-70">{flag}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
