import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Info, ChevronDown, ChevronRight, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  referred_by: string | null;
};

type UserMetrics = {
  id: string;
  name: string;
  email: string;
  signupDate: string;
  symptomLogs: number;
  chatMessages: number;
  lastActive: string | null;
  active: boolean;
};

type ReferrerRow = {
  id: string;
  name: string;
  email: string;
  totalReferrals: number;
  activeReferrals: number;
  symptomLogs: number;
  chatMessages: number;
  engagementScore: number;
  lastActive: string | null;
  referred: UserMetrics[];
};

type SortKey = "totalReferrals" | "activeReferrals" | "engagementScore";

const PAGE = 1000;

async function fetchAll<T>(table: "profiles" | "chat_messages" | "symptom_logs", columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const chunk = (data ?? []) as unknown as T[];
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  return rows;
}

const fmtDate = (iso: string | null) => (iso ? format(new Date(iso), "MMM d, yyyy") : "—");

export const ReferralLeaderboardTab = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReferrerRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("engagementScore");
  const [sortDesc, setSortDesc] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [profiles, chats, symptoms] = await Promise.all([
          fetchAll<ProfileRow>("profiles", "id, full_name, email, created_at, referred_by"),
          fetchAll<{ user_id: string; created_at: string }>("chat_messages", "user_id, created_at"),
          fetchAll<{ user_id: string; created_at: string }>("symptom_logs", "user_id, created_at"),
        ]);

        const chatCount = new Map<string, number>();
        const symptomCount = new Map<string, number>();
        const lastActive = new Map<string, string>();
        const bump = (m: Map<string, number>, uid: string) => m.set(uid, (m.get(uid) ?? 0) + 1);
        const touch = (uid: string, ts: string) => {
          const prev = lastActive.get(uid);
          if (!prev || ts > prev) lastActive.set(uid, ts);
        };
        for (const c of chats) { if (!c.user_id) continue; bump(chatCount, c.user_id); touch(c.user_id, c.created_at); }
        for (const s of symptoms) { if (!s.user_id) continue; bump(symptomCount, s.user_id); touch(s.user_id, s.created_at); }

        const byId = new Map(profiles.map((p) => [p.id, p]));
        const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

        const groups = new Map<string, ProfileRow[]>();
        for (const p of profiles) {
          if (!p.referred_by) continue;
          const list = groups.get(p.referred_by) ?? [];
          list.push(p);
          groups.set(p.referred_by, list);
        }

        const result: ReferrerRow[] = [];
        for (const [referrerId, referredProfiles] of groups) {
          const referrer = byId.get(referrerId);
          const referred: UserMetrics[] = referredProfiles.map((p) => {
            const la = lastActive.get(p.id) ?? null;
            return {
              id: p.id,
              name: p.full_name || "Unnamed",
              email: p.email || "—",
              signupDate: p.created_at,
              symptomLogs: symptomCount.get(p.id) ?? 0,
              chatMessages: chatCount.get(p.id) ?? 0,
              lastActive: la,
              active: !!la && la >= cutoff,
            };
          });
          referred.sort(
            (a, b) => b.symptomLogs + b.chatMessages - (a.symptomLogs + a.chatMessages),
          );

          const symptomLogs = referred.reduce((s, r) => s + r.symptomLogs, 0);
          const chatMessages = referred.reduce((s, r) => s + r.chatMessages, 0);
          const last = referred
            .map((r) => r.lastActive)
            .filter((v): v is string => !!v)
            .sort()
            .pop() ?? null;

          result.push({
            id: referrerId,
            name: referrer?.full_name || "Unknown referrer",
            email: referrer?.email || "—",
            totalReferrals: referred.length,
            activeReferrals: referred.filter((r) => r.active).length,
            symptomLogs,
            chatMessages,
            engagementScore: symptomLogs + chatMessages,
            lastActive: last,
            referred,
          });
        }

        setRows(result);
      } catch (e) {
        console.error("Failed to load referral leaderboard:", e);
        setError(e instanceof Error ? e.message : "Failed to load referral data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDesc ? -diff : diff;
    });
    return copy;
  }, [rows, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(true); }
  };

  const toggleRow = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      <ArrowUpDown className={`w-3 h-3 ${sortKey === k ? "text-primary" : "opacity-40"}`} />
    </button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Referral Leaderboard
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="About referral counts" className="text-muted-foreground hover:text-foreground">
                  <Info className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Referral counts may undercount cross-device signups (e.g. WhatsApp browser → separate
                signup session). A fallback referral code entry field is planned to close this gap.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Ranked by engagement score (symptom logs + chat messages across all referred users). Active =
          any activity in the last 14 days.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading referrals…
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">{error}</p>
        ) : sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No referrals recorded yet</p>
        ) : (
          <div className="overflow-x-auto overflow-y-auto max-h-[70vh] relative">
            <Table>
              <TableHeader className="sticky top-0 z-20 bg-card [&_tr]:border-b">
                <TableRow className="bg-card hover:bg-card">
                  <TableHead className="w-8 bg-card" />
                  <TableHead className="bg-card">Referrer</TableHead>
                  <TableHead className="text-right bg-card"><SortHeader label="Referrals" k="totalReferrals" /></TableHead>
                  <TableHead className="text-right bg-card"><SortHeader label="Active (14d)" k="activeReferrals" /></TableHead>
                  <TableHead className="text-right bg-card">Symptom logs</TableHead>
                  <TableHead className="text-right bg-card">Chat msgs</TableHead>
                  <TableHead className="text-right bg-card"><SortHeader label="Engagement" k="engagementScore" /></TableHead>
                  <TableHead className="text-right bg-card">Last activity</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {sorted.map((r) => {
                  const isOpen = expanded.has(r.id);
                  const noActivity = r.engagementScore === 0;
                  return (
                    <Fragment key={r.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => toggleRow(r.id)}
                      >
                        <TableCell className="text-muted-foreground">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground">{r.email}</div>
                        </TableCell>
                        <TableCell className="text-right">{r.totalReferrals}</TableCell>
                        <TableCell className="text-right">{r.activeReferrals}</TableCell>
                        {noActivity ? (
                          <TableCell colSpan={4} className="text-right text-sm text-muted-foreground">
                            No activity yet
                          </TableCell>
                        ) : (
                          <>
                            <TableCell className="text-right">{r.symptomLogs}</TableCell>
                            <TableCell className="text-right">{r.chatMessages}</TableCell>
                            <TableCell className="text-right font-medium">{r.engagementScore}</TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">{fmtDate(r.lastActive)}</TableCell>
                          </>
                        )}
                      </TableRow>
                      {isOpen && (
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell />
                          <TableCell colSpan={7} className="py-3">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Referred user</TableHead>
                                  <TableHead className="text-right">Signed up</TableHead>
                                  <TableHead className="text-right">Symptom logs</TableHead>
                                  <TableHead className="text-right">Chat msgs</TableHead>
                                  <TableHead className="text-right">Engagement</TableHead>
                                  <TableHead className="text-right">Last activity</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {r.referred.map((u) => (
                                  <TableRow key={u.id}>
                                    <TableCell>
                                      <div className="font-medium">{u.name}</div>
                                      <div className="text-xs text-muted-foreground">{u.email}</div>
                                    </TableCell>
                                    <TableCell className="text-right text-sm text-muted-foreground">{fmtDate(u.signupDate)}</TableCell>
                                    <TableCell className="text-right">{u.symptomLogs}</TableCell>
                                    <TableCell className="text-right">{u.chatMessages}</TableCell>
                                    <TableCell className="text-right font-medium">{u.symptomLogs + u.chatMessages}</TableCell>
                                    <TableCell className="text-right text-sm text-muted-foreground">
                                      {u.lastActive ? fmtDate(u.lastActive) : "No activity yet"}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
