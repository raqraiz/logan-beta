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
import { Check, Merge, RefreshCw, X } from "lucide-react";
import { format } from "date-fns";
import { clusterSimilarNames } from "@/lib/symptomModeration";

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

export function SymptomReviewTab() {
  const [rows, setRows] = useState<SymptomRow[]>([]);
  const [submitters, setSubmitters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mergeSource, setMergeSource] = useState<SymptomRow | null>(null);
  const [mergeSearch, setMergeSearch] = useState("");

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
    const list = (data ?? []) as SymptomRow[];
    setRows(list);

    const ids = Array.from(new Set(list.map(r => r.submitted_by ?? r.added_by).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p.full_name || p.email || p.id.slice(0, 8); });
      setSubmitters(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => rows.filter(r => r.status === "pending"), [rows]);
  const approved = useMemo(() => rows.filter(r => r.status === "approved"), [rows]);
  const clusters = useMemo(() => clusterSimilarNames(approved), [approved]);

  const submitterLabel = (r: SymptomRow) => {
    const uid = r.submitted_by ?? r.added_by;
    return (uid && submitters[uid]) || "Unknown";
  };

  const setStatus = async (row: SymptomRow, status: "approved" | "rejected") => {
    setBusyId(row.id);
    const { error: err } = await supabase
      .from("community_symptoms")
      .update({ status, canonical_id: null })
      .eq("id", row.id);
    setBusyId(null);
    if (err) {
      toast({ title: "Couldn't update", description: err.message, variant: "destructive" });
      return;
    }
    setRows(prev => prev.map(r => (r.id === row.id ? { ...r, status, canonical_id: null } : r)));
    toast({ title: status === "approved" ? "Approved" : "Rejected", description: row.name });
  };

  const mergeInto = async (target: SymptomRow) => {
    if (!mergeSource) return;
    const source = mergeSource;
    setBusyId(source.id);
    const nextAliases = Array.from(new Set([source.name]));
    const { error: err } = await supabase
      .from("community_symptoms")
      .update({ status: "merged", canonical_id: target.id })
      .eq("id", source.id);

    if (!err) {
      // Record the merged wording as an alias on the surviving entry so future
      // submissions fuzzy-match against it.
      const { data: existing } = await supabase
        .from("community_symptoms").select("aliases").eq("id", target.id).maybeSingle();
      const merged = Array.from(new Set([...(existing?.aliases ?? []), ...nextAliases]));
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

  const rowActions = (row: SymptomRow) => (
    <div className="flex items-center gap-1.5 shrink-0">
      {row.status === "pending" && (
        <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={busyId === row.id} onClick={() => setStatus(row, "approved")}>
          <Check className="w-3.5 h-3.5" /> Approve
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 text-xs"
        disabled={busyId === row.id}
        onClick={() => { setMergeSource(row); setMergeSearch(""); }}
      >
        <Merge className="w-3.5 h-3.5" /> Merge
      </Button>
      {row.status === "pending" && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
          disabled={busyId === row.id}
          onClick={() => setStatus(row, "rejected")}
        >
          <X className="w-3.5 h-3.5" /> Reject
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="bg-muted border border-border">
          <TabsTrigger value="pending">Pending{pending.length ? ` · ${pending.length}` : ""}</TabsTrigger>
          <TabsTrigger value="cleanup">Cleanup{clusters.length ? ` · ${clusters.length}` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-2">
          {loading ? <SkeletonRows /> : error ? <ErrorState /> : pending.length === 0 ? (
            <div className="px-4 py-10 rounded-lg border border-border bg-card text-center">
              <p className="text-sm text-muted-foreground">No pending symptoms to review.</p>
            </div>
          ) : (
            pending.map(row => (
              <div key={row.id} className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg border border-border bg-card">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{row.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {submitterLabel(row)} · {format(new Date(row.created_at), "MMM d, yyyy")}
                  </p>
                </div>
                {rowActions(row)}
              </div>
            ))
          )}
        </TabsContent>

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
                      {rowActions(row)}
                    </div>
                  ))}
                </div>
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
            placeholder="Search approved symptoms…"
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
