import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Search, Mail, MailOpen, AlertTriangle } from "lucide-react";
import { PolicyUpdateSender } from "./PolicyUpdateSender";
import { formatDistanceToNow } from "date-fns";

interface LogRow {
  message_id: string;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface OpenRow {
  message_id: string;
  opened_at: string;
}

interface Row {
  message_id: string;
  recipient_email: string;
  template_name: string;
  status: string;
  error_message: string | null;
  sent_at: string;
  first_opened_at: string | null;
  open_count: number;
}

const STATUS_PRIORITY: Record<string, number> = {
  sent: 5,
  bounced: 4,
  dlq: 4,
  failed: 4,
  suppressed: 3,
  pending: 2,
};

export const EmailsTab = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    try {
      const { data: logs } = await supabase
        .from("email_send_log")
        .select("message_id, template_name, recipient_email, status, error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(2000);

      // Dedupe by message_id, keeping the row with highest status priority
      // (fallback: latest by created_at, which is the first occurrence given desc order)
      const latest = new Map<string, LogRow>();
      for (const r of (logs ?? []) as LogRow[]) {
        const existing = latest.get(r.message_id);
        if (!existing) {
          latest.set(r.message_id, r);
          continue;
        }
        const newP = STATUS_PRIORITY[r.status] ?? 0;
        const oldP = STATUS_PRIORITY[existing.status] ?? 0;
        if (newP > oldP) latest.set(r.message_id, r);
      }

      const msgIds = Array.from(latest.keys());
      const opensByMsg = new Map<string, OpenRow[]>();
      if (msgIds.length) {
        // chunk to avoid URL length limits
        for (let i = 0; i < msgIds.length; i += 200) {
          const chunk = msgIds.slice(i, i + 200);
          const { data: opens } = await supabase
            .from("email_opens")
            .select("message_id, opened_at")
            .in("message_id", chunk)
            .order("opened_at", { ascending: true });
          for (const o of (opens ?? []) as OpenRow[]) {
            const arr = opensByMsg.get(o.message_id) ?? [];
            arr.push(o);
            opensByMsg.set(o.message_id, arr);
          }
        }
      }

      const built: Row[] = Array.from(latest.values()).map((r) => {
        const opens = opensByMsg.get(r.message_id) ?? [];
        return {
          message_id: r.message_id,
          recipient_email: r.recipient_email,
          template_name: r.template_name,
          status: r.status,
          error_message: r.error_message,
          sent_at: r.created_at,
          first_opened_at: opens[0]?.opened_at ?? null,
          open_count: opens.length,
        };
      });
      built.sort((a, b) => +new Date(b.sent_at) - +new Date(a.sent_at));
      setRows(built);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const templates = useMemo(
    () => Array.from(new Set(rows.map((r) => r.template_name))).sort(),
    [rows]
  );

  const filtered = rows.filter((r) => {
    if (templateFilter !== "all" && r.template_name !== templateFilter) return false;
    if (statusFilter !== "all") {
      if (statusFilter === "failed") {
        if (!(r.status === "dlq" || r.status === "failed" || r.status === "bounced")) return false;
      } else if (r.status !== statusFilter) return false;
    }
    if (search && !r.recipient_email?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalSent = filtered.filter((r) => r.status === "sent").length;
  const totalOpened = filtered.filter((r) => r.first_opened_at).length;
  const totalFailed = filtered.filter(
    (r) => r.status === "dlq" || r.status === "failed" || r.status === "bounced"
  ).length;
  const totalPending = filtered.filter((r) => r.status === "pending").length;
  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <Mail className="w-3.5 h-3.5" /> Delivered
          </div>
          <div className="text-2xl font-semibold mt-1">{totalSent}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <MailOpen className="w-3.5 h-3.5" /> Opened
          </div>
          <div className="text-2xl font-semibold mt-1">{totalOpened}</div>
        </Card>
        <Card className="p-4">
          <div className="text-muted-foreground text-xs uppercase tracking-wider">Open rate</div>
          <div className="text-2xl font-semibold mt-1">{openRate}%</div>
        </Card>
        <Card className="p-4">
          <div className="text-muted-foreground text-xs uppercase tracking-wider">Pending</div>
          <div className="text-2xl font-semibold mt-1">{totalPending}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
            <AlertTriangle className="w-3.5 h-3.5" /> Failed
          </div>
          <div className="text-2xl font-semibold mt-1">{totalFailed}</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h3 className="font-semibold text-foreground">Email audit log</h3>
            <p className="text-xs text-muted-foreground">
              Every outbound email is recorded. Opens require images enabled in the recipient's client.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={templateFilter} onValueChange={setTemplateFilter}>
              <SelectTrigger className="w-44 h-9">
                <SelectValue placeholder="Template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All templates</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="suppressed">Suppressed</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email…"
                className="pl-8 w-56 h-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-medium">Recipient</th>
                <th className="py-2 pr-3 font-medium">Template</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Opened</th>
                <th className="py-2 pr-3 font-medium">Sent</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const failed = r.status === "dlq" || r.status === "failed" || r.status === "bounced";
                const suppressed = r.status === "suppressed";
                const pending = r.status === "pending";
                return (
                  <tr key={r.message_id} className="border-b border-border/50">
                    <td className="py-2 pr-3">{r.recipient_email}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.template_name}</td>
                    <td className="py-2 pr-3">
                      <Badge
                        variant="outline"
                        className={
                          failed
                            ? "border-destructive/40 text-destructive"
                            : suppressed
                            ? "border-yellow-500/40 text-yellow-600"
                            : pending
                            ? "border-muted-foreground/40 text-muted-foreground"
                            : "border-emerald-500/40 text-emerald-600"
                        }
                      >
                        {r.status}
                      </Badge>
                      {r.error_message && (
                        <div
                          className="text-xs text-muted-foreground mt-1 max-w-xs truncate"
                          title={r.error_message}
                        >
                          {r.error_message}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {r.first_opened_at ? (
                        <span className="text-emerald-600">
                          {formatDistanceToNow(new Date(r.first_opened_at), { addSuffix: true })}
                          {r.open_count > 1 && (
                            <span className="text-muted-foreground"> · {r.open_count}×</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {formatDistanceToNow(new Date(r.sent_at), { addSuffix: true })}
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && !loading && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No emails match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
