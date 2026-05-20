import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, MessageSquare, Users2, Calendar, ThumbsUp, Ticket, TrendingUp, Home, Eye, CheckCircle, BookOpen, ClipboardList, MessageCircle, ChefHat } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { format, subDays, eachWeekOfInterval } from "date-fns";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area } from "recharts";
import { Progress } from "@/components/ui/progress";

interface FeatureStats {
  name: string;
  icon: React.ReactNode;
  totalUsers: number;
  totalActions: number;
  adoptionRate: number;
  avgPerUser: number;
  comingSoon?: boolean;
  userNames?: string[];
}

interface WeeklyAdoption {
  week: string;
  chat: number;
  community: number;
  calendar: number;
  home: number;
  forecast: number;
  plan: number;
  cheatSheet: number;
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
  home: { label: "Home", color: "hsl(30, 80%, 55%)" },
  forecast: { label: "Forecast", color: "hsl(142, 60%, 45%)" },
  plan: { label: "Plan", color: "hsl(340, 65%, 50%)" },
  cheatSheet: { label: "Cheat Sheet", color: "hsl(50, 70%, 45%)" },
} satisfies ChartConfig;

type TableName = "chat_messages" | "community_messages" | "calendar_tokens" | "user_feedback" | "promo_redemptions";

