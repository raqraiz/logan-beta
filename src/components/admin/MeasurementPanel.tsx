import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Row {
  week: string; insights_shown: number; insights_confirmed: number; insights_not_confirmed: number;
  insights_corrected: number; headsups_sent: number; active_user_days: number; active_users: number;
}

const COLS: [keyof Row, string][] = [
  ["insights_shown", "Insights shown"],
  ["insights_confirmed", "Confirmed"],
  ["insights_not_confirmed", "Not confirmed"],
  ["insights_corrected", "Corrected"],
  ["headsups_sent", "Heads-ups sent"],
  ["active_users", "Users chatting"],
  ["active_user_days", "User-days with a chat"],
];

export function MeasurementPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("admin_measurement_weekly", { _weeks: 8 }).then(({ data, error }) => {
      if (error) setError(error.message); else setRows((data ?? []) as Row[]);
    });
  }, []);

  return (
    <Card className="bg-card/60 backdrop-blur border-border/40">
      <CardHeader>
        <CardTitle className="text-base">Measurement (weekly)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Shown/corrected tracking started Oct 2, 2026. Confirmed includes thumbs up; not confirmed includes thumbs down. Heads-ups sent counts taps on Send/Share, not delivery. Doctor summaries aren't built yet.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!rows && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {rows && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Week of</th>
                {COLS.map(([, l]) => <th key={l} className="py-1 pr-3 font-medium text-right">{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.week} className="border-t border-border/30">
                  <td className="py-1 pr-3">{r.week}</td>
                  {COLS.map(([k]) => <td key={k} className="py-1 pr-3 text-right tabular-nums">{Number(r[k])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
