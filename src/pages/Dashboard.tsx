import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { SleepCheckIn } from "@/components/dashboard/SleepCheckIn";
import { TodayInsight } from "@/components/dashboard/TodayInsight";
import { SmartCycleMap } from "@/components/dashboard/SmartCycleMap";
import { CycleForecast } from "@/components/dashboard/CycleForecast";
import { DayInsights } from "@/components/dashboard/DayInsights";
import { LoganBot } from "@/components/dashboard/LoganBot";
import { Bot, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentCycleDay, setCurrentCycleDay] = useState(5);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Logged out successfully" });
    navigate("/auth");
  };

  // Get user first name from email
  const firstName = user?.email?.split("@")[0]?.split(".")[0] || "there";
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);

  return (
    <div className="min-h-screen bg-logan-jet text-logan-frost">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-logan-jet/95 backdrop-blur-sm border-b border-logan-slate/20">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-logan-graphite flex items-center justify-center">
              <Bot className="w-4 h-4 text-logan-cyan" />
            </div>
            <span className="font-display font-semibold text-logan-cyan">Logan</span>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-logan-frost/60 hover:text-logan-frost hover:bg-logan-graphite"
            >
              <Settings className="w-5 h-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLogout}
              className="text-logan-frost/60 hover:text-logan-frost hover:bg-logan-graphite"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 pb-24 space-y-6">
        {/* Title */}
        <div className="space-y-1">
          <h1 className="text-3xl font-display font-bold text-logan-cyan">
            Your Dashboard
          </h1>
          <p className="text-logan-frost/60">
            Context for when to push and when to pull back
          </p>
        </div>

        {/* Sleep Check-in */}
        <SleepCheckIn />

        {/* Today's Insight */}
        <TodayInsight 
          dayNumber={currentCycleDay} 
          userName={displayName}
        />

        {/* Smart Cycle Map */}
        <SmartCycleMap 
          currentDay={currentCycleDay}
          phase="menstruation"
        />

        {/* Cycle Forecast Calendar */}
        <CycleForecast 
          selectedDate={selectedDate}
          onDateSelect={setSelectedDate}
          currentCycleDay={currentCycleDay}
        />

        {/* Day Insights */}
        <DayInsights dayNumber={currentCycleDay} />
      </main>

      {/* Floating Logan Bot */}
      <LoganBot />
    </div>
  );
};

export default Dashboard;
