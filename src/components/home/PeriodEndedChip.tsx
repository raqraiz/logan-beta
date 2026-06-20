import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Droplet, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Props {
  userId: string;
  cycleDay: number;
  lastPeriodStart?: string;
}

/**
 * Lets the user mark her period as ended early — flips phase from
 * Menstruation to Follicular before the default day-5 window.
 */
export function PeriodEndedChip({ userId, cycleDay, lastPeriodStart }: Props) {
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .single();
      if (!profile?.email || cancelled) return;
      const { data: participant } = await supabase
        .from("participants")
        .select("id, current_period_end_date")
        .eq("email", profile.email)
        .single();
      if (cancelled) return;
      if (participant?.id) setParticipantId(participant.id);
      setEndDate((participant as any)?.current_period_end_date ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, lastPeriodStart]);

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const offsetDay = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const save = async (value: string) => {
    if (!participantId) return;
    if (lastPeriodStart && value < lastPeriodStart) {
      toast({ title: "End date can't be before period start", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("participants")
      .update({ current_period_end_date: value })
      .eq("id", participantId);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    } else {
      setEndDate(value);
      setOpen(false);
      toast({ title: "Got it — shifted to Follicular" });
    }
  };

  const clear = async () => {
    if (!participantId) return;
    setSaving(true);
    const { error } = await supabase
      .from("participants")
      .update({ current_period_end_date: null })
      .eq("id", participantId);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't reset", description: error.message, variant: "destructive" });
    } else {
      setEndDate(null);
      setOpen(false);
    }
  };

  // Only show in early-cycle days when she's likely menstruating.
  // After it's been set, keep showing so she can edit/clear.
  const inWindow = cycleDay >= 1 && cycleDay <= 10;
  if (!inWindow && !endDate) return null;
  if (!participantId) return null;

  const label = endDate
    ? `Period ended ${format(new Date(endDate + "T12:00:00"), "MMM d")} · edit`
    : "My period ended";

  return (
    <div className="mt-2 flex justify-center">
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(endDate || todayStr()); }}>
        <PopoverTrigger asChild>
          <button
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] transition-colors ${
              endDate
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/50 bg-muted/40 text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {endDate ? <Check className="w-3 h-3" /> : <Droplet className="w-3 h-3" />}
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="center">
          <p className="text-xs font-medium text-foreground mb-2">When did your period end?</p>
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => save(todayStr())} disabled={saving}>
              Today
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => save(offsetDay(1))} disabled={saving}>
              Yesterday
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => save(offsetDay(2))} disabled={saving}>
              2d ago
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              max={todayStr()}
              min={lastPeriodStart || undefined}
              className="h-8 text-xs flex-1"
            />
            <Button size="sm" className="h-8 text-xs" onClick={() => save(draft)} disabled={saving || !draft}>
              Save
            </Button>
          </div>
          {endDate && (
            <button
              onClick={clear}
              className="mt-2 w-full text-[11px] text-muted-foreground hover:text-destructive"
            >
              Clear (still bleeding)
            </button>
          )}
          <p className="text-[10px] text-muted-foreground mt-2 leading-snug">
            Shifts your phase to Follicular the day after — so Logan's tips match where you actually are.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
