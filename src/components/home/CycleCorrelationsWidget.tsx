import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp, ChevronRight, Sparkles, CalendarIcon } from "lucide-react";
import { CycleCorrelationDetail } from "./CycleCorrelationDetail";
import { AddTrackerDialog } from "./AddTrackerDialog";
import { toast } from "sonner";
import { calculateCycleInfo } from "@/components/chat/ChatCycleCircle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Tracker {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
}

interface Props {
  userId: string;
  cyclePhase: string;
  cycleDay: number;
  lastPeriodStart?: string;
  cycleLengthDays: number;
  isNonCycling: boolean;
}

const QUICK_INTENSITIES = [0, 1, 2, 3, 4, 5];

export function CycleCorrelationsWidget({
  userId,
  cyclePhase,
  cycleDay,
  lastPeriodStart,
  cycleLengthDays,
  isNonCycling,
}: Props) {
  const [trackers, setTrackers] = useState<Tracker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [activeTracker, setActiveTracker] = useState<Tracker | null>(null);
  const [logging, setLogging] = useState<string | null>(null);

  const [logDate, setLogDate] = useState<Date>(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);

  const isToday = useMemo(() => logDate.toDateString() === new Date().toDateString(), [logDate]);

  const effectiveCycleInfo = useMemo(() => {
    if (isNonCycling) return { cycleDay: null as number | null, phase: null as string | null };
    if (isToday) return { cycleDay, phase: cyclePhase };
    if (lastPeriodStart && cycleLengthDays) {
      const info = calculateCycleInfo(lastPeriodStart, cycleLengthDays, undefined, logDate);
      if (info) return { cycleDay: info.cycleDay, phase: info.phase };
    }
    return { cycleDay: null, phase: null };
  }, [isToday, isNonCycling, cycleDay, cyclePhase, lastPeriodStart, cycleLengthDays, logDate]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("custom_trackers")
      .select("id, name, emoji, description")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("source", "user")
      .order("created_at", { ascending: true });
    setTrackers((data as Tracker[]) || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (userId) load();
  }, [userId, load]);

  const quickLog = async (trackerId: string, intensity: number) => {
    setLogging(trackerId);
    const loggedAt = isToday
      ? new Date().toISOString()
      : new Date(Date.UTC(logDate.getFullYear(), logDate.getMonth(), logDate.getDate(), 12, 0, 0)).toISOString();
    const { error } = await supabase.from("tracker_logs").insert({
      user_id: userId,
      tracker_id: trackerId,
      intensity,
      cycle_phase: effectiveCycleInfo.phase,
      cycle_day: effectiveCycleInfo.cycleDay,
      logged_at: loggedAt,
    });
    setLogging(null);
    if (error) {
      toast.error("Couldn't save log");
    } else {
      toast.success(isToday ? "Logged" : `Logged for ${format(logDate, "MMM d")}`);
    }
  };

  const handleAdded = () => {
    setShowAdd(false);
    load();
  };

  return (
    <div
      className="w-full rounded-2xl border border-border/40 border-l-[3px] border-l-teal-500
        bg-card/50 backdrop-blur-md overflow-hidden relative"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-teal-500/10 via-teal-500/5 to-transparent pointer-events-none" />

      <div className="relative px-5 py-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-lg bg-teal-500/15 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-teal-400" />
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-teal-400/80">
            Cycle Correlations
          </span>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : trackers.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground/80 leading-snug">
              Wondering if something — surfing, mood, focus, loneliness — is tied to your cycle?
              Track it daily and Logan will show you the pattern.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Track something
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Logging for</span>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs px-2.5">
                    <CalendarIcon className="w-3 h-3" />
                    {isToday ? "Today" : format(logDate, "EEE, MMM d")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={logDate}
                    onSelect={(d) => { if (d) { setLogDate(d); setCalendarOpen(false); } }}
                    disabled={(d) => d > new Date() || d < new Date(Date.now() - 1000 * 60 * 60 * 24 * 90)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {!isToday && (
                <button
                  onClick={() => setLogDate(new Date())}
                  className="text-[10px] text-muted-foreground/70 hover:text-foreground underline underline-offset-2"
                >
                  reset
                </button>
              )}
              {!isToday && !isNonCycling && effectiveCycleInfo.cycleDay && (
                <span className="text-[10px] text-muted-foreground ml-auto">
                  Day {effectiveCycleInfo.cycleDay} · {effectiveCycleInfo.phase}
                </span>
              )}
            </div>
            {trackers.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-border/30 bg-background/40 p-3 space-y-2"
              >
                <button
                  onClick={() => setActiveTracker(t)}
                  className="w-full flex items-center justify-between gap-2 group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base">{t.emoji}</span>
                    <span className="text-sm font-medium text-foreground truncate">{t.name}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </button>
                <div className="flex items-center gap-1.5">
                  {QUICK_INTENSITIES.map((i) => (
                    <button
                      key={i}
                      onClick={() => quickLog(t.id, i)}
                      disabled={logging === t.id}
                      className="flex-1 h-7 rounded-md border border-border/40 bg-background/60
                        hover:bg-teal-500/10 hover:border-teal-500/40 transition-colors
                        text-xs text-foreground/80 disabled:opacity-50"
                      aria-label={`Rate ${i} (0 = none, 5 = max)`}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 w-full justify-center text-xs h-8"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Track something else
            </Button>
          </div>
        )}
      </div>

      <AddTrackerDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        userId={userId}
        onAdded={handleAdded}
      />

      {activeTracker && (
        <CycleCorrelationDetail
          tracker={activeTracker}
          userId={userId}
          lastPeriodStart={lastPeriodStart}
          cycleLengthDays={cycleLengthDays}
          isNonCycling={isNonCycling}
          open={!!activeTracker}
          onOpenChange={(o) => !o && setActiveTracker(null)}
          onDeleted={() => {
            setActiveTracker(null);
            load();
          }}
          onUpdated={(updated) => {
            setActiveTracker((prev) => (prev ? { ...prev, ...updated } : prev));
            load();
          }}
        />
      )}
    </div>
  );
}