const fetchAllRows = async (table: TableName, columns: string, filters?: { col: string; val: string }[]) => {
  let all: any[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    let q = supabase.from(table).select(columns).order("created_at", { ascending: true }).range(from, from + pageSize - 1) as any;
    if (filters) filters.forEach((f) => (q = q.eq(f.col, f.val)));
    const { data } = await q;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
};

export const FeaturesTab = () => {
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState<FeatureStats[]>([]);
  const [weeklyAdoption, setWeeklyAdoption] = useState<WeeklyAdoption[]>([]);
  const [chatDepth, setChatDepth] = useState<{ bucket: string; count: number }[]>([]);
  const [topChatUsers, setTopChatUsers] = useState<TopUser[]>([]);
  const [topCommunityUsers, setTopCommunityUsers] = useState<TopUser[]>([]);
  const [onboardingStats, setOnboardingStats] = useState({ completed: 0, total: 0, rate: 0 });
  const [feedbackItems, setFeedbackItems] = useState<{ id: string; name: string; email: string; category: string; message: string; created_at: string }[]>([]);
  const [menuItems, setMenuItems] = useState<{ id: string; name: string; email: string; title: string; status: string; created_at: string }[]>([]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const { data: profiles } = await supabase.from("profiles").select("id, email, full_name, created_at");
      if (!profiles) return;
      const totalUsers = profiles.length;
      const profileMap = new Map(profiles.map((p) => [p.id, p]));

      // Fetch all data in parallel
      const [chatMsgs, communityMsgs, calendarTokens, feedbackRows, promoRows] = await Promise.all([
        fetchAllRows("chat_messages", "user_id, created_at, role, message_type, metadata", [{ col: "role", val: "user" }]),
        fetchAllRows("community_messages", "user_id, created_at"),
        fetchAllRows("calendar_tokens", "user_id, created_at"),
        fetchAllRows("user_feedback", "user_id, created_at"),
        fetchAllRows("promo_redemptions", "user_id, created_at"),
      ]);

      // Feedback list (with author)
      const { data: feedbackFull } = await supabase
        .from("user_feedback")
        .select("id, user_id, category, message, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      setFeedbackItems(
        (feedbackFull ?? []).map((f: any) => {
          const p = profileMap.get(f.user_id);
          return {
            id: f.id,
            name: p?.full_name || "Unknown",
            email: p?.email || "",
            category: f.category,
            message: f.message,
            created_at: f.created_at,
          };
        })
      );

      // Menu builder usage
      const { data: menuFull } = await supabase
        .from("user_resources")
        .select("id, user_id, title, status, created_at")
        .eq("type", "meal_plan")
        .order("created_at", { ascending: false })
        .limit(200);
      setMenuItems(
        (menuFull ?? []).map((m: any) => {
          const p = profileMap.get(m.user_id);
          return {
            id: m.id,
            name: p?.full_name || "Unknown",
            email: p?.email || "",
            title: m.title || "Untitled menu",
            status: m.status,
            created_at: m.created_at,
          };
        })
      );

      // Fetch feature events (home_tab, cycle_forecast)
      let allEvents: { user_id: string; feature_name: string; created_at: string }[] = [];
      let evFrom = 0;
      while (true) {
        const { data } = await (supabase.from("feature_events" as any).select("user_id, feature_name, created_at").order("created_at", { ascending: true }).range(evFrom, evFrom + 999) as any);
        if (!data || data.length === 0) break;
        allEvents = allEvents.concat(data);
        if (data.length < 1000) break;
        evFrom += 1000;
      }

      const homeEvents = allEvents.filter((e) => e.feature_name === "home_tab");
      const forecastEvents = allEvents.filter((e) => e.feature_name === "cycle_forecast");
      const planEvents = allEvents.filter((e) => e.feature_name === "plan_tab");
      const cheatSheetEvents = allEvents.filter((e) => e.feature_name === "phase_cheat_sheet");

      // Unique users per feature
      const uniqueUsers = (rows: { user_id: string }[]) => new Set(rows.map((r) => r.user_id));
      const chatUsers = uniqueUsers(chatMsgs);
      const communityUsers = uniqueUsers(communityMsgs);
      const calendarUsers = uniqueUsers(calendarTokens);
      const feedbackUsers = uniqueUsers(feedbackRows);
      const promoUsers = uniqueUsers(promoRows);
      const homeUsers = uniqueUsers(homeEvents);
      const forecastUsers = uniqueUsers(forecastEvents);
      const planUsers = uniqueUsers(planEvents);
      const cheatSheetUsers = uniqueUsers(cheatSheetEvents);

      const makeFeature = (
        name: string,
        icon: React.ReactNode,
        users: Set<string>,
        actions: number
      ): FeatureStats => ({
        name,
        icon,
        totalUsers: users.size,
        totalActions: actions,
        adoptionRate: totalUsers > 0 ? Math.round((users.size / totalUsers) * 100) : 0,
        avgPerUser: users.size > 0 ? Math.round((actions / users.size) * 10) / 10 : 0,
        userNames: Array.from(users).map((uid) => {
          const p = profileMap.get(uid);
          return p?.full_name || p?.email || "Unknown";
        }),
      });

      setFeatures([
        makeFeature("Chat", <MessageSquare className="w-5 h-5" />, chatUsers, chatMsgs.length),
        makeFeature("Home Tab", <Home className="w-5 h-5" />, homeUsers, homeEvents.length),
        makeFeature("Plan Tab", <ClipboardList className="w-5 h-5" />, planUsers, planEvents.length),
        makeFeature("Cycle Forecast", <Eye className="w-5 h-5" />, forecastUsers, forecastEvents.length),
        makeFeature("Phase Cheat Sheet", <BookOpen className="w-5 h-5" />, cheatSheetUsers, cheatSheetEvents.length),
        { name: "Community", icon: <Users2 className="w-5 h-5" />, totalUsers: 0, totalActions: 0, adoptionRate: 0, avgPerUser: 0, comingSoon: true },
        { name: "Calendar Sync", icon: <Calendar className="w-5 h-5" />, totalUsers: 0, totalActions: 0, adoptionRate: 0, avgPerUser: 0, comingSoon: true },
        { name: "Feedback", icon: <ThumbsUp className="w-5 h-5" />, totalUsers: 0, totalActions: 0, adoptionRate: 0, avgPerUser: 0, comingSoon: true },
        { name: "Promo Codes", icon: <Ticket className="w-5 h-5" />, totalUsers: 0, totalActions: 0, adoptionRate: 0, avgPerUser: 0, comingSoon: true },
      ]);

      // Onboarding completion: check for onboarding_complete in chat_messages metadata
      const allOnboardingMsgs = await fetchAllRows("chat_messages", "user_id, metadata, message_type", [{ col: "role", val: "assistant" }]);
      const completedUsers = new Set<string>();
      for (const msg of allOnboardingMsgs) {
        if (msg.metadata && typeof msg.metadata === "object") {
          if ((msg.metadata as any).onboarding_complete === true) {
            completedUsers.add(msg.user_id);
          }
        }
      }
      setOnboardingStats({
        completed: completedUsers.size,
        total: totalUsers,
        rate: totalUsers > 0 ? Math.round((completedUsers.size / totalUsers) * 100) : 0,
      });

      // Weekly adoption (cumulative)
      const now = new Date();
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
      const communityFirst = firstUse(communityMsgs);
      const calendarFirst = firstUse(calendarTokens);
      const homeFirst = firstUse(homeEvents);
      const forecastFirst = firstUse(forecastEvents);
      const planFirst = firstUse(planEvents);
      const cheatSheetFirst = firstUse(cheatSheetEvents);

      const cumulative = (firstMap: Map<string, Date>, weekEnd: Date) => {
        let count = 0;
        firstMap.forEach((d) => { if (d <= weekEnd) count++; });
        return count;
      };

      setWeeklyAdoption(
        weeks.map((w) => {
          const weekEnd = new Date(w.getTime() + 7 * 24 * 60 * 60 * 1000);
          return {
            week: format(w, "MMM d"),
            chat: cumulative(chatFirst, weekEnd),
            community: cumulative(communityFirst, weekEnd),
            calendar: cumulative(calendarFirst, weekEnd),
            home: cumulative(homeFirst, weekEnd),
            forecast: cumulative(forecastFirst, weekEnd),
            plan: cumulative(planFirst, weekEnd),
            cheatSheet: cumulative(cheatSheetFirst, weekEnd),
          };
        })
      );

      // Chat depth distribution
      const msgCount = new Map<string, number>();
      for (const m of chatMsgs) msgCount.set(m.user_id, (msgCount.get(m.user_id) || 0) + 1);
      const buckets = [
        { label: "1-10", min: 1, max: 10 },
        { label: "11-50", min: 11, max: 50 },
        { label: "51-100", min: 51, max: 100 },
        { label: "101-200", min: 101, max: 200 },
        { label: "200+", min: 201, max: Infinity },
      ];
      setChatDepth(buckets.map((b) => ({
        bucket: b.label,
        count: Array.from(msgCount.values()).filter((v) => v >= b.min && v <= b.max).length,
      })));

      // Top users
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

      {/* Menu Builder Usage */}
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

      {/* Onboarding Completion */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <CheckCircle className="w-5 h-5 text-primary" />
            <div>
              <p className="font-semibold text-foreground">Onboarding Completion</p>
              <p className="text-xs text-muted-foreground">
                {onboardingStats.completed} of {onboardingStats.total} users completed ({onboardingStats.rate}%)
              </p>
            </div>
          </div>
          <Progress value={onboardingStats.rate} className="h-2" />
        </CardContent>
      </Card>

      {/* Feature Usage Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f) => (
          <HoverCard key={f.name} openDelay={200}>
            <HoverCardTrigger asChild>
              <Card className={`cursor-default ${f.comingSoon ? "opacity-50" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-primary">{f.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{f.name}</p>
                        {f.comingSoon && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground border-muted-foreground/30">
                            Coming Soon
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {f.comingSoon ? "Not yet launched" : `${f.adoptionRate}% adoption`}
                      </p>
                    </div>
                  </div>
                  {f.comingSoon ? (
                    <p className="text-xs text-muted-foreground text-center py-3">Tracking will begin once this feature is live</p>
                  ) : (
                    <>
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
                    </>
                  )}
                </CardContent>
              </Card>
            </HoverCardTrigger>
            {!f.comingSoon && f.userNames && f.userNames.length > 0 && (
              <HoverCardContent className="w-56 p-3" side="bottom" align="start">
                <p className="text-xs font-semibold text-foreground mb-2">Users ({f.userNames.length})</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {f.userNames.map((name, i) => (
                    <p key={i} className="text-xs text-muted-foreground truncate">{name}</p>
                  ))}
                </div>
              </HoverCardContent>
            )}
          </HoverCard>
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
              <Area type="monotone" dataKey="chat" fill="var(--color-chat)" stroke="var(--color-chat)" fillOpacity={0.2} />
              <Area type="monotone" dataKey="home" fill="var(--color-home)" stroke="var(--color-home)" fillOpacity={0.2} />
              <Area type="monotone" dataKey="forecast" fill="var(--color-forecast)" stroke="var(--color-forecast)" fillOpacity={0.2} />
              <Area type="monotone" dataKey="community" fill="var(--color-community)" stroke="var(--color-community)" fillOpacity={0.2} />
              <Area type="monotone" dataKey="calendar" fill="var(--color-calendar)" stroke="var(--color-calendar)" fillOpacity={0.2} />
              <Area type="monotone" dataKey="plan" fill="var(--color-plan)" stroke="var(--color-plan)" fillOpacity={0.2} />
              <Area type="monotone" dataKey="cheatSheet" fill="var(--color-cheatSheet)" stroke="var(--color-cheatSheet)" fillOpacity={0.2} />
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

      {/* Top Users */}
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
