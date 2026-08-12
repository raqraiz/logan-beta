import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, AreaChart, Area,
} from "recharts";
import {
  RefreshCw, Users, MessageSquare, Activity, TrendingUp, Clock, BarChart3,
  Circle, ChevronDown, ChevronRight, MessageCircle, ChefHat,
} from "lucide-react";
import { format, subDays, startOfDay, parseISO, differenceInMinutes, eachWeekOfInterval } from "date-fns";
import {
  buildActivityIndex, utcKey, utcDayKeysBetween, type ActivityIndex,
} from "@/lib/activeUsers";


const SESSION_GAP_MS = 30 * 60 * 1000;
const ITEMS_PER_PAGE = 10;

interface UserEngagement {
  userId: string;
  email: string;
  fullName: string;
  totalMessages: number;
  lastActive: string | null;
  sessions: number;
  avgMessagesPerSession: number;
  joinedAt: string;
}

interface DailyActivity {
  date: string;
  messages: number;
  activeUsers: number;
}

interface DailySessionStats {
  date: string;
  sessions: number;
  avgDuration: number;
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

interface OnlineUser {
  user_id: string;
  email: string;
  full_name: string;
  online_at: string;
}

interface WeeklyAdoption {
  week: string;
  chat: number;
  home: number;
  forecast: number;
  plan: number;
  cheatSheet: number;
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

const activityChartConfig = {
  messages: { label: "Messages", color: "hsl(var(--primary))" },
  activeUsers: { label: "Active Users", color: "hsl(var(--accent))" },
} satisfies ChartConfig;

const sessionChartConfig = {
  avgDuration: { label: "Avg Duration (min)", color: "hsl(var(--accent))" },
} satisfies ChartConfig;

const adoptionChartConfig = {
  chat: { label: "Chat", color: "hsl(var(--primary))" },
  home: { label: "Home", color: "hsl(30, 80%, 55%)" },
  forecast: { label: "Forecast", color: "hsl(142, 60%, 45%)" },
  plan: { label: "Plan", color: "hsl(340, 65%, 50%)" },
  cheatSheet: { label: "Cheat Sheet", color: "hsl(50, 70%, 45%)" },
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

function SessionDetail({ session }: { session: SessionRecord }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasActivity, setHasActivity] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
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
          element_label: m.role === "user"
            ? `Sent: "${m.content.slice(0, 50)}${m.content.length > 50 ? '…' : ''}"`
            : `Logan responded (${m.content.length} chars)`,
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
    return <p className="py-4 px-6 text-sm text-muted-foreground">No activity recorded for this session.</p>;
  }
  return (
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
  );
}

export const OverviewTab = () => {
  // Per-section loading flags for progressive rendering
  const [engagementLoading, setEngagementLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [adoptionLoading, setAdoptionLoading] = useState(true);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [menuLoading, setMenuLoading] = useState(true);

  // Date range filter — default: all time (earliest profile → now)
  const [rangeFrom, setRangeFrom] = useState<Date>(() => startOfDay(subDays(new Date(), 30)));
  const [rangeTo, setRangeTo] = useState<Date>(() => new Date());
  const [earliestProfileDate, setEarliestProfileDate] = useState<Date | null>(null);
  const [rangeReady, setRangeReady] = useState(false);
  const fromIso = useMemo(() => rangeFrom.toISOString(), [rangeFrom]);
  const toIso = useMemo(() => rangeTo.toISOString(), [rangeTo]);
  const rangeDayCount = useMemo(
    () => Math.max(1, Math.ceil((rangeTo.getTime() - rangeFrom.getTime()) / 86400000) + 1),
    [rangeFrom, rangeTo],
  );


  // Engagement state
  const [users, setUsers] = useState<UserEngagement[]>([]);
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([]);
  const [totals, setTotals] = useState({
    totalUsers: 0,
    totalMessages: 0,
    activeToday: 0,
    activeThisWeek: 0,
    avgDailyUsers: 0,
    avgSessionsPerUser: 0,
    avgMessagesPerUser: 0,
  });

  // Shared active-user index (src/lib/activeUsers.ts) — single source of truth
  // for active-user counts, shared with the Growth "Daily log".
  const [activityIndex, setActivityIndex] = useState<ActivityIndex | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [allTimeUsers, setAllTimeUsers] = useState<number | null>(null);

  // Fixed rolling window for today's cards — independent of the selected range.
  const [todayIndex, setTodayIndex] = useState<ActivityIndex | null>(null);
  const [todayIndexLoading, setTodayIndexLoading] = useState(true);


  // Sessions state
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [allSessions, setAllSessions] = useState<SessionRecord[]>([]);
  const [dailyStats, setDailyStats] = useState<DailySessionStats[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [leaderboardPage, setLeaderboardPage] = useState(0);
  const [sessionTotals, setSessionTotals] = useState({
    avgDuration: 0,
    longestSession: 0,
    longestSessionUser: "",
  });

  // Features state
  const [weeklyAdoption, setWeeklyAdoption] = useState<WeeklyAdoption[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<{ id: string; name: string; email: string; category: string; message: string; created_at: string }[]>([]);
  const [menuItems, setMenuItems] = useState<{ id: string; name: string; email: string; title: string; status: string; created_at: string }[]>([]);


  // Presence subscription
  useEffect(() => {
    const channel = supabase.channel("online-users");
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const list: OnlineUser[] = [];
        for (const key of Object.keys(state)) {
          const presences = state[key] as any[];
          if (presences.length > 0) list.push(presences[0] as OnlineUser);
        }
        setOnlineUsers(list);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Generic helper: fetch all rows from a table, parallelizing page requests
  // after probing the count. Falls back to sequential paging if count fails.
  const fetchAllRows = useCallback(async <T,>(
    build: (from: number, to: number) => any,
    countQuery: () => any,
    pageSize = 1000,
  ): Promise<T[]> => {
    const { count } = await countQuery();
    if (count == null) {
      // Sequential fallback
      const all: T[] = [];
      let from = 0;
      while (true) {
        const { data } = await build(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    }
    if (count === 0) return [];
    const pages = Math.ceil(count / pageSize);
    const reqs = Array.from({ length: pages }, (_, i) =>
      build(i * pageSize, i * pageSize + pageSize - 1).then((r: any) => (r.data as T[]) || []),
    );
    const results = await Promise.all(reqs);
    return results.flat();
  }, []);

  // Profiles are needed by every section — fetch once and share via a Promise
  const profilesPromiseRef = useRef<Promise<any[]> | null>(null);
  const getProfiles = useCallback(() => {
    if (!profilesPromiseRef.current) {
      profilesPromiseRef.current = Promise.resolve(
        supabase
          .from("profiles")
          .select("id, email, full_name, created_at")
      ).then((r: any) => r.data || []);

    }
    return profilesPromiseRef.current;
  }, []);

  // All-time range helper: earliest profile → now
  const applyAllTime = useCallback(async () => {
    if (earliestProfileDate) {
      setRangeFrom(earliestProfileDate);
      setRangeTo(new Date());
    } else {
      const profiles = await getProfiles();
      const earliest = profiles.length > 0
        ? startOfDay(parseISO(profiles.reduce((min, p) => p.created_at < min ? p.created_at : min, profiles[0].created_at)))
        : startOfDay(subDays(new Date(), 30));
      setEarliestProfileDate(earliest);
      setRangeFrom(earliest);
      setRangeTo(new Date());
    }
  }, [earliestProfileDate, getProfiles]);


  // ----- ENGAGEMENT + DAILY ACTIVITY + LEADERBOARD -----
  const loadEngagement = useCallback(async () => {
    setEngagementLoading(true);
    try {
      const now = new Date();
      const [profiles, allChatMsgs, allActivity] = await Promise.all([
        getProfiles(),
        fetchAllRows<{ user_id: string; created_at: string }>(
          (from, to) => supabase.from("chat_messages")
            .select("user_id, created_at")
            .eq("role", "user")
            .gte("created_at", fromIso)
            .lte("created_at", toIso)
            .order("created_at", { ascending: true })
            .range(from, to),
          () => supabase.from("chat_messages").select("*", { count: "exact", head: true })
            .eq("role", "user").gte("created_at", fromIso).lte("created_at", toIso),
        ),
        fetchAllRows<{ user_id: string; created_at: string }>(
          (from, to) => supabase.from("user_activity_events")
            .select("user_id, created_at")
            .gte("created_at", fromIso)
            .lte("created_at", toIso)
            .order("created_at", { ascending: true })
            .range(from, to),
          () => supabase.from("user_activity_events").select("*", { count: "exact", head: true })
            .gte("created_at", fromIso).lte("created_at", toIso),
        ),
      ]);
      if (!profiles.length) return;

      const messagesByUser = new Map<string, string[]>();
      for (const m of allChatMsgs) {
        if (!messagesByUser.has(m.user_id)) messagesByUser.set(m.user_id, []);
        messagesByUser.get(m.user_id)!.push(m.created_at);
      }
      const allByUser = new Map<string, string[]>();
      for (const m of allChatMsgs) {
        if (!allByUser.has(m.user_id)) allByUser.set(m.user_id, []);
        allByUser.get(m.user_id)!.push(m.created_at);
      }
      for (const e of allActivity) {
        if (!allByUser.has(e.user_id)) allByUser.set(e.user_id, []);
        allByUser.get(e.user_id)!.push(e.created_at);
      }

      const todayStart = startOfDay(now);
      const weekAgo = subDays(now, 7);
      let activeToday = 0;
      let activeThisWeek = 0;
      let totalSessionsAllTime = 0;

      const engagements: UserEngagement[] = profiles.map((p: any) => {
        const msgTs = (messagesByUser.get(p.id) || []).map(t => new Date(t).getTime()).sort();
        const totalMessages = msgTs.length;
        const allTs = (allByUser.get(p.id) || []).map(t => new Date(t).getTime()).sort();
        let sessions = 0;
        if (allTs.length > 0) {
          sessions = 1;
          for (let i = 1; i < allTs.length; i++) {
            if (allTs[i] - allTs[i - 1] > SESSION_GAP_MS) sessions++;
          }
        }
        totalSessionsAllTime += sessions;
        const lastActive = allTs.length > 0 ? new Date(allTs[allTs.length - 1]).toISOString() : null;
        if (lastActive && new Date(lastActive) >= todayStart) activeToday++;
        if (lastActive && new Date(lastActive) >= weekAgo) activeThisWeek++;
        return {
          userId: p.id,
          email: p.email,
          fullName: p.full_name,
          totalMessages,
          lastActive,
          sessions,
          avgMessagesPerSession: sessions > 0 ? Math.round((totalMessages / sessions) * 10) / 10 : 0,
          joinedAt: p.created_at,
        };
      });
      engagements.sort((a, b) => b.totalMessages - a.totalMessages);

      const dailyMap = new Map<string, { messages: number; users: Set<string> }>();
      for (let i = 0; i < rangeDayCount; i++) {
        const d = format(subDays(rangeTo, i), "yyyy-MM-dd");
        dailyMap.set(d, { messages: 0, users: new Set() });
      }
      for (const m of allChatMsgs) {
        const d = format(new Date(m.created_at), "yyyy-MM-dd");
        if (dailyMap.has(d)) {
          dailyMap.get(d)!.messages++;
          dailyMap.get(d)!.users.add(m.user_id);
        }
      }
      for (const e of allActivity) {
        const d = format(new Date(e.created_at), "yyyy-MM-dd");
        if (dailyMap.has(d)) dailyMap.get(d)!.users.add(e.user_id);
      }
      const daily: DailyActivity[] = Array.from(dailyMap.entries())
        .map(([date, v]) => ({ date: format(parseISO(date), "MMM d"), messages: v.messages, activeUsers: v.users.size }))
        .reverse();
      const avgDailyUsers = daily.length > 0
        ? Math.round((daily.reduce((s, d) => s + d.activeUsers, 0) / daily.length) * 10) / 10
        : 0;

      const newUsersInRange = profiles.filter((p: any) => {
        const t = new Date(p.created_at).getTime();
        return t >= rangeFrom.getTime() && t <= rangeTo.getTime();
      }).length;

      setUsers(engagements);
      setLeaderboardPage(0);
      setDailyActivity(daily);
      setTotals({
        totalUsers: newUsersInRange,
        totalMessages: allChatMsgs.length,
        activeToday,
        activeThisWeek,
        avgDailyUsers,
        avgSessionsPerUser: profiles.length > 0 ? Math.round((totalSessionsAllTime / profiles.length) * 10) / 10 : 0,
        avgMessagesPerUser: profiles.length > 0 ? Math.round((allChatMsgs.length / profiles.length) * 10) / 10 : 0,
      });
    } catch (err) {
      console.error("Engagement load error:", err);
    } finally {
      setEngagementLoading(false);
    }
  }, [fetchAllRows, getProfiles, fromIso, toIso, rangeFrom, rangeTo, rangeDayCount]);

  // ----- SESSIONS (selected date range — server-side filter) -----
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const [profiles, recentChat, recentActivity] = await Promise.all([
        getProfiles(),
        fetchAllRows<{ user_id: string; created_at: string }>(
          (from, to) => supabase.from("chat_messages")
            .select("user_id, created_at")
            .eq("role", "user")
            .gte("created_at", fromIso)
            .lte("created_at", toIso)
            .order("created_at", { ascending: true })
            .range(from, to),
          () => supabase.from("chat_messages").select("*", { count: "exact", head: true })
            .eq("role", "user").gte("created_at", fromIso).lte("created_at", toIso),
        ),
        fetchAllRows<{ user_id: string; created_at: string }>(
          (from, to) => supabase.from("user_activity_events")
            .select("user_id, created_at")
            .gte("created_at", fromIso)
            .lte("created_at", toIso)
            .order("created_at", { ascending: true })
            .range(from, to),
          () => supabase.from("user_activity_events").select("*", { count: "exact", head: true })
            .gte("created_at", fromIso).lte("created_at", toIso),
        ),
      ]);
      const profileMap = new Map(profiles.map((p: any) => [p.id, p]));

      const tsByUser = new Map<string, string[]>();
      for (const e of [...recentChat, ...recentActivity]) {
        if (!tsByUser.has(e.user_id)) tsByUser.set(e.user_id, []);
        tsByUser.get(e.user_id)!.push(e.created_at);
      }
      const sessions: SessionRecord[] = [];
      for (const [userId, timestamps] of tsByUser.entries()) {
        const sorted = timestamps.map(t => new Date(t).getTime()).sort();
        const profile: any = profileMap.get(userId);
        let sessionStart = sorted[0];
        let sessionEnd = sorted[0];
        let msgCount = 1;
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] - sorted[i - 1] > SESSION_GAP_MS) {
            const dur = Math.max(1, Math.round(differenceInMinutes(new Date(sessionEnd), new Date(sessionStart))));
            sessions.push({
              userId, email: profile?.email || "Unknown", fullName: profile?.full_name || "Unknown",
              startTime: new Date(sessionStart).toISOString(), endTime: new Date(sessionEnd).toISOString(),
              durationMin: dur, messageCount: msgCount,
            });
            sessionStart = sorted[i]; sessionEnd = sorted[i]; msgCount = 1;
          } else {
            sessionEnd = sorted[i]; msgCount++;
          }
        }
        const dur = Math.max(1, Math.round(differenceInMinutes(new Date(sessionEnd), new Date(sessionStart))));
        sessions.push({
          userId, email: profile?.email || "Unknown", fullName: profile?.full_name || "Unknown",
          startTime: new Date(sessionStart).toISOString(), endTime: new Date(sessionEnd).toISOString(),
          durationMin: dur, messageCount: msgCount,
        });
      }
      sessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

      const sessionDailyMap = new Map<string, { sessions: number; totalDuration: number }>();
      for (let i = 0; i < rangeDayCount; i++) {
        const d = format(subDays(rangeTo, i), "yyyy-MM-dd");
        sessionDailyMap.set(d, { sessions: 0, totalDuration: 0 });
      }
      for (const s of sessions) {
        const d = format(new Date(s.startTime), "yyyy-MM-dd");
        if (sessionDailyMap.has(d)) {
          sessionDailyMap.get(d)!.sessions++;
          sessionDailyMap.get(d)!.totalDuration += s.durationMin;
        }
      }
      const sessionDaily: DailySessionStats[] = Array.from(sessionDailyMap.entries())
        .map(([date, v]) => ({
          date: format(new Date(date), "MMM d"),
          sessions: v.sessions,
          avgDuration: v.sessions > 0 ? Math.round(v.totalDuration / v.sessions) : 0,
        }))
        .reverse();

      const totalDuration = sessions.reduce((a, s) => a + s.durationMin, 0);
      const longestSession = sessions.length > 0 ? Math.max(...sessions.map(s => s.durationMin)) : 0;
      const longestRecord = sessions.find(s => s.durationMin === longestSession);

      setAllSessions(sessions);
      setPage(0);
      setExpandedIdx(null);
      setDailyStats(sessionDaily);
      setSessionTotals({
        avgDuration: sessions.length > 0 ? Math.round(totalDuration / sessions.length) : 0,
        longestSession,
        longestSessionUser: longestRecord?.fullName || "",
      });
    } catch (err) {
      console.error("Sessions load error:", err);
    } finally {
      setSessionsLoading(false);
    }

  }, [fetchAllRows, getProfiles, fromIso, toIso, rangeTo, rangeDayCount]);

  // ----- ADOPTION CHART (slowest — feature_events table) -----
  const loadAdoption = useCallback(async () => {
    setAdoptionLoading(true);
    try {
      const now = new Date();
      const [allFeatureEvents, chatMsgs] = await Promise.all([
        fetchAllRows<{ user_id: string; feature_name: string; created_at: string }>(
          (from, to) => (supabase.from("feature_events" as any)
            .select("user_id, feature_name, created_at")
            .order("created_at", { ascending: true })
            .range(from, to) as any),
          () => (supabase.from("feature_events" as any).select("*", { count: "exact", head: true }) as any),
        ),
        fetchAllRows<{ user_id: string; created_at: string }>(
          (from, to) => supabase.from("chat_messages")
            .select("user_id, created_at")
            .eq("role", "user")
            .order("created_at", { ascending: true })
            .range(from, to),
          () => supabase.from("chat_messages").select("*", { count: "exact", head: true }).eq("role", "user"),
        ),
      ]);

      const homeEvents = allFeatureEvents.filter(e => e.feature_name === "home_tab");
      const forecastEvents = allFeatureEvents.filter(e => e.feature_name === "cycle_forecast");
      const planEvents = allFeatureEvents.filter(e => e.feature_name === "plan_tab");
      const cheatSheetEvents = allFeatureEvents.filter(e => e.feature_name === "phase_cheat_sheet");

      const twelveWeeksAgo = subDays(now, 84);
      const weeks = eachWeekOfInterval({ start: twelveWeeksAgo, end: now }, { weekStartsOn: 1 });
      const firstUse = (rows: { user_id: string; created_at: string }[]) => {
        const first = new Map<string, Date>();
        for (const r of rows) {
          const d = new Date(r.created_at);
          if (!first.has(r.user_id) || d < first.get(r.user_id)!) first.set(r.user_id, d);
        }
        return first;
      };
      const chatFirst = firstUse(chatMsgs);
      const homeFirst = firstUse(homeEvents);
      const forecastFirst = firstUse(forecastEvents);
      const planFirst = firstUse(planEvents);
      const cheatSheetFirst = firstUse(cheatSheetEvents);
      const cumulative = (firstMap: Map<string, Date>, weekEnd: Date) => {
        let count = 0;
        firstMap.forEach(d => { if (d <= weekEnd) count++; });
        return count;
      };
      setWeeklyAdoption(weeks.map(w => {
        const weekEnd = new Date(w.getTime() + 7 * 24 * 60 * 60 * 1000);
        return {
          week: format(w, "MMM d"),
          chat: cumulative(chatFirst, weekEnd),
          home: cumulative(homeFirst, weekEnd),
          forecast: cumulative(forecastFirst, weekEnd),
          plan: cumulative(planFirst, weekEnd),
          cheatSheet: cumulative(cheatSheetFirst, weekEnd),
        };
      }));
    } catch (err) {
      console.error("Adoption load error:", err);
    } finally {
      setAdoptionLoading(false);
    }
  }, [fetchAllRows]);

  // ----- FEEDBACK + MENU (small, fast) -----
  const loadFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    try {
      const [profiles, res] = await Promise.all([
        getProfiles(),
        supabase.from("user_feedback")
          .select("id, user_id, category, message, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      const profileMap = new Map(profiles.map((p: any) => [p.id, p]));
      setFeedbackItems((res.data ?? []).map((f: any) => {
        const p: any = profileMap.get(f.user_id);
        return {
          id: f.id, name: p?.full_name || "Unknown", email: p?.email || "",
          category: f.category, message: f.message, created_at: f.created_at,
        };
      }));
    } finally {
      setFeedbackLoading(false);
    }
  }, [getProfiles]);

  const loadMenu = useCallback(async () => {
    setMenuLoading(true);
    try {
      const [profiles, res] = await Promise.all([
        getProfiles(),
        supabase.from("user_resources")
          .select("id, user_id, title, status, created_at")
          .eq("type", "meal_plan")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      const profileMap = new Map(profiles.map((p: any) => [p.id, p]));
      setMenuItems((res.data ?? []).map((m: any) => {
        const p: any = profileMap.get(m.user_id);
        return {
          id: m.id, name: p?.full_name || "Unknown", email: p?.email || "",
          title: m.title || "Untitled menu", status: m.status, created_at: m.created_at,
        };
      }));
    } finally {
      setMenuLoading(false);
    }
  }, [getProfiles]);

  // Instant top-stats prefetch — cheap HEAD count queries so the stats row
  // shows numbers immediately, before the heavy row-by-row loaders finish.
  const loadFastCounts = useCallback(async () => {
    const [usersRes, msgsRes] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true })
        .gte("created_at", fromIso).lte("created_at", toIso),
      supabase.from("chat_messages").select("*", { count: "exact", head: true })
        .eq("role", "user").gte("created_at", fromIso).lte("created_at", toIso),
    ]);
    setTotals(t => ({
      ...t,
      totalUsers: usersRes.count ?? t.totalUsers,
      totalMessages: msgsRes.count ?? t.totalMessages,
    }));
  }, [fromIso, toIso]);

  // True all-time cumulative signups — never scoped by the range selector.
  const loadAllTimeUsers = useCallback(async () => {
    const { count } = await supabase.from("profiles").select("*", { count: "exact", head: true });
    if (count != null) setAllTimeUsers(count);
  }, []);

  // ----- SHARED ACTIVE-USER INDEX -----
  const loadActivityIndex = useCallback(async () => {
    setActivityLoading(true);
    try {
      const index = await buildActivityIndex(startOfDay(rangeFrom).toISOString());
      setActivityIndex(index);
    } catch (err) {
      console.error("Activity index load error:", err);
    } finally {
      setActivityLoading(false);
    }
  }, [rangeFrom]);

  // Fixed rolling window for "today" cards — always covers the last 8 days so
  // Active Users / Active This Week never depend on the selected range.
  const loadTodayIndex = useCallback(async () => {
    setTodayIndexLoading(true);
    try {
      const since = startOfDay(subDays(new Date(), 8)).toISOString();
      const index = await buildActivityIndex(since);
      setTodayIndex(index);
    } catch (err) {
      console.error("Today index load error:", err);
    } finally {
      setTodayIndexLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    profilesPromiseRef.current = null;
    // 1) Instant counts so the top stats row paints immediately
    loadFastCounts();
    loadAllTimeUsers();
    // 2) Fast/light loaders in parallel
    loadFeedback();
    loadMenu();
    loadActivityIndex();
    loadTodayIndex();
    // 3) Main heavy loaders — render top stats + sessions before adoption
    await Promise.all([loadEngagement(), loadSessions()]);
    // 4) Defer the slowest query (feature_events scan) so it stops competing
    loadAdoption();
  }, [loadFastCounts, loadAllTimeUsers, loadActivityIndex, loadTodayIndex, loadEngagement, loadSessions, loadFeedback, loadMenu, loadAdoption]);


  // Initialize default range to all time (earliest profile → now), then load data
  useEffect(() => {
    (async () => {
      const profiles = await getProfiles();
      const earliest = profiles.length > 0
        ? startOfDay(parseISO(profiles.reduce((min, p) => p.created_at < min ? p.created_at : min, profiles[0].created_at)))
        : startOfDay(subDays(new Date(), 30));
      setEarliestProfileDate(earliest);
      setRangeFrom(earliest);
      setRangeTo(new Date());
      setRangeReady(true);
    })();
  }, [getProfiles]);

  useEffect(() => { if (rangeReady) refreshAll(); }, [refreshAll, rangeReady]);

  // Active-user metrics:
  // - "Active Users" and "Active This Week" are fixed to today and come from
  //   the rolling todayIndex (independent of the selected range).
  // - Averages are computed from the range-scoped activityIndex.
  const activeMetrics = useMemo(() => {
    const today = utcKey(new Date());
    const activeTodayIds = todayIndex ? todayIndex.getActiveUsersForDay(today) : new Set<string>();

    let avgDailyUsers: number | null = null;
    let avgWeeklyUsers: number | null = null;
    let avgMsgsPerUser = 0;
    let avgSessionsPerUser = 0;

    if (activityIndex) {
      const days = utcDayKeysBetween(rangeFrom, rangeTo);

      // Monthly-cycle average: only complete calendar months inside the range.
      if (days.length > 0) {
        const firstKey = days[0];
        const lastKey = days[days.length - 1];
        const monthlyAvgs: number[] = [];
        let y = parseInt(firstKey.slice(0, 4), 10);
        let m = parseInt(firstKey.slice(5, 7), 10) - 1;
        const endY = parseInt(lastKey.slice(0, 4), 10);
        const endM = parseInt(lastKey.slice(5, 7), 10) - 1;
        while (true) {
          const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
          const monthStart = `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-01`;
          const monthEnd = `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-${String(dim).padStart(2, "0")}`;
          if (monthStart >= firstKey && monthEnd <= lastKey) {
            let sum = 0;
            for (let d = 1; d <= dim; d++) {
              const key = `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              sum += activityIndex.getActiveUsersForDay(key).size;
            }
            monthlyAvgs.push(sum / dim);
          }
          if (y === endY && m === endM) break;
          m++;
          if (m > 11) { m = 0; y++; }
        }
        if (monthlyAvgs.length > 0) {
          avgDailyUsers = Math.round((monthlyAvgs.reduce((a, b) => a + b, 0) / monthlyAvgs.length) * 10) / 10;
        }
      }

      // Non-overlapping 7-day buckets aligned to range start; partial trailing week excluded.
      if (days.length >= 7) {
        const buckets: number[] = [];
        for (let i = 0; i + 7 <= days.length; i += 7) {
          const set = new Set<string>();
          for (const d of days.slice(i, i + 7)) {
            for (const u of activityIndex.getActiveUsersForDay(d)) set.add(u);
          }
          buckets.push(set.size);
        }
        if (buckets.length) {
          avgWeeklyUsers = Math.round((buckets.reduce((a, b) => a + b, 0) / buckets.length) * 10) / 10;
        }
      }

      // Per-day ratio, then averaged across days (not cumulative).
      const msgRatios: number[] = [];
      const sessionRatios: number[] = [];
      for (const d of days) {
        const active = activityIndex.getActiveUsersForDay(d).size;
        if (active === 0) continue;
        msgRatios.push(activityIndex.getUserMessagesForDay(d) / active);
        sessionRatios.push(activityIndex.getSessionsForDay(d) / active);
      }
      const mean = (arr: number[]) =>
        arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;
      avgMsgsPerUser = mean(msgRatios);
      avgSessionsPerUser = mean(sessionRatios);
    }

    return {
      activeTodayIds,
      activeToday: activeTodayIds.size,
      activeThisWeek: todayIndex ? todayIndex.getActiveThisWeek(today).size : 0,
      avgDailyUsers,
      avgWeeklyUsers,
      avgMsgsPerUser,
      avgSessionsPerUser,
    };
  }, [todayIndex, activityIndex, rangeFrom, rangeTo]);

  const activeTodayUsers = useMemo(
    () => users.filter((u) => activeMetrics.activeTodayIds.has(u.userId)),
    [users, activeMetrics],
  );

  const activeWeekUsers = useMemo(() => {
    if (!todayIndex) return [];
    const ids = todayIndex.getActiveThisWeek(utcKey(new Date()));
    return users.filter((u) => ids.has(u.userId));
  }, [users, todayIndex]);





  const maxMessages = Math.max(...users.map((u) => u.totalMessages), 1);
  const totalPages = Math.ceil(allSessions.length / ITEMS_PER_PAGE);
  const paginatedSessions = allSessions.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
  const leaderboardTotalPages = Math.ceil(users.length / ITEMS_PER_PAGE);
  const paginatedLeaderboard = users.slice(leaderboardPage * ITEMS_PER_PAGE, (leaderboardPage + 1) * ITEMS_PER_PAGE);

  const UserListPopover = ({ userList, label }: { userList: UserEngagement[]; label: string }) => (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground mb-2">{label}</p>
      {userList.length === 0 && <p className="text-xs text-muted-foreground">No users</p>}
      {userList.map((u) => {
        const d = u.lastActive ? new Date(u.lastActive) : null;
        const isToday = d && d >= startOfDay(new Date());
        const timeLabel = d ? (isToday ? format(d, "h:mm a") : format(d, "MMM d, h:mm a")) : "";
        return (
          <div key={u.userId} className="flex items-center justify-between gap-2">
            <span className="text-xs text-foreground truncate">{u.fullName}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{timeLabel}</span>
          </div>
        );
      })}
    </div>
  );

  const anyLoading = engagementLoading || sessionsLoading || adoptionLoading || feedbackLoading || menuLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          Overview
          {anyLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </h2>
        <Button variant="ghost" size="sm" onClick={refreshAll} disabled={anyLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${anyLoading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>


      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wider mr-1">Range</span>
        <Button
          variant={earliestProfileDate && rangeFrom.getTime() === earliestProfileDate.getTime() ? "default" : "outline"}
          size="sm"
          onClick={applyAllTime}
        >
          All time
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              {format(rangeFrom, "MMM d, yyyy")} — {format(rangeTo, "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="flex flex-col sm:flex-row">
              <div className="p-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pb-1">Start</p>
                <Calendar
                  mode="single"
                  selected={rangeFrom}
                  onSelect={(d) => d && setRangeFrom(startOfDay(d))}
                  disabled={(d) => d > new Date()}
                  className="p-3 pointer-events-auto"
                />
              </div>
              <div className="p-2 border-t sm:border-t-0 sm:border-l border-border">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 pb-1">End</p>
                <Calendar
                  mode="single"
                  selected={rangeTo}
                  onSelect={(d) => d && setRangeTo(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59))}
                  disabled={(d) => d > new Date()}
                  className="p-3 pointer-events-auto"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Top stats */}
      <TooltipProvider delayDuration={0}>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold text-foreground">{allTimeUsers ?? "—"}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Users</p>
          </CardContent>
        </Card>
        <Popover>
          <PopoverTrigger asChild>
            <Card className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardContent className="p-4 text-center">
                <Activity className="w-5 h-5 mx-auto mb-1 text-green-500" />
                <p className="text-2xl font-bold text-foreground">
                  {todayIndexLoading ? "…" : activeMetrics.activeToday}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active Users</p>
              </CardContent>
            </Card>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <UserListPopover userList={activeTodayUsers} label="Active today" />
          </PopoverContent>
        </Popover>
        <Card>
          <CardContent className="p-4 text-center">
            <BarChart3 className="w-5 h-5 mx-auto mb-1 text-teal-500" />
            <p className="text-2xl font-bold text-foreground">
              {activityLoading ? "…" : activeMetrics.avgDailyUsers ?? "—"}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Daily Users</p>
          </CardContent>
        </Card>
        <Popover>
          <PopoverTrigger asChild>
            <Card className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                <p className="text-2xl font-bold text-foreground">
                  {todayIndexLoading ? "…" : activeMetrics.activeThisWeek}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active This Week</p>
              </CardContent>
            </Card>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <UserListPopover userList={activeWeekUsers} label="Active this week" />
          </PopoverContent>
        </Popover>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1 text-purple-500" />
            <p className="text-2xl font-bold text-foreground">
              {activityLoading ? "…" : activeMetrics.avgWeeklyUsers ?? "—"}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Weekly Users</p>
          </CardContent>
        </Card>
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="h-full cursor-help">
              <CardContent className="p-4 text-center">
                <MessageSquare className="w-5 h-5 mx-auto mb-1 text-purple-500" />
                <p className="text-2xl font-bold text-foreground">
                  {activityLoading ? "…" : activeMetrics.avgMsgsPerUser}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Msgs/User</p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>Average messages per active user, per day — not cumulative.</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="h-full cursor-help">
              <CardContent className="p-4 text-center">
                <Clock className="w-5 h-5 mx-auto mb-1 text-orange-500" />
                <p className="text-2xl font-bold text-foreground">
                  {activityLoading ? "…" : activeMetrics.avgSessionsPerUser}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Sessions/User</p>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>Average sessions per active user, per day — not cumulative.</p>
          </TooltipContent>
        </Tooltip>
        <Card>
          <CardContent className="p-4 text-center">
            <MessageSquare className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold text-foreground">{totals.totalMessages}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Messages</p>
          </CardContent>
        </Card>
      </div>
      </TooltipProvider>


      {/* Live online users */}
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

      {/* All Sessions */}
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
                const globalIdx = page * ITEMS_PER_PAGE + i;
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</p>
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

      {/* Daily Activity (Last 30 Days) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Daily Activity (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={activityChartConfig} className="h-[250px] w-full">
            <BarChart data={dailyActivity}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="messages" fill="var(--color-messages)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="activeUsers" fill="var(--color-activeUsers)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">User Engagement Leaderboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {paginatedLeaderboard.map((u, i) => (
            <div key={u.userId} className="flex items-center gap-3">
              <span className="text-xs font-mono text-muted-foreground w-5 text-right">{leaderboardPage * ITEMS_PER_PAGE + i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground truncate">{u.fullName}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-[10px]">{u.totalMessages} msgs</Badge>
                    <Badge variant="outline" className="text-[10px]">{u.sessions} sessions</Badge>
                  </div>
                </div>
                <Progress value={(u.totalMessages / maxMessages) * 100} className="h-1.5" />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">{u.avgMessagesPerSession} msgs/session</span>
                  <span className="text-[10px] text-muted-foreground">
                    {u.lastActive ? `Last active ${format(new Date(u.lastActive), "MMM d")}` : "Never"}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No users found</p>
          )}
          {leaderboardTotalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-border/30">
              <p className="text-xs text-muted-foreground">Page {leaderboardPage + 1} of {leaderboardTotalPages}</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={leaderboardPage === 0}
                  onClick={() => setLeaderboardPage(p => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={leaderboardPage >= leaderboardTotalPages - 1}
                  onClick={() => setLeaderboardPage(p => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Avg Session Duration */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Avg Session Duration (min)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={sessionChartConfig} className="h-[200px] w-full">
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

      {/* Cumulative Feature Adoption */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Cumulative Feature Adoption (12 Weeks)
            {adoptionLoading && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground ml-1" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {adoptionLoading && weeklyAdoption.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
              Loading adoption data…
            </div>
          ) : (

          <ChartContainer config={adoptionChartConfig} className="h-[280px] w-full">
            <AreaChart data={weeklyAdoption}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="chat" fill="var(--color-chat)" stroke="var(--color-chat)" fillOpacity={0.2} />
              <Area type="monotone" dataKey="home" fill="var(--color-home)" stroke="var(--color-home)" fillOpacity={0.2} />
              <Area type="monotone" dataKey="forecast" fill="var(--color-forecast)" stroke="var(--color-forecast)" fillOpacity={0.2} />
              <Area type="monotone" dataKey="plan" fill="var(--color-plan)" stroke="var(--color-plan)" fillOpacity={0.2} />
              <Area type="monotone" dataKey="cheatSheet" fill="var(--color-cheatSheet)" stroke="var(--color-cheatSheet)" fillOpacity={0.2} />
            </AreaChart>
          </ChartContainer>
          )}
        </CardContent>

      </Card>

      {/* User Feedback */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" />
            User Feedback
            <Badge variant="outline" className="ml-1 text-[10px]">{feedbackItems.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {feedbackItems.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No feedback yet.</p>
          ) : (
            <ScrollArea className="h-[320px] pr-3">
              <div className="space-y-3">
                {feedbackItems.map((f) => (
                  <div key={f.id} className="border border-border/40 rounded-lg p-3 bg-card/40">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{f.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{f.email}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <Badge variant="outline" className="text-[9px] capitalize">{f.category}</Badge>
                        <p className="text-[9px] text-muted-foreground">{format(new Date(f.created_at), "MMM d, p")}</p>
                      </div>
                    </div>
                    <p className="text-xs text-foreground/90 whitespace-pre-wrap break-words">{f.message}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Menu Builder */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ChefHat className="w-4 h-4 text-primary" />
            Menu Builder
            <Badge variant="outline" className="ml-1 text-[10px]">{menuItems.length}</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">Who used the menu builder and what they built</p>
        </CardHeader>
        <CardContent>
          {menuItems.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No menus built yet.</p>
          ) : (
            <ScrollArea className="h-[320px] pr-3">
              <div className="space-y-2">
                {menuItems.map((m) => (
                  <div key={m.id} className="border border-border/40 rounded-lg p-3 bg-card/40 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">{m.title}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{m.name} · {m.email}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <Badge
                        variant="outline"
                        className={`text-[9px] capitalize ${m.status === "ready" ? "border-primary/40 text-primary" : ""}`}
                      >
                        {m.status}
                      </Badge>
                      <p className="text-[9px] text-muted-foreground">{format(new Date(m.created_at), "MMM d, p")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
