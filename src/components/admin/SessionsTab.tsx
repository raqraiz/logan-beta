import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Circle, Clock, Users, Activity, TrendingUp, ChevronDown, ChevronRight, MessageSquare, Eye, MousePointerClick, ArrowRightLeft, Puzzle, LayoutGrid } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, subDays, differenceInMinutes } from "date-fns";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OnlineUser {
  user_id: string;
  email: string;
  full_name: string;
  online_at: string;
}

interface SessionRecord {
  userId: string;
  email: string;
  fullName: string;
  startTime: string;
  endTime: string;
  durationMin: number;
  messageCount: number;
}

interface ActivityEvent {
  id: string;
  event_type: string;
  page_path: string | null;
  element_label: string | null;
  element_type: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface DailySessionStats {
  date: string;
  sessions: number;
  avgDuration: number;
}

const SESSION_GAP_MS = 30 * 60 * 1000;
const SESSIONS_PER_PAGE = 20;

const chartConfig = {
  sessions: { label: "Sessions", color: "hsl(var(--primary))" },
  avgDuration: { label: "Avg Duration (min)", color: "hsl(var(--accent))" },
} satisfies ChartConfig;

const EVENT_EMOJI: Record<string, string> = {
  page_view: "👁",
  click: "👆",
  tab_switch: "↔️",
  widget_interact: "🧩",
};

const EVENT_LABEL: Record<string, string> = {
  page_view: "Viewed",
  click: "Tapped",
  tab_switch: "Switched to",
  widget_interact: "Used widget",
};

/* ── Session Detail (expandable row) ─────────────────────── */

function SessionDetail({ session }: { session: SessionRecord }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasActivity, setHasActivity] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      // Try activity events first
      const { data: activityData } = await supabase
        .from("user_activity_events")
        .select("id, event_type, page_path, element_label, element_type, metadata, created_at")
        .eq("user_id", session.userId)
        .gte("created_at", session.startTime)
        .lte("created_at", session.endTime)
        .order("created_at", { ascending: true });

