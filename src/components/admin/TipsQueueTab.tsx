import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface Row { id: string; symptom: string; text: string; label: string; status: string; report_count: number; reasons: string[]; created_at: string; author_tip_count: number }
const REASON: Record<string, string> = { unsafe: "Unsafe or harmful", off_topic: "Not about this symptom", advertising: "Advertising", other: "Something else" };

/** Tips waiting for review. Never shows who wrote a tip. */
export function TipsQueueTab() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const load = async () => {
    const [q, t] = await Promise.all([supabase.rpc("admin_tip_queue"), supabase.rpc("admin_tip_totals")]);
    if (q.error) { toast.error("Queue couldn't load"); return; }
    setRows((q.data ?? []) as Row[]);
    setTotals(Object.fromEntries(((t.data ?? []) as { status: string; total: number }[]).map((r) => [r.status, Number(r.total)])));
  };
  useEffect(() => { void load(); }, []);
  const act = async (id: string, action: "approve" | "remove" | "remove_author") => {
    if (action === "remove_author" && !confirm("Remove every tip from this author?")) return;
    const { data, error } = await supabase.rpc("admin_review_tip", { _tip_id: id, _action: action });
    if (error) { toast.error("That didn't save"); return; }
    toast(action === "remove_author" ? `Removed ${data} tips` : "Done");
    void load();
  };
  return <div className="space-y-4">
    <Card><CardHeader><CardTitle>Tips totals</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap gap-6 text-sm">
        {["approved", "pending", "rejected", "removed"].map((s) => <div key={s}><p className="text-2xl font-bold">{totals[s] ?? 0}</p><p className="text-muted-foreground capitalize">{s}</p></div>)}
      </CardContent>
    </Card>
    <Card><CardHeader><CardTitle>Review queue</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {!rows ? <p className="text-sm text-muted-foreground">Loading…</p> : !rows.length ? <p className="text-sm text-muted-foreground">Nothing to review.</p> : rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-border p-4">
            <p className="text-xs text-muted-foreground">{r.symptom} · {r.status === "pending" ? "Waiting for check" : `${r.report_count} reports`} · {new Date(r.created_at).toLocaleDateString()}</p>
            <p className="mt-2 text-sm">“{r.text}”</p>
            <p className="mt-1 text-xs text-muted-foreground">{r.label}{r.reasons.length ? ` · ${r.reasons.map((x) => REASON[x] ?? x).join(", ")}` : ""}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void act(r.id, "approve")}>Approve</Button>
              <Button size="sm" variant="outline" onClick={() => void act(r.id, "remove")}>Remove</Button>
              <Button size="sm" variant="outline" onClick={() => void act(r.id, "remove_author")}>Remove all tips from this author ({r.author_tip_count})</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  </div>;
}
