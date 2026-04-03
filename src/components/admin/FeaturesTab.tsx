import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, MessageSquare, Users2, Calendar, ThumbsUp, Ticket, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, subDays, parseISO, startOfWeek, eachWeekOfInterval } from "date-fns";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, AreaChart, Area } from "recharts";
import { Progress } from "@/components/ui/progress";

interface FeatureStats {
  name: string;
  icon: React.ReactNode;
  totalUsers: number;
  totalActions: number;
  adoptionRate: number; // percentage of all users
  avgPerUser: number;
  color: string;
}

interface WeeklyAdoption {
  week: string;
  chat: number;
  community: number;
  calendar: number;
  feedback: number;
}

interface TopUser {
  name: string;
  email: string;
  value: number;
}

const chartConfig = {
  chat: { label: "Chat", color: "hsl(var(--primary))" },
  community: { label: "Community", color: "hsl(262, 60%, 55%)" },
  calendar: { label: "Calendar", color: "hsl(200, 70%, 50%)" },
  feedback: { label: "Feedback", color: "hsl(142, 60%, 45%)" },
} satisfies ChartConfig;

export const FeaturesTab = () => {
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState<FeatureStats[]>([]);
  const [weeklyAdoption, setWeeklyAdoption] = useState<WeeklyAdoption[]>([]);
  const [chatDepth, setChatDepth] = useState<{ bucket: string; count: number }[]>([]);
  const [topChatUsers, setTopChatUsers] = useState<TopUser[]>([]);
  const [topCommunityUsers, setTopCommunityUsers] = useState<TopUser[]>([]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      // Fetch profiles for total user count and name lookup
      const { data: profiles } = await supabase.from("profiles").select("id, email, full_name, created_at");
      if (!profiles) return;
      const totalUsers = profiles.length;
      const profileMap = new Map(profiles.map((p) => [p.id, p]));

      // Paginated fetch helper
      const fetchAllRows = async (table: string, columns: string, filters?: { col: string; val: string }[]) => {
        let all: any[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          let q = (supabase.from(table) as any).select(columns).order("created_at", { ascending: true }).range(from, from + pageSize - 1);
          if (filters) filters.forEach((f) => (q = q.eq(f.col, f.val)));
          const { data } = await q;
          if (!data || data.length === 0) break;
          all = all.concat(data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return all;
      };

      // Fetch data in parallel
      const [chatMsgs, communityMsgs, calendarTokens, feedbackRows, promoRows] = await Promise.all([
        fetchAllRows("chat_messages", "user_id, created_at, role", [{ col: "role", val: "user" }]),
        fetchAllRows("community_messages", "user_id, created_at"),
        fetchAllRows("calendar_tokens", "user_id, created_at"),
        fetchAllRows("user_feedback", "user_id, created_at"),
        fetchAllRows("promo_redemptions", "user_id, created_at"),
      ]);

      // Unique users per feature
      const uniqueUsers = (rows: { user_id: string }[]) => new Set(rows.map((r) => r.user_id));
      const chatUsers = uniqueUsers(chatMsgs);
      const communityUsers = uniqueUsers(communityMsgs);
      const calendarUsers = uniqueUsers(calendarTokens);
      const feedbackUsers = uniqueUsers(feedbackRows);
      const promoUsers = uniqueUsers(promoRows);

      const makeFeature = (
        name: string,
        icon: React.ReactNode,
        users: Set<string>,
        actions: number,
        color: string
      ): FeatureStats => ({
        name,
        icon,
        totalUsers: users.size,
        totalActions: actions,
        adoptionRate: totalUsers > 0 ? Math.round((users.size / totalUsers) * 100) : 0,
        avgPerUser: users.size > 0 ? Math.round((actions / users.size) * 10) / 10 : 0,
        color,
      });

      setFeatures([
        makeFeature("Chat", <MessageSquare className="w-5 h-5" />, chatUsers, chatMsgs.length, "hsl(var(--primary))"),
        makeFeature("Community", <Users2 className="w-5 h-5" />, communityUsers, communityMsgs.length, "hsl(262, 60%, 55%)"),
        makeFeature("Calendar Sync", <Calendar className="w-5 h-5" />, calendarUsers, calendarTokens.length, "hsl(200, 70%, 50%)"),
        makeFeature("Feedback", <ThumbsUp className="w-5 h-5" />, feedbackUsers, feedbackRows.length, "hsl(142, 60%, 45%)"),
        makeFeature("Promo Codes", <Ticket className="w-5 h-5" />, promoUsers, promoRows.length, "hsl(30, 80%, 55%)"),
      ]);

      // Weekly adoption: count cumulative unique users per feature per week
      const now = new Date();
      const twelveWeeksAgo = subDays(now, 84);
      const weeks = eachWeekOfInterval({ start: twelveWeeksAgo, end: now }, { weekStartsOn: 1 });

      const firstUseByFeature = (rows: { user_id: string; created_at: string }[]) => {
        const first = new Map<string, Date>();
        for (const r of rows) {
          const d = new Date(r.created_at);
          if (!first.has(r.user_id) || d < first.get(r.user_id)!) first.set(r.user_id, d);
        }
        return first;
      };

      const chatFirst = firstUseByFeature(chatMsgs);
      const communityFirst = firstUseByFeature(communityMsgs);
      const calendarFirst = firstUseByFeature(calendarTokens);
      const feedbackFirst = firstUseByFeature(feedbackRows);

      const cumulativeByWeek = (firstMap: Map<string, Date>, weekEnd: Date) => {
        let count = 0;
        firstMap.forEach((d) => { if (d <= weekEnd) count++; });
        return count;
      };

      setWeeklyAdoption(
        weeks.map((w) => {
          const weekEnd = new Date(w.getTime() + 7 * 24 * 60 * 60 * 1000);
          return {
            week: format(w, "MMM d"),
            chat: cumulativeByWeek(chatFirst, weekEnd),
            community: cumulativeByWeek(communityFirst, weekEnd),
            calendar: cumulativeByWeek(calendarFirst, weekEnd),
            feedback: cumulativeByWeek(feedbackFirst, weekEnd),
          };
        })
      );

      // Chat depth distribution
      const msgCountByUser = new Map<string, number>();
      for (const m of chatMsgs) {
        msgCountByUser.set(m.user_id, (msgCountByUser.get(m.user_id) || 0) + 1);
      }
      const buckets = [
        { label: "1-10", min: 1, max: 10 },
        { label: "11-50", min: 11, max: 50 },
        { label: "51-100", min: 51, max: 100 },
        { label: "101-200", min: 101, max: 200 },
        { label: "200+", min: 201, max: Infinity },
      ];
      setChatDepth(
        buckets.map((b) => ({
          bucket: b.label,
          count: Array.from(msgCountByUser.values()).filter((v) => v >= b.min && v <= b.max).length,
        }))
      );

      // Top users per feature
      const topN = (rows: { user_id: string }[], n: number): TopUser[] => {
        const counts = new Map<string, number>();
        for (const r of rows) counts.set(r.user_id, (counts.get(r.user_id) || 0) + 1);
        return Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, n)
          .map(([uid, val]) => {
            const p = profileMap.get(uid);
            return { name: p?.full_name || "Unknown", email: p?.email || "", value: val };
          });
      };

      setTopChatUsers(topN(chatMsgs, 5));
      setTopCommunityUsers(topN(communityMsgs, 5));
    } catch (err) {
      console.error("Error fetching feature analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Feature Analytics</h2>
        <Button variant="ghost" size="sm" onClick={fetchAll}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Feature Usage Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f) => (
          <Card key={f.name}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="text-primary">{f.icon}</div>
                <div>
                  <p className="font-semibold text-foreground">{f.name}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {f.adoptionRate}% adoption
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-foreground">{f.totalUsers}</p>
                  <p className="text-[10px] text-muted-foreground">Users</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{f.totalActions}</p>
                  <p className="text-[10px] text-muted-foreground">Actions</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{f.avgPerUser}</p>
                  <p className="text-[10px] text-muted-foreground">Avg/User</p>
                </div>
              </div>
              <Progress value={f.adoptionRate} className="h-1.5 mt-3" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Adoption Over Time */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Cumulative Feature Adoption (12 Weeks)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <AreaChart data={weeklyAdoption}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="chat" stackId="1" fill="var(--color-chat)" stroke="var(--color-chat)" fillOpacity={0.3} />
              <Area type="monotone" dataKey="community" stackId="1" fill="var(--color-community)" stroke="var(--color-community)" fillOpacity={0.3} />
              <Area type="monotone" dataKey="calendar" stackId="1" fill="var(--color-calendar)" stroke="var(--color-calendar)" fillOpacity={0.3} />
              <Area type="monotone" dataKey="feedback" stackId="1" fill="var(--color-feedback)" stroke="var(--color-feedback)" fillOpacity={0.3} />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Chat Engagement Depth */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Chat Engagement Depth</CardTitle>
          <p className="text-xs text-muted-foreground">Distribution of users by total messages sent</p>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{ count: { label: "Users", color: "hsl(var(--primary))" } }} className="h-[200px] w-full">
            <BarChart data={chatDepth}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Top Users by Feature */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Top Chat Users
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topChatUsers.map((u, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}</span>
                  <span className="text-sm text-foreground truncate">{u.name}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">{u.value} msgs</Badge>
              </div>
            ))}
            {topChatUsers.length === 0 && <p className="text-sm text-muted-foreground text-center py-2">No data</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users2 className="w-4 h-4" /> Top Community Users
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topCommunityUsers.map((u, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}</span>
                  <span className="text-sm text-foreground truncate">{u.name}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] shrink-0">{u.value} posts</Badge>
              </div>
            ))}
            {topCommunityUsers.length === 0 && <p className="text-sm text-muted-foreground text-center py-2">No data</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