      if (activityData && activityData.length > 0) {
        setEvents(activityData.map(e => ({
          ...e,
          metadata: e.metadata as Record<string, unknown> | null,
        })));
        setHasActivity(true);
      } else {
        // Fall back to chat messages as activity proxy
        const { data: msgData } = await supabase
          .from("chat_messages")
          .select("id, role, content, created_at")
          .eq("user_id", session.userId)
          .gte("created_at", session.startTime)
          .lte("created_at", session.endTime)
          .order("created_at", { ascending: true });

        const fallbackEvents: ActivityEvent[] = (msgData || []).map(m => ({
          id: m.id,
          event_type: m.role === "user" ? "click" : "page_view",
          page_path: "/chat",
          element_label: m.role === "user" ? `Sent: "${m.content.slice(0, 50)}${m.content.length > 50 ? '…' : ''}"` : `Logan responded (${m.content.length} chars)`,
          element_type: m.role === "user" ? "message" : "response",
          metadata: null,
          created_at: m.created_at,
        }));
        setEvents(fallbackEvents);
        setHasActivity(false);
      }
      setLoading(false);
    })();
  }, [session]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 px-6 text-muted-foreground text-sm">
        <RefreshCw className="w-3 h-3 animate-spin" /> Loading activity…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="py-4 px-6 text-sm text-muted-foreground">No activity recorded for this session.</p>
    );
  }

  return (
    <ScrollArea className="max-h-[400px]">
      <div className="px-6 py-3">
        {hasActivity === false && (
          <p className="mb-3 text-xs text-muted-foreground italic">
            Showing chat messages (activity tracking started recently).
          </p>
        )}
        <div className="space-y-1.5">
          {events.map((evt) => {
            const emoji = EVENT_EMOJI[evt.event_type] || "•";
            const action = EVENT_LABEL[evt.event_type] || evt.event_type;
            const detail = evt.event_type === "page_view"
              ? evt.page_path || "unknown page"
              : evt.event_type === "tab_switch"
              ? evt.element_label || "unknown"
              : evt.element_label || "";

            return (
              <div key={evt.id} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground/60 w-[68px] shrink-0 text-right tabular-nums">
                  {format(new Date(evt.created_at), "h:mm:ss a")}
                </span>
                <span>{emoji}</span>
                <span className="text-foreground/80 truncate">
                  {action} {detail && <span className="text-muted-foreground">— {detail}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

/* ── Page Popularity Summary ──────────────────────────────── */

interface PopularityItem {
  label: string;
  count: number;
  type: "page" | "click";
}

function PagePopularitySummary() {
  const [items, setItems] = useState<PopularityItem[]>([]);
  const [clickItems, setClickItems] = useState<PopularityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Fetch page view counts
      const { data: pageData } = await supabase
        .from("user_activity_events")
        .select("page_path")
        .eq("event_type", "page_view");

      // Fetch click counts
      const { data: clickData } = await supabase
        .from("user_activity_events")
        .select("element_label, element_type")
        .eq("event_type", "click");

      // Aggregate page views
      const pageCounts = new Map<string, number>();
      for (const row of pageData || []) {
        const p = row.page_path || "unknown";
        pageCounts.set(p, (pageCounts.get(p) || 0) + 1);
      }
      const pages: PopularityItem[] = Array.from(pageCounts.entries())
        .map(([label, count]) => ({ label, count, type: "page" as const }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Aggregate clicks — group by label
      const clickCounts = new Map<string, number>();
      for (const row of clickData || []) {
        const label = row.element_label?.slice(0, 40) || "unknown";
        clickCounts.set(label, (clickCounts.get(label) || 0) + 1);
      }
      const clicks: PopularityItem[] = Array.from(clickCounts.entries())
        .map(([label, count]) => ({ label, count, type: "click" as const }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setItems(pages);
      setClickItems(clicks);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <RefreshCw className="w-4 h-4 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const maxPageCount = items.length > 0 ? items[0].count : 1;
  const maxClickCount = clickItems.length > 0 ? clickItems[0].count : 1;

  const TAB_LABELS: Record<string, string> = {
    "/chat/home": "Home",
    "/chat/ask": "Ask (Chat)",
    "/chat/plan": "Plan",
    "/": "Landing",
    "/chat": "Chat (legacy)",
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Pages / Tabs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-400" />
            Most Visited Pages & Tabs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No page view data yet</p>
          ) : items.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium truncate">
                    {TAB_LABELS[item.label] || item.label}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">{item.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500/60"
                    style={{ width: `${(item.count / maxPageCount) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Most Clicked */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MousePointerClick className="w-4 h-4 text-primary" />
            Most Clicked Elements
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {clickItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No click data yet</p>
          ) : clickItems.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium truncate">{item.label}</span>
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">{item.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60"
                    style={{ width: `${(item.count / maxClickCount) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Main Tab ─────────────────────────────────────────────── */

export const SessionsTab = () => {
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [allSessions, setAllSessions] = useState<SessionRecord[]>([]);
  const [dailyStats, setDailyStats] = useState<DailySessionStats[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [totals, setTotals] = useState({
    totalSessions: 0,
    avgDuration: 0,
    avgDurationPerUser: 0,
    longestSession: 0,
    longestSessionUser: "",
    peakHour: "",
  });

  // Subscribe to presence for live online users
  useEffect(() => {
    const channel = supabase.channel("online-users");

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const users: OnlineUser[] = [];
        for (const key of Object.keys(state)) {
          const presences = state[key] as any[];
          if (presences.length > 0) {
            users.push(presences[0] as OnlineUser);
          }
        }
        setOnlineUsers(users);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchSessionData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const thirtyDaysAgo = subDays(now, 30);

      // Fetch profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name");

      if (!profiles) return;

      const profileMap = new Map(profiles.map((p) => [p.id, p]));

      // Fetch chat messages from last 30 days (paginated)
      let allTimestamps: { user_id: string; created_at: string }[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data: batch } = await supabase
          .from("chat_messages")
          .select("user_id, created_at")
          .eq("role", "user")
          .gte("created_at", thirtyDaysAgo.toISOString())
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (!batch || batch.length === 0) break;
        allTimestamps = allTimestamps.concat(batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }

      // Also fetch activity events to build sessions from all user interactions
      let actFrom = 0;
      while (true) {
        const { data: batch } = await supabase
          .from("user_activity_events")
          .select("user_id, created_at")
          .gte("created_at", thirtyDaysAgo.toISOString())
          .order("created_at", { ascending: true })
          .range(actFrom, actFrom + pageSize - 1);
        if (!batch || batch.length === 0) break;
        allTimestamps = allTimestamps.concat(batch);
        if (batch.length < pageSize) break;
        actFrom += pageSize;
      }

      // Build sessions from all timestamps (messages + activity)
      const timestampsByUser = new Map<string, string[]>();
      for (const evt of allTimestamps) {
        if (!timestampsByUser.has(evt.user_id)) timestampsByUser.set(evt.user_id, []);
        timestampsByUser.get(evt.user_id)!.push(evt.created_at);
      }

      const sessions: SessionRecord[] = [];
      const hourCounts = new Array(24).fill(0);

      for (const [userId, timestamps] of timestampsByUser.entries()) {
        const sorted = timestamps.map((t) => new Date(t).getTime()).sort();
        const profile = profileMap.get(userId);

        let sessionStart = sorted[0];
        let sessionEnd = sorted[0];
        let msgCount = 1;

        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] - sorted[i - 1] > SESSION_GAP_MS) {
            const dur = Math.max(1, Math.round(differenceInMinutes(new Date(sessionEnd), new Date(sessionStart))));
            sessions.push({
              userId,
              email: profile?.email || "Unknown",
              fullName: profile?.full_name || "Unknown",
              startTime: new Date(sessionStart).toISOString(),
              endTime: new Date(sessionEnd).toISOString(),
              durationMin: dur,
              messageCount: msgCount,
            });
            hourCounts[new Date(sessionStart).getHours()]++;
            sessionStart = sorted[i];
            sessionEnd = sorted[i];
            msgCount = 1;
          } else {
            sessionEnd = sorted[i];
            msgCount++;
          }
        }
        const dur = Math.max(1, Math.round(differenceInMinutes(new Date(sessionEnd), new Date(sessionStart))));
        sessions.push({
          userId,
          email: profile?.email || "Unknown",
          fullName: profile?.full_name || "Unknown",
          startTime: new Date(sessionStart).toISOString(),
          endTime: new Date(sessionEnd).toISOString(),
          durationMin: dur,
          messageCount: msgCount,
        });
        hourCounts[new Date(sessionStart).getHours()]++;
      }

      sessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

      // Daily stats
      const dailyMap = new Map<string, { sessions: number; totalDuration: number }>();
      for (let i = 0; i < 30; i++) {
        const d = format(subDays(now, i), "yyyy-MM-dd");
        dailyMap.set(d, { sessions: 0, totalDuration: 0 });
      }
      for (const s of sessions) {
        const d = format(new Date(s.startTime), "yyyy-MM-dd");
        if (dailyMap.has(d)) {
          dailyMap.get(d)!.sessions++;
          dailyMap.get(d)!.totalDuration += s.durationMin;
        }
      }
      const daily: DailySessionStats[] = Array.from(dailyMap.entries())
        .map(([date, v]) => ({
          date: format(new Date(date), "MMM d"),
          sessions: v.sessions,
          avgDuration: v.sessions > 0 ? Math.round(v.totalDuration / v.sessions) : 0,
        }))
        .reverse();

      const peakHourIdx = hourCounts.indexOf(Math.max(...hourCounts));
      const peakHour = `${peakHourIdx.toString().padStart(2, "0")}:00`;

      const totalDuration = sessions.reduce((a, s) => a + s.durationMin, 0);
      const longestSession = sessions.length > 0 ? Math.max(...sessions.map((s) => s.durationMin)) : 0;
      const longestSessionRecord = sessions.find((s) => s.durationMin === longestSession);
      const longestSessionUser = longestSessionRecord?.fullName || "";

      const userDurations = new Map<string, number[]>();
      for (const s of sessions) {
        if (!userDurations.has(s.userId)) userDurations.set(s.userId, []);
        userDurations.get(s.userId)!.push(s.durationMin);
      }
      const perUserAvgs = Array.from(userDurations.values()).map(
        (durations) => durations.reduce((a, b) => a + b, 0) / durations.length
      );
      const avgDurationPerUser = perUserAvgs.length > 0
        ? Math.round(perUserAvgs.reduce((a, b) => a + b, 0) / perUserAvgs.length)
        : 0;

      setAllSessions(sessions);
      setPage(0);
      setExpandedIdx(null);
      setDailyStats(daily);
      setTotals({
        totalSessions: sessions.length,
        avgDuration: sessions.length > 0 ? Math.round(totalDuration / sessions.length) : 0,
        avgDurationPerUser,
        longestSession,
        longestSessionUser,
        peakHour,
      });
    } catch (err) {
      console.error("Error fetching session data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessionData();
  }, [fetchSessionData]);

  const totalPages = Math.ceil(allSessions.length / SESSIONS_PER_PAGE);
  const paginatedSessions = allSessions.slice(page * SESSIONS_PER_PAGE, (page + 1) * SESSIONS_PER_PAGE);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-120px)]">
    <div className="space-y-6 pr-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Sessions & Live Activity</h2>
        <Button variant="ghost" size="sm" onClick={fetchSessionData}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Live Online Users */}
      <Card className="border-accent/30 bg-accent/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Circle className="w-3 h-3 fill-accent text-accent animate-pulse" />
            Live — {onlineUsers.length} user{onlineUsers.length !== 1 ? "s" : ""} online
          </CardTitle>
        </CardHeader>
        <CardContent>
          {onlineUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users currently online</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {onlineUsers.map((u) => (
                <Badge key={u.user_id} variant="secondary" className="gap-1.5">
                  <Circle className="w-2 h-2 fill-accent text-accent" />
                  {u.full_name || u.email}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Activity className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold text-foreground">{totals.totalSessions}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sessions (30d)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold text-foreground">{totals.avgDuration}m</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Duration (Global)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold text-foreground">{totals.avgDurationPerUser}m</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Duration (Per User)</p>
          </CardContent>
        </Card>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-left w-full h-full">
                <Card className="h-full">
                  <CardContent className="p-4 text-center">
                    <TrendingUp className="w-5 h-5 mx-auto mb-1 text-primary" />
                    <p className="text-2xl font-bold text-foreground">{totals.longestSession}m</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Longest Session</p>
                  </CardContent>
                </Card>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{totals.longestSessionUser || "Unknown user"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold text-foreground">{totals.peakHour}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Peak Hour</p>
          </CardContent>
        </Card>
      </div>

      {/* Page & Tab Popularity */}
      <PagePopularitySummary />

      {/* Daily Sessions Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Daily Sessions (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
            <BarChart data={dailyStats}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="sessions" fill="var(--color-sessions)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Avg Duration Over Time */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Avg Session Duration (min)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <LineChart data={dailyStats}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="avgDuration" stroke="var(--color-avgDuration)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Sessions Table with expandable detail */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            All Sessions ({allSessions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>User</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Messages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedSessions.map((s, i) => {
                const globalIdx = page * SESSIONS_PER_PAGE + i;
                const isExpanded = expandedIdx === globalIdx;
                return (
                  <>
                    <TableRow
                      key={globalIdx}
                      className="cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedIdx(isExpanded ? null : globalIdx)}
                    >
                      <TableCell className="w-8 pr-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{s.fullName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(s.startTime), "MMM d, h:mm a")}
                      </TableCell>
                      <TableCell className="text-right text-sm">{s.durationMin}m</TableCell>
                      <TableCell className="text-right text-sm">{s.messageCount}</TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${globalIdx}-detail`}>
                        <TableCell colSpan={5} className="p-0 bg-muted/10 border-t border-border/20">
                          <SessionDetail session={s} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
              {allSessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                    No sessions found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-muted-foreground">
                Page {page + 1} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => { setPage(p => p - 1); setExpandedIdx(null); }}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => { setPage(p => p + 1); setExpandedIdx(null); }}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </ScrollArea>
  );
};
