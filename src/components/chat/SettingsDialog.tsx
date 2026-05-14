import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Upload } from "lucide-react";
import { HistoryImportDialog } from "./HistoryImportDialog";
import { ProviderConnectCard } from "@/components/settings/ProviderConnectCard";

type LifeStage = "cycling" | "irregular" | "postpartum" | "menopause";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string | undefined;
  userId?: string;
  currentLifeStage: LifeStage;
  onUpdated?: (newStage: LifeStage) => void;
  onHistoryImported?: () => void;
}

export function SettingsDialog({ open, onOpenChange, userEmail, userId, currentLifeStage, onUpdated, onHistoryImported }: SettingsDialogProps) {
  const [stage, setStage] = useState<LifeStage>(currentLifeStage);
  const [saving, setSaving] = useState(false);
  const [importerOpen, setImporterOpen] = useState(false);
  const [postpartumActive, setPostpartumActive] = useState(false);
  const [postpartumStartDate, setPostpartumStartDate] = useState<string>("");

  // Load current postpartum_active + postpartum_start_date when dialog opens
  useEffect(() => {
    if (!open || !userEmail) return;
    setStage(currentLifeStage);
    (async () => {
      const { data } = await supabase
        .from("participants")
        .select("postpartum_active, postpartum_start_date")
        .eq("email", userEmail)
        .maybeSingle();
      if (data) {
        setPostpartumActive(!!(data as any).postpartum_active);
        setPostpartumStartDate((data as any).postpartum_start_date ?? "");
      }
    })();
  }, [open, userEmail, currentLifeStage]);

  const handleSave = async () => {
    if (!userEmail) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = { life_stage: stage };

    if (stage === "postpartum") {
      // Postpartum mode owns the date; postpartum_active flag is irrelevant here.
      payload.postpartum_active = false;
      if (postpartumStartDate) payload.postpartum_start_date = postpartumStartDate;
    } else if (stage === "cycling" || stage === "irregular") {
      // Cycling user may also be in postpartum recovery — preserve the dual state.
      payload.postpartum_active = postpartumActive;
      if (postpartumActive && postpartumStartDate) {
        payload.postpartum_start_date = postpartumStartDate;
      } else if (!postpartumActive) {
        payload.postpartum_start_date = null;
      }
    } else if (stage === "menopause") {
      payload.last_period_start = null;
      payload.postpartum_start_date = null;
      payload.postpartum_active = false;
    }

    const { error } = await supabase
      .from("participants")
      .update(payload)
      .eq("email", userEmail);

    setSaving(false);
    if (error) {
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Updated", description: `Life stage saved.` });
    onUpdated?.(stage);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Update your life stage. Logan will adapt all tabs and guidance to match.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <Label className="text-sm font-medium mb-3 block">Life stage</Label>
          <RadioGroup value={stage} onValueChange={(v) => setStage(v as LifeStage)} className="space-y-2">
            <label className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-accent/30 cursor-pointer">
              <RadioGroupItem value="cycling" id="stage-cycling" className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">Cycling</div>
                <div className="text-xs text-muted-foreground">I get a regular or semi-regular period.</div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-accent/30 cursor-pointer">
              <RadioGroupItem value="irregular" id="stage-irregular" className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">Irregular cycle or on hormonal birth control</div>
                <div className="text-xs text-muted-foreground">PCOS, hormonal imbalance, unpredictable cycles, or hormonal BC (pill, IUD, implant, ring, patch). Logan still tracks but adapts predictions.</div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-accent/30 cursor-pointer">
              <RadioGroupItem value="postpartum" id="stage-postpartum" className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">Postpartum</div>
                <div className="text-xs text-muted-foreground">I recently had a baby. Logan will ask for the birth date.</div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-accent/30 cursor-pointer">
              <RadioGroupItem value="menopause" id="stage-menopause" className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">Menopause</div>
                <div className="text-xs text-muted-foreground">Post-menopause. No active cycle tracking.</div>
              </div>
            </label>
          </RadioGroup>
          <p className="text-[11px] text-muted-foreground/80 mt-3">
            Tip: you can also just tell Logan in chat — e.g. "I'm actually still cycling" — and it'll switch automatically.
          </p>

          {(stage === "cycling" || stage === "irregular") && (
            <div className="mt-4 p-3 rounded-lg border border-pink-400/30 bg-pink-400/5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="text-sm font-medium">Also recovering postpartum</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Cycling again after a baby? Logan will layer recovery context (sleep debt, iron, pelvic floor) on top of phase guidance.
                  </div>
                </div>
                <Switch checked={postpartumActive} onCheckedChange={setPostpartumActive} />
              </div>
              {postpartumActive && (
                <div>
                  <Label htmlFor="pp-date" className="text-xs text-muted-foreground">Baby's birth date</Label>
                  <Input
                    id="pp-date"
                    type="date"
                    value={postpartumStartDate}
                    onChange={(e) => setPostpartumStartDate(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className="mt-1"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border/50 pt-4">
          <Label className="text-sm font-medium mb-2 block">Import history</Label>
          <p className="text-xs text-muted-foreground mb-3">
            Pull months of cycles, symptoms, sleep, and workouts from Apple Health or any period tracker (Clue, Flo, Natural Cycles).
          </p>
          <Button variant="outline" className="w-full" onClick={() => setImporterOpen(true)}>
            <Upload className="w-4 h-4 mr-2" /> Import from another app
          </Button>
        </div>

        <div className="border-t border-border/50 pt-4">
          <Label className="text-sm font-medium mb-2 block">Connected devices</Label>
          <p className="text-xs text-muted-foreground mb-3">
            Auto-sync sleep, recovery, HRV, and workouts so Logan adapts in real time.
          </p>
          <ProviderConnectCard provider="whoop" userId={userId} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
      <HistoryImportDialog
        open={importerOpen}
        onOpenChange={setImporterOpen}
        userId={userId}
        onImported={onHistoryImported}
      />
    </Dialog>
  );
}
