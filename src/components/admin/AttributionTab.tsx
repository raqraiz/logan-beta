import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { UtmLinkBuilder } from "./UtmLinkBuilder";
import { SavedCampaignLinks } from "./SavedCampaignLinks";

type Range = "7d" | "30d" | "90d" | "all";

interface Signup {
  id: string;
  email: string | null;
  created_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  landing_path: string | null;
}

const rangeToSince = (r: Range): string | null => {
  if (r === "all") return null;
  const days = r === "7d" ? 7 : r === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
};

const NONE = "(direct / none)";
const display = (v: string | null) => (v && v.trim() ? v : NONE);

const csvEscape = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const AttributionTab = () => {
  const [range, setRange] = useState<Range>("30d");
  const [groupBy, setGroupBy] = useState<"utm_source" | "utm_campaign" | "utm_medium">("utm_source");
  const [rows, setRows] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("profiles")
        .select("id, email, created_at, utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, landing_path")
        .order("created_at", { ascending: false })
        .limit(5000);

      const since = rangeToSince(range);
      if (since) q = q.gte("created_at", since);

      const { data, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as Signup[]);
    } catch (e) {
      console.error(e);
      toast({ title: "Couldn't load signups", description: e instanceof Error ? e.message : "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range]);

  // Group by primary key + secondary breakdown
  const grouped = useMemo(() => {
    const byPrimary = new Map<string, { primary: string; total: number; breakdown: Map<string, number> }>();
    const secondaryKey: keyof Signup =
      groupBy === "utm_source" ? "utm_campaign" : groupBy === "utm_campaign" ? "utm_source" : "utm_source";

    for (const r of rows) {
      const primary = display(r[groupBy] as string | null);
      const secondary = display(r[secondaryKey] as string | null);
      if (!byPrimary.has(primary)) byPrimary.set(primary, { primary, total: 0, breakdown: new Map() });
      const entry = byPrimary.get(primary)!;
      entry.total += 1;
      entry.breakdown.set(secondary, (entry.breakdown.get(secondary) ?? 0) + 1);
    }

    return Array.from(byPrimary.values())
      .map((e) => ({
        ...e,
        breakdown: Array.from(e.breakdown.entries())
          .map(([k, v]) => ({ key: k, count: v }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.total - a.total);
  }, [rows, groupBy]);

  const total = rows.length;

  const exportCsv = () => {
    const header = [
      "id", "email", "created_at",
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "referrer", "landing_path",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(header.map((h) => csvEscape((r as any)[h])).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signups-attribution-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const secondaryLabel =
    groupBy === "utm_source" ? "Top campaigns" : groupBy === "utm_campaign" ? "Top sources" : "Top sources";

  return (
    <div className="space-y-6">
      <UtmLinkBuilder />

      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-foreground">Signup attribution</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {loading ? "Loading…" : `${total} signup${total === 1 ? "" : "s"} in selected range`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="utm_source">Group by source</SelectItem>
                <SelectItem value="utm_medium">Group by medium</SelectItem>
                <SelectItem value="utm_campaign">Group by campaign</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" onClick={exportCsv} disabled={!rows.length}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {grouped.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No signups in this range yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{groupBy.replace("utm_", "").replace(/^./, (c) => c.toUpperCase())}</TableHead>
                  <TableHead className="w-24 text-right">Signups</TableHead>
                  <TableHead className="w-24 text-right">Share</TableHead>
                  <TableHead>{secondaryLabel}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.map((g) => (
                  <TableRow key={g.primary}>
                    <TableCell className="font-medium text-foreground">{g.primary}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.total}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {total ? ((g.total / total) * 100).toFixed(1) : "0.0"}%
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {g.breakdown.slice(0, 4).map((b) => `${b.key} (${b.count})`).join(" · ")}
                      {g.breakdown.length > 4 ? " …" : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground text-base">Recent signups</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Medium</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Referrer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 50).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm">{r.email ?? "—"}</TableCell>
                    <TableCell className="text-sm">{display(r.utm_source)}</TableCell>
                    <TableCell className="text-sm">{display(r.utm_medium)}</TableCell>
                    <TableCell className="text-sm">{display(r.utm_campaign)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[240px]">
                      {r.referrer || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
