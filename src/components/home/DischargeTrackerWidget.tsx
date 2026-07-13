import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Droplet, Check, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { format, subDays } from "date-fns";
import { calculateCycleInfo } from "@/components/chat/ChatCycleCircle";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * DischargeTrackerWidget
 *
 * Clearer, more concrete UX for cervical-fluid tracking. Each type has:
 *  - a plain-language description ("like raw egg white, stretchy")
 *  - a visual swatch (color + texture pattern)
 *  - a fertility cue ("peak fertility window")
 *
 * Persists as a symptom_log entry with name "Discharge: <Type>" so it shows up
 * in Symptom History/Patterns automatically.
 */

interface DischargeTrackerWidgetProps {
  userId: string;
  cycleDay?: number;
  phase?: string;
  lastPeriodStart?: string;
  cycleLengthDays?: number;
  isNonCycling?: boolean;
  onLogged?: () => void;
  lifeStage?: string;
}

type FertilityCue = "low" | "rising" | "peak" | "alert";

interface DischargeType {
  key: string;
  label: string;
  short: string; // shown on chip
  description: string; // plain-language "what it looks/feels like"
  fertility: FertilityCue;
  swatch: string; // tailwind class for the color circle
  texture: "smooth" | "creamy" | "watery" | "stretchy" | "dry" | "spotting";
}

const DISCHARGE_TYPES: DischargeType[] = [
  {
    key: "dry",
    label: "Dry / None",
    short: "Dry",
    description: "Nothing noticeable. Underwear stays clean and dry.",
    fertility: "low",
    swatch: "bg-amber-100/40 border-amber-200/40",
    texture: "dry",
  },
  {
    key: "sticky",
    label: "Sticky / Tacky",
    short: "Sticky",
    description: "Pasty or crumbly, like rubber cement or school glue dried on your finger. Doesn't stretch.",
    fertility: "low",
    swatch: "bg-yellow-100/60 border-yellow-200/50",
    texture: "smooth",
  },
  {
    key: "creamy",
    label: "Creamy / Milky",
    short: "Creamy",
    description: "Smooth and lotion-like, similar to hand cream or milk. Opaque white or light yellow. Breaks easily when stretched.",
    fertility: "rising",
    swatch: "bg-stone-100/70 border-stone-200/60",
    texture: "creamy",
  },
  {
    key: "watery",
    label: "Watery",
    short: "Watery",
    description: "Clear and thin, like plain water. Wets underwear but has no real texture.",
    fertility: "rising",
    swatch: "bg-sky-100/50 border-sky-200/50",
    texture: "watery",
  },
  {
    key: "egg_white",
    label: "Egg white (fertile)",
    short: "Egg white",
    description: "Clear, slippery and stretchy — looks and feels like raw egg white. Stretches an inch or more between your fingers without breaking.",
    fertility: "peak",
    swatch: "bg-cyan-100/60 border-cyan-200/60",
    texture: "stretchy",
  },
  {
    key: "spotting",
    label: "Spotting / Bloody",
    short: "Spotting",
    description: "Pink, red or brown tinge. Light enough that you don't need a pad — just a smear when you wipe.",
    fertility: "alert",
    swatch: "bg-rose-200/60 border-rose-300/60",
    texture: "spotting",
  },
  {
    key: "unusual",
    label: "Unusual (check in)",
    short: "Unusual",
    description: "Grey, green, frothy, chunky like cottage cheese, or with a strong odor. Worth flagging — could be an imbalance or infection.",
    fertility: "alert",
    swatch: "bg-lime-100/40 border-lime-200/40",
    texture: "creamy",
  },
];

const FERTILITY_META: Record<FertilityCue, { label: string; tone: string }> = {
  low: { label: "Low fertility", tone: "text-muted-foreground" },
  rising: { label: "Rising fertility", tone: "text-amber-400" },
  peak: { label: "Peak fertility window", tone: "text-emerald-400" },
  alert: { label: "Worth a closer look", tone: "text-rose-400" },
};

const TYPE_BY_KEY: Record<string, DischargeType> = Object.fromEntries(
  DISCHARGE_TYPES.map((t) => [t.key, t])
);

// Map a stored symptom name back to a discharge type key
const labelToKey = (name: string): string | null => {
  const m = name.match(/^Discharge:\s*(.+)$/i);
  if (!m) return null;
  const lbl = m[1].trim().toLowerCase();
  const found = DISCHARGE_TYPES.find((t) => t.label.toLowerCase() === lbl);
  return found?.key || null;
};

function Swatch({ type }: { type: DischargeType }) {
  return (
    <div
      className={cn(
        "relative w-8 h-8 rounded-full border shrink-0 overflow-hidden",
        type.swatch
      )}
      aria-hidden
    >
      {type.texture === "stretchy" && (
        <div className="absolute inset-1.5 rounded-full border border-cyan-300/70 border-dashed" />
      )}
      {type.texture === "watery" && (
        <div className="absolute inset-0 flex items-center justify-center text-sky-400/70 text-xs">
          ◌
        </div>
      )}
      {type.texture === "creamy" && (
        <div className="absolute inset-1 rounded-full bg-white/40" />
      )}
      {type.texture === "smooth" && (
        <div className="absolute inset-2 rounded-full bg-yellow-200/40" />
      )}
      {type.texture === "spotting" && (
        <>
          <div className="absolute top-1.5 left-2 w-1 h-1 rounded-full bg-rose-500/70" />
          <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full bg-rose-500/60" />
        </>
      )}
      {type.texture === "dry" && (
        <div className="absolute inset-0 flex items-center justify-center text-amber-700/40 text-[10px]">
          —
        </div>
      )}
    </div>
  );
}

