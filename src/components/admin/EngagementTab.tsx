import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Users, MessageSquare, Activity, TrendingUp, Clock, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, subDays, differenceInDays, startOfDay, parseISO } from "date-fns";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, ResponsiveContainer } from "recharts";
import { Progress } from "@/components/ui/progress";

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

const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes

const chartConfig = {
  messages: { label: "Messages", color: "hsl(var(--primary))" },
  activeUsers: { label: "Active Users", color: "hsl(var(--accent))" },
} satisfies ChartConfig;

export const EngagementTab = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserEngagement[]>([]);
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([]);
  const [totals, setTotals] = useState({
    totalUsers: 0,
    totalMessages: 0,
    activeToday: 0,
    activeThisWeek: 0,
    avgSessionsPerUser: 0,
    avgMessagesPerUser: 0,
  });

  const fetchEngagementData = async () => {
    setLoading(true);
    try {
      // Fetch all profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, created_at");

      if (!profiles) return;

      // Fetch all messages (paginated to avoid 1000 limit)
      let allMessages: { user_id: string; created_at: string; role: string }[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data: batch } = await supabase
          .from("chat_messages")
          .select("user_id, created_at, role")
          .eq("role", "user")
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (!batch || batch.length === 0) break;
        allMessages = allMessages.concat(batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }

      // Fetch activity events to capture users who browsed without chatting
      let allActivity: { user_id: string; created_at: string }[] = [];
      let actFrom = 0;
      while (true) {
        const { data: batch } = await supabase
          .from("user_activity_events")
          .select("user_id, created_at")
          .order("created_at", { ascending: true })
          .range(actFrom, actFrom + pageSize - 1);
        if (!batch || batch.length === 0) break;
        allActivity = allActivity.concat(batch);
        if (batch.length < pageSize) break;
        actFrom += pageSize;
      }

      // Group messages by user
      const messagesByUser = new Map<string, string[]>();
      for (const msg of allMessages) {
        if (!messagesByUser.has(msg.user_id)) messagesByUser.set(msg.user_id, []);
        messagesByUser.get(msg.user_id)!.push(msg.created_at);
      }

      // Group all activity (messages + events) by user for accurate active tracking
      const allActivityByUser = new Map<string, string[]>();
      for (const msg of allMessages) {
        if (!allActivityByUser.has(msg.user_id)) allActivityByUser.set(msg.user_id, []);
        allActivityByUser.get(msg.user_id)!.push(msg.created_at);
      }
      for (const evt of allActivity) {
        if (!allActivityByUser.has(evt.user_id)) allActivityByUser.set(evt.user_id, []);
        allActivityByUser.get(evt.user_id)!.push(evt.created_at);
      }

      // Calculate per-user engagement
      const now = new Date();
      const todayStart = startOfDay(now);
      const weekAgo = subDays(now, 7);
      let activeToday = 0;
      let activeThisWeek = 0;
      let totalSessions = 0;

      const userEngagements: UserEngagement[] = profiles.map((p) => {
        const msgTimestamps = (messagesByUser.get(p.id) || []).map((t) => new Date(t).getTime()).sort();
        const totalMessages = msgTimestamps.length;

        // Use combined activity (messages + events) for sessions & last active
        const allTimestamps = (allActivityByUser.get(p.id) || []).map((t) => new Date(t).getTime()).sort();

        // Calculate sessions from all activity
        let sessions = 0;
        if (allTimestamps.length > 0) {
          sessions = 1;
          for (let i = 1; i < allTimestamps.length; i++) {
            if (allTimestamps[i] - allTimestamps[i - 1] > SESSION_GAP_MS) sessions++;
          }
        }
        totalSessions += sessions;

        const lastActive = allTimestamps.length > 0 ? new Date(allTimestamps[allTimestamps.length - 1]).toISOString() : null;
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

      // Sort by total messages desc
      userEngagements.sort((a, b) => b.totalMessages - a.totalMessages);

      // Daily activity for last 30 days — count active users from both sources
      const days = 30;
      const dailyMap = new Map<string, { messages: number; users: Set<string> }>();
      for (let i = 0; i < days; i++) {
        const d = format(subDays(now, i), "yyyy-MM-dd");
        dailyMap.set(d, { messages: 0, users: new Set() });
      }
      for (const msg of allMessages) {
        const d = format(new Date(msg.created_at), "yyyy-MM-dd");
        if (dailyMap.has(d)) {
          dailyMap.get(d)!.messages++;
          dailyMap.get(d)!.users.add(msg.user_id);
        }
      }
      for (const evt of allActivity) {
        const d = format(new Date(evt.created_at), "yyyy-MM-dd");
        if (dailyMap.has(d)) {
          dailyMap.get(d)!.users.add(evt.user_id);
        }
      }
      const daily: DailyActivity[] = Array.from(dailyMap.entries())
        .map(([date, v]) => ({ date: format(parseISO(date), "MMM d"), messages: v.messages, activeUsers: v.users.size }))
        .reverse();

      setUsers(userEngagements);
      setDailyActivity(daily);
      setTotals({
        totalUsers: profiles.length,
        totalMessages: allMessages.length,
        activeToday,
        activeThisWeek,
        avgSessionsPerUser: profiles.length > 0 ? Math.round((totalSessions / profiles.length) * 10) / 10 : 0,
        avgMessagesPerUser: profiles.length > 0 ? Math.round((allMessages.length / profiles.length) * 10) / 10 : 0,
      });
    } catch (err) {
      console.error("Error fetching engagement data:", err);
    } finally {
      setLoading(false);
    }
  };

  const activeTodayUsers = useMemo(() => {
    const start = startOfDay(new Date());
    return users
      .filter((u) => u.lastActive && new Date(u.lastActive) >= start)
      .sort((a, b) => new Date(b.lastActive!).getTime() - new Date(a.lastActive!).getTime());
  }, [users]);

  const activeWeekUsers = useMemo(() => {
    const start = subDays(new Date(), 7);
    return users
      .filter((u) => u.lastActive && new Date(u.lastActive) >= start)
      .sort((a, b) => new Date(b.lastActive!).getTime() - new Date(a.lastActive!).getTime());
  }, [users]);

  useEffect(() => {
    fetchEngagementData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const maxMessages = Math.max(...users.map((u) => u.totalMessages), 1);

  const UserListPopover = ({ userList, label }: { userList: UserEngagement[]; label: string }) => (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground mb-2">{label}</p>
      {userList.length === 0 && <p className="text-xs text-muted-foreground">No users</p>}
      {userList.map((u) => {
        const lastActiveDate = u.lastActive ? new Date(u.lastActive) : null;
        const isToday = lastActiveDate && lastActiveDate >= startOfDay(new Date());
        const timeLabel = lastActiveDate
          ? isToday
            ? format(lastActiveDate, "h:mm a")
            : format(lastActiveDate, "MMM d, h:mm a")
          : "";
        return (
          <div key={u.userId} className="flex items-center justify-between gap-2">
            <span className="text-xs text-foreground truncate">{u.fullName}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">{timeLabel}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Engagement Overview</h2>
        <Button variant="ghost" size="sm" onClick={fetchEngagementData}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold text-foreground">{totals.totalUsers}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Users</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <MessageSquare className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold text-foreground">{totals.totalMessages}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Messages</p>
          </CardContent>
        </Card>
        <Popover>
          <PopoverTrigger asChild>
            <Card className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardContent className="p-4 text-center">
                <Activity className="w-5 h-5 mx-auto mb-1 text-green-500" />
                <p className="text-2xl font-bold text-foreground">{totals.activeToday}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active Today</p>
              </CardContent>
            </Card>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <UserListPopover userList={activeTodayUsers} label="Active Today" />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Card className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-5 h-5 mx-auto mb-1 text-blue-500" />
                <p className="text-2xl font-bold text-foreground">{totals.activeThisWeek}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active This Week</p>
              </CardContent>
            </Card>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <UserListPopover userList={activeWeekUsers} label="Active This Week" />
          </PopoverContent>
        </Popover>
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="w-5 h-5 mx-auto mb-1 text-orange-500" />
            <p className="text-2xl font-bold text-foreground">{totals.avgSessionsPerUser}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Sessions/User</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <BarChart3 className="w-5 h-5 mx-auto mb-1 text-purple-500" />
            <p className="text-2xl font-bold text-foreground">{totals.avgMessagesPerUser}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Msgs/User</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Activity Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Daily Activity (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[250px] w-full">
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

      {/* Per-User Leaderboard */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">User Engagement Leaderboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {users.map((u, i) => (
            <div key={u.userId} className="flex items-center gap-3">
              <span className="text-xs font-mono text-muted-foreground w-5 text-right">{i + 1}</span>
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
                  <span className="text-[10px] text-muted-foreground">
                    {u.avgMessagesPerSession} msgs/session
                  </span>
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
        </CardContent>
      </Card>
    </div>
  );
};
