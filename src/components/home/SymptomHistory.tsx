import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { format, subDays } from "date-fns";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SymptomHormoneChart } from "./SymptomHormoneChart";

interface SymptomEntry {
  name: string;
  severity: number;
}

interface SymptomLog {
  id: string;
  symptoms: SymptomEntry[];
  notes: string | null;
  cycle_day: number | null;
  cycle_phase: string | null;
  logged_at: string;
}

interface SymptomHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  lastPeriodStart?: string;
  cycleLengthDays?: number;
  isNonCycling?: boolean;
}

const SEVERITY_COLORS = [
  "bg-muted-foreground/30",
  "bg-green-400/70",
  "bg-lime-400/70",
  "bg-yellow-400/70",
  "bg-orange-400/70",
  "bg-red-400/70",
];

const SEVERITY_LABELS = ["None", "Mild", "Light", "Moderate", "Strong", "Severe"];

export function SymptomHistory({
  open,
  onOpenChange,
  userId,
  lastPeriodStart,
  cycleLengthDays = 28,
  isNonCycling = false,
}: SymptomHistoryProps) {
  const [logs, setLogs] = useState<SymptomLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [topSymptoms, setTopSymptoms] = useState<{ name: string; count: number; avgSeverity: number }[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);

    const since = subDays(new Date(), 90).toISOString();

    supabase
      .from("symptom_logs")
      .select("*")
      .eq("user_id", userId)
      .gte("logged_at", since)
      .order("logged_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        const typed = (data || []).map(d => ({
          ...d,
          symptoms: (d.symptoms as any as SymptomEntry[]) || [],
        }));
        setLogs(typed);

        // Compute top symptoms
        const freq: Record<string, { count: number; totalSev: number }> = {};
        typed.forEach(log => {
          log.symptoms.forEach(s => {
            if (!freq[s.name]) freq[s.name] = { count: 0, totalSev: 0 };
            freq[s.name].count++;
            freq[s.name].totalSev += s.severity;
          });
        });

        const sorted = Object.entries(freq)
          .map(([name, { count, totalSev }]) => ({
            name,
            count,
            avgSeverity: Math.round((totalSev / count) * 10) / 10,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8);

        setTopSymptoms(sorted);
        setLoading(false);
      });
  }, [open, userId]);

  // Group logs by date
  const grouped: Record<string, SymptomLog[]> = {};
  logs.forEach(log => {
    const day = format(new Date(log.logged_at), "yyyy-MM-dd");
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(log);
  });
  const sortedDays = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Symptom History</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No symptoms logged yet. Start logging to see patterns here.
          </p>
        ) : (
          <div className="space-y-5">
            {/* Top patterns */}
            {topSymptoms.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Your Top Patterns (90 days)
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {topSymptoms.map(s => (
                    <div key={s.name} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
                      <div className={`w-2 h-2 rounded-full ${SEVERITY_COLORS[Math.round(s.avgSeverity)] || "bg-muted-foreground/30"}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {s.count}× · avg {SEVERITY_LABELS[Math.round(s.avgSeverity)] || s.avgSeverity}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Timeline */}
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Recent Logs
              </h3>
              <div className="space-y-4">
                {sortedDays.slice(0, 14).map(day => (
                  <div key={day}>
                    <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-1.5">
                      {format(new Date(day + "T12:00:00"), "EEE, MMM d")}
                    </p>
                    {grouped[day].map(log => (
                      <div key={log.id} className="ml-2 mb-2 border-l-2 border-border/30 pl-3">
                        <p className="text-[10px] text-muted-foreground mb-1">
                          {format(new Date(log.logged_at), "h:mm a")}
                          {log.cycle_phase && (
                            <span className="ml-1.5 text-primary/60">· {log.cycle_phase}</span>
                          )}
                          {log.cycle_day && (
                            <span className="text-muted-foreground/50"> Day {log.cycle_day}</span>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {log.symptoms.map(s => (
                            <span
                              key={s.name}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-muted/60 text-foreground/70"
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_COLORS[s.severity]}`} />
                              {s.name}
                            </span>
                          ))}
                        </div>
                        {log.notes && (
                          <p className="text-[11px] text-muted-foreground/70 mt-1 italic">
                            {log.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