export function DischargeTrackerWidget({
  userId,
  cycleDay,
  phase,
  lastPeriodStart,
  cycleLengthDays,
  isNonCycling,
  onLogged,
  lifeStage,
}: DischargeTrackerWidgetProps) {
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<{ date: string; key: string }[]>([]);
  const [todayKey, setTodayKey] = useState<string | null>(null);

  const load = async () => {
    if (!userId) return;
    const since = subDays(new Date(), 14).toISOString();
    const { data } = await supabase
      .from("symptom_logs")
      .select("symptoms, logged_at")
      .eq("user_id", userId)
      .gte("logged_at", since)
      .order("logged_at", { ascending: false })
      .limit(80);

    if (!data) return;
    const byDay: Record<string, string> = {};
    data.forEach((row: any) => {
      const day = format(new Date(row.logged_at), "yyyy-MM-dd");
      if (byDay[day]) return; // most recent of the day wins (sorted desc)
      const syms = (row.symptoms as { name: string }[]) || [];
      for (const s of syms) {
        const k = labelToKey(s.name);
        if (k) {
          byDay[day] = k;
          break;
        }
      }
    });

    const today = format(new Date(), "yyyy-MM-dd");
    setTodayKey(byDay[today] || null);

    const arr: { date: string; key: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = format(subDays(new Date(), i), "yyyy-MM-dd");
      if (byDay[d]) arr.push({ date: d, key: byDay[d] });
    }
    setRecent(arr.reverse());
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const effectiveCycle = useMemo(() => {
    if (isNonCycling) return { cycleDay: null as number | null, phase: null as string | null };
    if (cycleDay && phase) return { cycleDay, phase };
    if (lastPeriodStart && cycleLengthDays) {
      const info = calculateCycleInfo(lastPeriodStart, cycleLengthDays);
      if (info) return { cycleDay: info.cycleDay, phase: info.phase };
    }
    return { cycleDay: null, phase: null };
  }, [isNonCycling, cycleDay, phase, lastPeriodStart, cycleLengthDays]);

  const logType = async (type: DischargeType) => {
    if (saving) return;
    setSaving(true);
    const { error } = await supabase.from("symptom_logs").insert({
      user_id: userId,
      symptoms: [{ name: `Discharge: ${type.label}`, severity: 1 }] as any,
      notes: null,
      cycle_day: effectiveCycle.cycleDay,
      cycle_phase: effectiveCycle.phase,
      logged_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast({
        title: "Couldn't save",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setTodayKey(type.key);
    toast({
      title: `Logged: ${type.label}`,
      description: FERTILITY_META[type.fertility].label,
    });
    await load();
    onLogged?.();
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Droplet className="w-4 h-4 text-primary/70" />
          <div>
            <p className="text-sm font-medium text-foreground/90">Cervical fluid today</p>
            <p className="text-[10px] text-muted-foreground">
              Tap what matches — descriptions in plain language
            </p>
          </div>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
              aria-label="Why track this?"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="left" className="w-72 text-xs leading-relaxed">
            <p className="font-medium mb-1">Why track cervical fluid?</p>
            <p className="text-muted-foreground">
              It's one of the most reliable real-time signals of where you are
              in your cycle. Wetness and stretch rise as estrogen rises around
              ovulation — egg-white fluid means you're in your fertile window.
              After ovulation, progesterone makes things drier or sticky again.
            </p>
            <p className="text-muted-foreground mt-2">
              Best check: when you wipe before peeing, look at the toilet paper
              and notice color, wetness, and whether it stretches between your
              fingers.
            </p>
          </PopoverContent>
        </Popover>
      </div>

      {/* Options */}
      <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {DISCHARGE_TYPES.map((type) => {
          const isSelected = todayKey === type.key;
          const meta = FERTILITY_META[type.fertility];
          return (
            <button
              key={type.key}
              type="button"
              disabled={saving}
              onClick={() => logType(type)}
              className={cn(
                "group text-left rounded-xl border p-2.5 transition-all flex gap-2.5 items-start",
                isSelected
                  ? "border-primary/60 bg-primary/10 ring-1 ring-primary/30"
                  : "border-border/40 bg-muted/20 hover:border-primary/30 hover:bg-muted/30"
              )}
            >
              <Swatch type={type} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1.5">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {type.label}
                  </p>
                  {isSelected && (
                    <Check className="w-3 h-3 text-primary shrink-0" />
                  )}
                </div>
                <p className="text-[10.5px] text-muted-foreground leading-snug line-clamp-3">
                  {type.description}
                </p>
                <p className={cn("text-[10px] mt-1 font-medium", meta.tone)}>
                  {meta.label}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 7-day strip */}
      <div className="px-4 pb-4">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1.5">
          Last 7 days
        </p>
        <div className="flex items-end gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => {
            const d = subDays(new Date(), 6 - i);
            const dateStr = format(d, "yyyy-MM-dd");
            const entry = recent.find((r) => r.date === dateStr);
            const t = entry ? TYPE_BY_KEY[entry.key] : null;
            return (
              <div key={dateStr} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "w-full aspect-square rounded-md border flex items-center justify-center",
                    t ? t.swatch : "bg-muted/20 border-border/30"
                  )}
                  title={t ? `${format(d, "EEE MMM d")}: ${t.label}` : format(d, "EEE MMM d")}
                >
                  {!t && (
                    <X className="w-2.5 h-2.5 text-muted-foreground/30" />
                  )}
                </div>
            <span className="text-[9px] text-muted-foreground/60">
                  {format(d, "EEEEEE")}
                </span>
              </div>
            );
          })}
        </div>
        {lifeStage === "irregular" && (
          <p className="text-[11px] text-muted-foreground/70 pt-2">
            Phase estimates are approximate — your cycle may not follow a predictable pattern.
          </p>
        )}
      </div>
    </div>
  );
}
