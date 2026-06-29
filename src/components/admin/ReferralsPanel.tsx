import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface ReferredSignup {
  id: string;
  email: string | null;
  created_at: string;
  referred_by: string;
}

interface ReferrerRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  referral_code: string | null;
  count: number;
  recent: { email: string | null; created_at: string }[];
}

interface WeekRow {
  weekStart: Date;
  weekEnd: Date;
  total: number;
  byReferrer: Map<string, { count: number; signups: { email: string | null; created_at: string }[] }>;
}

// Monday-start week
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  return x;
}

function fmtRange(start: Date, end: Date) {
  const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString(undefined, o)} – ${end.toLocaleDateString(undefined, o)}`;
}

export const ReferralsPanel = () => {
  const [referred, setReferred] = useState<ReferredSignup[]>([]);
  const [referrerMap, setReferrerMap] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("profiles")
          .select("id, email, created_at, referred_by")
          .not("referred_by", "is", null)
          .order("created_at", { ascending: false })
          .limit(5000);

        const list = (data ?? []) as ReferredSignup[];
        setReferred(list);

        const ids = Array.from(new Set(list.map((r) => r.referred_by)));
        if (ids.length) {
          const { data: refs } = await supabase
            .from("profiles")
            .select("id, full_name, email, referral_code")
            .in("id", ids);
          setReferrerMap(new Map((refs ?? []).map((r: any) => [r.id, r])));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const referrerRows = useMemo<ReferrerRow[]>(() => {
    const byRef = new Map<string, ReferredSignup[]>();
    for (const r of referred) {
      if (!byRef.has(r.referred_by)) byRef.set(r.referred_by, []);
      byRef.get(r.referred_by)!.push(r);
    }
    return Array.from(byRef.entries())
      .map(([id, signups]) => {
        const ref = referrerMap.get(id);
        return {
          user_id: id,
          full_name: ref?.full_name ?? null,
          email: ref?.email ?? null,
          referral_code: ref?.referral_code ?? null,
          count: signups.length,
          recent: signups.slice(0, 5).map((s) => ({ email: s.email, created_at: s.created_at })),
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [referred, referrerMap]);

  const weekRows = useMemo<WeekRow[]>(() => {
    const byWeek = new Map<number, WeekRow>();
    for (const r of referred) {
      const ws = startOfWeek(new Date(r.created_at));
      const key = ws.getTime();
      if (!byWeek.has(key)) {
        const we = new Date(ws);
        we.setDate(we.getDate() + 6);
        byWeek.set(key, { weekStart: ws, weekEnd: we, total: 0, byReferrer: new Map() });
      }
      const wk = byWeek.get(key)!;
      wk.total += 1;
      if (!wk.byReferrer.has(r.referred_by)) {
        wk.byReferrer.set(r.referred_by, { count: 0, signups: [] });
      }
      const b = wk.byReferrer.get(r.referred_by)!;
      b.count += 1;
      b.signups.push({ email: r.email, created_at: r.created_at });
    }
    return Array.from(byWeek.values()).sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
  }, [referred]);

  const maxWeek = useMemo(() => Math.max(1, ...weekRows.map((w) => w.total)), [weekRows]);

  const totalReferred = referred.length;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">Referrals</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          {loading
            ? "Loading…"
            : `${totalReferred} signup${totalReferred === 1 ? "" : "s"} from ${referrerRows.length} referrer${referrerRows.length === 1 ? "" : "s"}`}
        </p>
      </CardHeader>
      <CardContent>
        {!loading && referred.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No referrals yet. Share your link from Settings.</p>
        ) : (
          <Tabs defaultValue="weekly" className="space-y-4">
            <TabsList>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="referrer">By referrer</TabsTrigger>
            </TabsList>

            <TabsContent value="weekly">
              <div className="space-y-6">
                {weekRows.map((w) => {
                  const groups = Array.from(w.byReferrer.entries())
                    .map(([id, v]) => ({
                      id,
                      ref: referrerMap.get(id),
                      count: v.count,
                      signups: [...v.signups].sort(
                        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                      ),
                    }))
                    .sort((a, b) => b.count - a.count);
                  return (
                    <div key={w.weekStart.toISOString()} className="space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-baseline gap-3">
                          <h3 className="font-medium text-foreground">{fmtRange(w.weekStart, w.weekEnd)}</h3>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {w.total} signup{w.total === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="h-1.5 w-32 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${(w.total / maxWeek) * 100}%` }} />
                        </div>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Referrer</TableHead>
                            <TableHead>Brought in</TableHead>
                            <TableHead className="text-right w-20">Count</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {groups.map((g) => (
                            <TableRow key={g.id}>
                              <TableCell className="font-medium text-foreground align-top whitespace-nowrap">
                                {g.ref?.full_name ?? g.ref?.email ?? "Unknown"}
                                {g.ref?.referral_code && (
                                  <Badge variant="outline" className="font-mono ml-2 text-[10px]">
                                    {g.ref.referral_code}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {g.signups
                                  .map((s) => `${s.email ?? "anon"} (${new Date(s.created_at).toLocaleDateString()})`)
                                  .join(" · ")}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="referrer">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referrer</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right w-24">Signups</TableHead>
                    <TableHead>Recent signups</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrerRows.map((r) => (
                    <TableRow key={r.user_id}>
                      <TableCell className="font-medium text-foreground">{r.full_name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{r.email ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {r.referral_code ? <Badge variant="outline" className="font-mono">{r.referral_code}</Badge> : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.recent.map((s) => `${s.email ?? "anon"} (${new Date(s.created_at).toLocaleDateString()})`).join(" · ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
};
