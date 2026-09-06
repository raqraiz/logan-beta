import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Flag } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface ReportRow {
  id: string;
  community_symptom_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  created_at: string;
}

interface ReportedEntry {
  symptomId: string;
  name: string;
  submitterId: string | null;
  reports: ReportRow[];
}

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  not_real: "Not a real symptom",
  inappropriate: "Inappropriate",
  other: "Other",
};

export const ReportedSymptomsSection = () => {
  const [entries, setEntries] = useState<ReportedEntry[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: reports, error: rErr } = await supabase
        .from("symptom_reports" as any)
        .select("id, community_symptom_id, reporter_id, reason, details, created_at")
        .order("created_at", { ascending: false });
      if (rErr) throw rErr;

      const rows = (reports ?? []) as unknown as ReportRow[];
      if (rows.length === 0) {
        setEntries([]);
        setNames({});
        return;
      }

      const symptomIds = [...new Set(rows.map((r) => r.community_symptom_id))];
      const { data: symptoms, error: sErr } = await supabase
        .from("community_symptoms")
        .select("id, name, added_by, submitted_by")
        .in("id", symptomIds);
      if (sErr) throw sErr;

      const bySymptom = new Map<string, ReportedEntry>();
      for (const s of symptoms ?? []) {
        bySymptom.set(s.id, {
          symptomId: s.id,
          name: s.name,
          submitterId: s.submitted_by ?? s.added_by ?? null,
          reports: [],
        });
      }
      for (const r of rows) {
        bySymptom.get(r.community_symptom_id)?.reports.push(r);
      }

      const userIds = new Set<string>();
      rows.forEach((r) => userIds.add(r.reporter_id));
      bySymptom.forEach((e) => e.submitterId && userIds.add(e.submitterId));

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", [...userIds]);
      const nameMap: Record<string, string> = {};
      for (const p of profiles ?? []) nameMap[p.id] = p.full_name || p.email;

      setEntries(
        [...bySymptom.values()]
          .filter((e) => e.reports.length > 0)
          .sort((a, b) => b.reports.length - a.reports.length)
      );
      setNames(nameMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (entry: ReportedEntry) => {
    setBusyId(entry.symptomId);
    try {
      const { error: uErr } = await supabase
        .from("community_symptoms")
        .update({ status: "deprecated" })
        .eq("id", entry.symptomId);
      if (uErr) throw uErr;
      const { error: dErr } = await supabase
        .from("symptom_reports" as any)
        .delete()
        .eq("community_symptom_id", entry.symptomId);
      if (dErr) throw dErr;
      toast.success(`"${entry.name}" removed from the library`);
      setEntries((prev) => prev.filter((e) => e.symptomId !== entry.symptomId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (entry: ReportedEntry) => {
    setBusyId(entry.symptomId);
    try {
      const { error: dErr } = await supabase
        .from("symptom_reports" as any)
        .delete()
        .eq("community_symptom_id", entry.symptomId);
      if (dErr) throw dErr;
      toast.success(`Reports on "${entry.name}" dismissed`);
      setEntries((prev) => prev.filter((e) => e.symptomId !== entry.symptomId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to dismiss");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Flag className="w-4 h-4 text-primary" />
          Reported Symptoms
          {!loading && !error && (
            <Badge variant="outline" className="ml-1 text-[10px]">{entries.length}</Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Symptom entries flagged by users — remove or dismiss
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <div className="py-4 text-center">
            <button
              onClick={load}
              className="text-xs text-destructive hover:underline"
            >
              Failed — retry
            </button>
          </div>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No reports right now.</p>
        ) : (
          <ScrollArea className="h-[320px] pr-3">
            <div className="space-y-3">
              {entries.map((e) => {
                const reasonCounts = new Map<string, number>();
                e.reports.forEach((r) =>
                  reasonCounts.set(r.reason, (reasonCounts.get(r.reason) ?? 0) + 1)
                );
                return (
                  <div
                    key={e.symptomId}
                    className="border border-border/40 rounded-lg p-3 bg-card/40"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{e.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          Added by {e.submitterId ? names[e.submitterId] ?? "Unknown" : "Unknown"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[9px]">
                          {e.reports.length} report{e.reports.length === 1 ? "" : "s"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          disabled={busyId === e.symptomId}
                          onClick={() => dismiss(e)}
                        >
                          Dismiss
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 px-2 text-[10px]"
                          disabled={busyId === e.symptomId}
                          onClick={() => remove(e)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {[...reasonCounts.entries()].map(([reason, count]) => (
                        <Badge key={reason} variant="secondary" className="text-[9px]">
                          {REASON_LABELS[reason] ?? reason}
                          {count > 1 ? ` ×${count}` : ""}
                        </Badge>
                      ))}
                    </div>
                    <div className="space-y-0.5">
                      {e.reports.map((r) => (
                        <p key={r.id} className="text-[10px] text-muted-foreground">
                          {names[r.reporter_id] ?? "Unknown"} ·{" "}
                          {format(new Date(r.created_at), "MMM d, p")}
                          {r.details ? ` — “${r.details}”` : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
