import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { onboardedProfiles } from "@/lib/onboardedUsers";
import { fetchReferredSignups, referralCountsByReferrer } from "@/lib/referralCounts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Trophy, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// Same 30-minute inactivity gap used by Overview's Sessions / Total Time Spent.
const SESSION_GAP_MS = 30 * 60 * 1000;
const PAGE = 1000;
const BATCH = 20;

type Metric = "messages" | "time" | "sessions" | "referrals";

const METRIC_LABEL: Record<Metric, string> = {
  messages: "Messages sent",
  time: "Time spent",
  sessions: "Sessions",
  referrals: "Referrals made",
};

interface Row {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  messages: number;
  timeMin: number;
  sessions: number;
  referrals: number;
}

async function fetchAll<T>(
  table: "chat_messages" | "user_activity_events",
  columns: string,
  filter?: (q: any) => any,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).order("created_at", { ascending: true }).range(from, from + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    const chunk = (data ?? []) as unknown as T[];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return out;
}

const fmtDuration = (min: number) => {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

export const UsersLeaderboard = () => {
  const [metric, setMetric] = useState<Metric>("messages");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(BATCH);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profilesRes, msgs, activity, referred] = await Promise.all([
        onboardedProfiles().select("id, full_name, email, created_at"),
        fetchAll<{ user_id: string; created_at: string }>("chat_messages", "user_id, created_at", (q) =>
          q.eq("role", "user"),
        ),
        fetchAll<{ user_id: string; created_at: string }>("user_activity_events", "user_id, created_at"),
        // Reuses the Referrals panel's exact population — no second count.
        fetchReferredSignups(),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      const profiles = (profilesRes.data ?? []) as {
        id: string; full_name: string | null; email: string | null; created_at: string;
      }[];

      const msgCount = new Map<string, number>();
      const tsByUser = new Map<string, number[]>();
      const push = (uid: string, iso: string) => {
        if (!uid) return;
        const arr = tsByUser.get(uid) ?? [];
        arr.push(new Date(iso).getTime());
        tsByUser.set(uid, arr);
      };
      for (const m of msgs) {
        if (!m.user_id) continue;
        msgCount.set(m.user_id, (msgCount.get(m.user_id) ?? 0) + 1);
        push(m.user_id, m.created_at);
      }
      for (const a of activity) push(a.user_id, a.created_at);

      // Per-user session reconstruction: overlapping tabs/devices merge into
      // one timeline, and an abandoned session ends at its last event.
      const sessionStats = new Map<string, { sessions: number; timeMin: number }>();
      for (const [uid, times] of tsByUser) {
        times.sort((a, b) => a - b);
        let sessions = 1;
        let total = 0;
        let start = times[0];
        let end = times[0];
        for (let i = 1; i < times.length; i++) {
          if (times[i] - times[i - 1] > SESSION_GAP_MS) {
            total += Math.max(1, Math.round((end - start) / 60000));
            sessions++;
            start = times[i];
          }
          end = times[i];
        }
        total += Math.max(1, Math.round((end - start) / 60000));
        sessionStats.set(uid, { sessions, timeMin: total });
      }

      const refCounts = referralCountsByReferrer(referred);

      setRows(
        profiles.map((p) => ({
          id: p.id,
          name: p.full_name || "Unnamed",
          email: p.email || "—",
          joinedAt: p.created_at,
          messages: msgCount.get(p.id) ?? 0,
          timeMin: sessionStats.get(p.id)?.timeMin ?? 0,
          sessions: sessionStats.get(p.id)?.sessions ?? 0,
          referrals: refCounts.get(p.id) ?? 0,
        })),
      );
    } catch (err) {
      console.error("Leaderboard load error:", err);
      setError(err instanceof Error ? err.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setVisible(BATCH); }, [metric]);

  const valueOf = (r: Row) =>
    metric === "messages" ? r.messages : metric === "time" ? r.timeMin : metric === "sessions" ? r.sessions : r.referrals;

  const sorted = useMemo(() => {
    // Ties break on signup date (oldest first) so ordering never jitters.
    return [...rows].sort((a, b) => {
      const d = valueOf(b) - valueOf(a);
      if (d !== 0) return d;
      return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
    });
  }, [rows, metric]);

  const shown = sorted.slice(0, visible);

  const rankClass = (i: number) =>
    i === 0 ? "bg-primary/10" : i === 1 ? "bg-primary/5" : i === 2 ? "bg-muted/40" : "";

  return (
    <Card className="bg-card border-border flex flex-col max-h-[40rem]">
      <CardHeader className="sticky top-0 z-10 bg-card rounded-t-lg border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            Leaderboard
          </CardTitle>
          <span className="text-xs text-muted-foreground">All time · {rows.length} users</span>
        </div>
        <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
          <TabsList>
            {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
              <TabsTrigger key={m} value={m}>{METRIC_LABEL[m]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="overflow-y-auto flex-1 pt-4">
        {error ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm text-destructive">Failed to load leaderboard.</p>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="w-3.5 h-3.5 mr-2" /> Retry
            </Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right w-40">{METRIC_LABEL[metric]}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-6" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  : shown.map((r, i) => (
                      <TableRow key={r.id} className={cn(rankClass(i))}>
                        <TableCell className="tabular-nums font-medium">
                          {i < 3 ? (
                            <Badge variant={i === 0 ? "default" : "secondary"} className="tabular-nums">{i + 1}</Badge>
                          ) : (
                            <span className="text-muted-foreground">{i + 1}</span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-0">
                          <div className="font-medium text-foreground truncate">{r.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-foreground">
                          {metric === "time" ? fmtDuration(r.timeMin) : valueOf(r)}
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
            {!loading && shown.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">No users yet.</p>
            )}
            {!loading && sorted.length > shown.length && (
              <div className="pt-4 text-center">
                <Button variant="outline" size="sm" onClick={() => setVisible((n) => n + BATCH)}>
                  Load more ({sorted.length - shown.length} more)
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
