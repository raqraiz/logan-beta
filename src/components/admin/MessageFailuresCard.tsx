import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";

/** Failed saves/sends of Logan messages, drafts, offers and check-ins in the last 7 days. */
export function MessageFailuresCard() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    supabase.from("message_failures").select("id", { count: "exact", head: true }).gte("created_at", since)
      .then(({ count }) => setCount(count ?? 0));
  }, []);
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <AlertTriangle className={`w-5 h-5 mx-auto mb-1 ${count ? "text-destructive" : "text-muted-foreground"}`} />
        <p className="text-2xl font-bold text-foreground">{count ?? "…"}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Message failures (7d)</p>
      </CardContent>
    </Card>
  );
}
