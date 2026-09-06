import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Merge, RefreshCw, Flag, Trash2, Check } from "lucide-react";
import { format } from "date-fns";
import { clusterSimilarNames } from "@/lib/symptomModeration";
import { REPORT_REASON_LABEL } from "@/components/home/ReportSymptomDialog";

interface ReportRow {
  id: string;
  community_symptom_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  created_at: string;
}

interface SymptomRow {
  id: string;
  name: string;
  status: string;
  canonical_id: string | null;
  submitted_by: string | null;
  added_by: string;
  created_at: string;
  category: string | null;
}

/**
 * Submissions go live immediately, so there is no approval queue here — this
 * screen exists for ongoing consolidation of overlapping live entries.
 */
export function SymptomReviewTab() {
  const [rows, setRows] = useState<SymptomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mergeSource, setMergeSource] = useState<SymptomRow | null>(null);
  const [mergeSearch, setMergeSearch] = useState("");
  const [search, setSearch] = useState("");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    setReportsError(false);
    const { data, error: err } = await supabase
      .from("symptom_reports" as any)
      .select("id, community_symptom_id, reporter_id, reason, details, created_at")
      .order("created_at", { ascending: false });
    if (err) {
      setReportsError(true);
      setReportsLoading(false);
      return;
    }
    setReports((data ?? []) as unknown as ReportRow[]);
    setReportsLoading(false);
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const { data, error: err } = await supabase
      .from("community_symptoms")
      .select("id, name, status, canonical_id, submitted_by, added_by, created_at, category")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (err) {
      setError(true);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as SymptomRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Resolve submitter names for reported entries.
  useEffect(() => {
    const ids = Array.from(new Set(
      reports
        .map(r => rows.find(x => x.id === r.community_symptom_id))
        .map(row => row?.submitted_by ?? row?.added_by)
        .filter((v): v is string => !!v),
    ));
    const missing = ids.filter(id => !(id in names));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", missing);
      if (data?.length) {
        setNames(prev => ({ ...prev, ...Object.fromEntries(data.map(p => [p.id, p.full_name])) }));
      }
    })();
  }, [reports, rows, names]);

  const approved = useMemo(() => rows.filter(r => r.status === "approved"), [rows]);
  const clusters = useMemo(() => clusterSimilarNames(approved), [approved]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? approved.filter(r => r.name.toLowerCase().includes(q)) : approved;
  }, [approved, search]);

  const mergeInto = async (target: SymptomRow) => {
    if (!mergeSource) return;
    const source = mergeSource;
    setBusyId(source.id);
    const { error: err } = await supabase
      .from("community_symptoms")
      .update({ status: "merged", canonical_id: target.id })
      .eq("id", source.id);

    if (!err) {
      // Record the merged wording as an alias on the surviving entry so future
      // submissions fuzzy-match against it.
      const { data: existing } = await supabase
        .from("community_symptoms").select("aliases").eq("id", target.id).maybeSingle();
      const merged = Array.from(new Set([...(existing?.aliases ?? []), source.name]));
      await supabase.from("community_symptoms").update({ aliases: merged }).eq("id", target.id);
    }
    setBusyId(null);
    if (err) {
      toast({ title: "Couldn't merge", description: err.message, variant: "destructive" });
      return;
    }
    setRows(prev => prev.map(r => (r.id === source.id ? { ...r, status: "merged", canonical_id: target.id } : r)));
    setMergeSource(null);
    setMergeSearch("");
    toast({ title: "Merged", description: `"${source.name}" → "${target.name}"` });
  };

  const mergeCandidates = useMemo(() => {
    const q = mergeSearch.trim().toLowerCase();
    return approved
      .filter(r => r.id !== mergeSource?.id)
      .filter(r => (q ? r.name.toLowerCase().includes(q) : true))
      .slice(0, 40);
  }, [approved, mergeSearch, mergeSource]);

  const reportedGroups = useMemo(() => {
    const byId = new Map<string, ReportRow[]>();
    reports.forEach(r => {
      byId.set(r.community_symptom_id, [...(byId.get(r.community_symptom_id) ?? []), r]);
    });
    return Array.from(byId.entries())
      .map(([id, list]) => ({ row: rows.find(r => r.id === id), list }))
      .filter((g): g is { row: SymptomRow; list: ReportRow[] } => !!g.row)
      .sort((a, b) => b.list.length - a.list.length);
  }, [reports, rows]);

  const removeReported = async (row: SymptomRow) => {
    setBusyId(row.id);
    const { error: err } = await supabase
      .from("community_symptoms").update({ status: "deprecated" }).eq("id", row.id);
    if (!err) {
      await supabase.from("symptom_reports" as any).delete().eq("community_symptom_id", row.id);
    }
    setBusyId(null);
    if (err) {
      toast({ title: "Couldn't remove", description: err.message, variant: "destructive" });
      return;
    }
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, status: "deprecated" } : r)));
    setReports(prev => prev.filter(r => r.community_symptom_id !== row.id));
    toast({ title: "Removed", description: `"${row.name}" no longer appears in the picker.` });
  };

  const dismissReports = async (row: SymptomRow) => {
    setBusyId(row.id);
    const { error: err } = await supabase
      .from("symptom_reports" as any).delete().eq("community_symptom_id", row.id);
    setBusyId(null);
    if (err) {
      toast({ title: "Couldn't dismiss", description: err.message, variant: "destructive" });
      return;
    }
    setReports(prev => prev.filter(r => r.community_symptom_id !== row.id));
    toast({ title: "Reports dismissed", description: `"${row.name}" stays live.` });
  };

  const SkeletonRows = () => (
    <div className="space-y-2">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg border border-border bg-card">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );

  const ErrorState = () => (
    <div className="px-4 py-8 rounded-lg border border-border bg-card text-center space-y-3">
      <p className="text-sm text-muted-foreground">Couldn't load the symptom library.</p>
      <Button variant="outline" size="sm" onClick={load} className="gap-2">
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </Button>
    </div>
  );

  const mergeButton = (row: SymptomRow) => (
    <Button
      size="sm"
      variant="outline"
      className="h-8 gap-1.5 text-xs shrink-0"
      disabled={busyId === row.id}
      onClick={() => { setMergeSource(row); setMergeSearch(""); }}
    >
      <Merge className="w-3.5 h-3.5" /> Merge
    </Button>
  );

  return (
    <div className="space-y-4">
      <Tabs defaultValue="cleanup" className="space-y-4">
        <TabsList className="bg-muted border border-border">
          <TabsTrigger value="cleanup">Cleanup{clusters.length ? ` · ${clusters.length}` : ""}</TabsTrigger>
          <TabsTrigger value="reported">Reported{reportedGroups.length ? ` · ${reportedGroups.length}` : ""}</TabsTrigger>
          <TabsTrigger value="all">All{approved.length ? ` · ${approved.length}` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="cleanup" className="space-y-3">
          {loading ? <SkeletonRows /> : error ? <ErrorState /> : clusters.length === 0 ? (
            <div className="px-4 py-10 rounded-lg border border-border bg-card text-center">
              <p className="text-sm text-muted-foreground">No overlapping symptoms found.</p>
            </div>
          ) : (
            clusters.map(group => (
              <div key={group[0].id} className="rounded-lg border border-border bg-card">
                <p className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  Possible overlap · {group.length}
                </p>
                <div className="divide-y divide-border">
                  {group.map(row => (
                    <div key={row.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate">{row.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {row.category ?? "Uncategorised"} · {format(new Date(row.created_at), "MMM d, yyyy")}
                        </p>
                      </div>
                      {mergeButton(row)}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="reported" className="space-y-3">
          {reportsLoading || loading ? <SkeletonRows /> : reportsError || error ? (
            <div className="px-4 py-8 rounded-lg border border-border bg-card text-center space-y-3">
              <p className="text-sm text-muted-foreground">Failed to load reports.</p>
              <Button variant="outline" size="sm" onClick={() => { load(); loadReports(); }} className="gap-2">
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </Button>
            </div>
          ) : reportedGroups.length === 0 ? (
            <div className="px-4 py-10 rounded-lg border border-border bg-card text-center">
              <p className="text-sm text-muted-foreground">No reports right now.</p>
            </div>
          ) : (
            reportedGroups.map(({ row, list }) => {
              const submitter = row.submitted_by ?? row.added_by;
              return (
                <div key={row.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Flag className="w-3.5 h-3.5 text-destructive shrink-0" />
                        <span className="truncate">{row.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {list.length} report{list.length !== 1 ? "s" : ""}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        Added by {names[submitter] ?? "Unknown"} · {format(new Date(row.created_at), "MMM d, yyyy")}
                        {row.status !== "approved" ? ` · ${row.status}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                        disabled={busyId === row.id} onClick={() => dismissReports(row)}
                      >
                        <Check className="w-3.5 h-3.5" /> Dismiss
                      </Button>
                      <Button
                        size="sm" variant="destructive" className="h-8 gap-1.5 text-xs"
                        disabled={busyId === row.id} onClick={() => removeReported(row)}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1 border-t border-border pt-2">
                    {list.map(r => (
                      <p key={r.id} className="text-xs text-muted-foreground">
                        <span className="text-foreground/80">{REPORT_REASON_LABEL[r.reason] ?? r.reason}</span>
                        {r.details ? ` — ${r.details}` : ""}
                        {" · "}{format(new Date(r.created_at), "MMM d, yyyy")}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-2">
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search live symptoms…"
            className="h-9 text-sm"
          />
          {loading ? <SkeletonRows /> : error ? <ErrorState /> : filtered.length === 0 ? (
            <div className="px-4 py-10 rounded-lg border border-border bg-card text-center">
              <p className="text-sm text-muted-foreground">No symptoms match that search.</p>
            </div>
          ) : (
            filtered.slice(0, 200).map(row => (
              <div key={row.id} className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg border border-border bg-card">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{row.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {row.category ?? "Uncategorised"} · {format(new Date(row.created_at), "MMM d, yyyy")}
                  </p>
                </div>
                {mergeButton(row)}
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!mergeSource} onOpenChange={(o) => { if (!o) { setMergeSource(null); setMergeSearch(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Merge "{mergeSource?.name}"</DialogTitle>
            <DialogDescription>
              Pick the entry that survives. Existing logs keep their wording and resolve to the surviving entry.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={mergeSearch}
            onChange={e => setMergeSearch(e.target.value)}
            placeholder="Search live symptoms…"
            className="h-9 text-sm"
          />
          <div className="max-h-72 overflow-y-auto space-y-1">
            {mergeCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No matching entries.</p>
            ) : mergeCandidates.map(c => (
              <button
                key={c.id}
                onClick={() => mergeInto(c)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm text-foreground"
              >
                {c.name}
                <span className="ml-2 text-xs text-muted-foreground">{c.category ?? "Uncategorised"}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
