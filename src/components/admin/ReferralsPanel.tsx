import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface ReferrerRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  referral_code: string | null;
  count: number;
  recent: { email: string | null; created_at: string }[];
}

export const ReferralsPanel = () => {
  const [rows, setRows] = useState<ReferrerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalReferred, setTotalReferred] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Pull all profiles that were referred by someone
        const { data: referred } = await supabase
          .from("profiles")
          .select("id, email, created_at, referred_by")
          .not("referred_by", "is", null)
          .order("created_at", { ascending: false })
          .limit(5000);

        const referredList = (referred ?? []) as Array<{
          id: string; email: string | null; created_at: string; referred_by: string;
        }>;

        setTotalReferred(referredList.length);

        const byReferrer = new Map<string, { email: string | null; created_at: string }[]>();
        for (const r of referredList) {
          if (!byReferrer.has(r.referred_by)) byReferrer.set(r.referred_by, []);
          byReferrer.get(r.referred_by)!.push({ email: r.email, created_at: r.created_at });
        }

        const referrerIds = Array.from(byReferrer.keys());
        if (referrerIds.length === 0) {
          setRows([]);
          return;
        }

        const { data: referrers } = await supabase
          .from("profiles")
          .select("id, full_name, email, referral_code")
          .in("id", referrerIds);

        const referrerMap = new Map((referrers ?? []).map((r: any) => [r.id, r]));

        const merged: ReferrerRow[] = referrerIds.map((id) => {
          const ref = referrerMap.get(id) as any;
          const signups = byReferrer.get(id) ?? [];
          return {
            user_id: id,
            full_name: ref?.full_name ?? null,
            email: ref?.email ?? null,
            referral_code: ref?.referral_code ?? null,
            count: signups.length,
            recent: signups.slice(0, 5),
          };
        }).sort((a, b) => b.count - a.count);

        setRows(merged);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">Referrals</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          {loading ? "Loading…" : `${totalReferred} signup${totalReferred === 1 ? "" : "s"} from ${rows.length} referrer${rows.length === 1 ? "" : "s"}`}
        </p>
      </CardHeader>
      <CardContent>
        {!loading && rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No referrals yet. Share your link from Settings.</p>
        ) : (
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
              {rows.map((r) => (
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
        )}
      </CardContent>
    </Card>
  );
};
