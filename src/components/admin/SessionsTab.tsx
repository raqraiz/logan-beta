import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Circle, Clock, Users, Activity, TrendingUp } from "lucide-react";
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

interface DailySessionStats {
  date: string;
  sessions: number;
  avgDuration: number;
}

const SESSION_GAP_MS = 30 * 60 * 1000;

const chartConfig = {
  sessions: { label: "Sessions", color: "hsl(var(--primary))" },
  avgDuration: { label: "Avg Duration (min)", color: "hsl(var(--accent))" },
} satisfies ChartConfig;

export const SessionsTab = () => {
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionRecord[]>([]);
  const [dailyStats, setDailyStats] = useState<DailySessionStats[]>([]);
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

  const fetchSessionData = async () => {
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

      // Fetch messages from last 30 days (paginated)
      let allMessages: { user_id: string; created_at: string }[] = [];
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
        allMessages = allMessages.concat(batch);
        if (batch.length < pageSize) break;
        from += pageSize;
      }

      // Build sessions from messages
      const messagesByUser = new Map<string, string[]>();
      for (const msg of allMessages) {
        if (!messagesByUser.has(msg.user_id)) messagesByUser.set(msg.user_id, []);
        messagesByUser.get(msg.user_id)!.push(msg.created_at);
      }

      const sessions: SessionRecord[] = [];
      const hourCounts = new Array(24).fill(0);

      for (const [userId, timestamps] of messagesByUser.entries()) {
        const sorted = timestamps.map((t) => new Date(t).getTime()).sort();
        const profile = profileMap.get(userId);

        let sessionStart = sorted[0];
        let sessionEnd = sorted[0];
        let msgCount = 1;

        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] - sorted[i - 1] > SESSION_GAP_MS) {
            // Close previous session
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
        // Close last session
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

      // Sort by most recent
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

      // Peak hour
      const peakHourIdx = hourCounts.indexOf(Math.max(...hourCounts));
      const peakHour = `${peakHourIdx.toString().padStart(2, "0")}:00`;

      // Totals
      const totalDuration = sessions.reduce((a, s) => a + s.durationMin, 0);
      const longestSession = sessions.length > 0 ? Math.max(...sessions.map((s) => s.durationMin)) : 0;
      const longestSessionRecord = sessions.find((s) => s.durationMin === longestSession);
      const longestSessionUser = longestSessionRecord?.fullName || "";

      // Per-user avg: average each user's mean session duration
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

      setRecentSessions(sessions.slice(0, 50));
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
  };

  useEffect(() => {
    fetchSessionData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-default h-full">
                <Card className="h-full">
                  <CardContent className="p-4 text-center">
                    <TrendingUp className="w-5 h-5 mx-auto mb-1 text-primary" />
                    <p className="text-2xl font-bold text-foreground">{totals.longestSession}m</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Longest Session</p>
                  </CardContent>
                </Card>
              </div>
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

      {/* Recent Sessions Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Messages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentSessions.slice(0, 20).map((s, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-sm">{s.fullName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(s.startTime), "MMM d, h:mm a")}
                  </TableCell>
                  <TableCell className="text-right text-sm">{s.durationMin}m</TableCell>
                  <TableCell className="text-right text-sm">{s.messageCount}</TableCell>
                </TableRow>
              ))}
              {recentSessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                    No sessions found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
