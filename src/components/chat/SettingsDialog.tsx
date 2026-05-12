import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Upload } from "lucide-react";
import { HistoryImportDialog } from "./HistoryImportDialog";

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

  useEffect(() => {
    if (open) setStage(currentLifeStage);
  }, [open, currentLifeStage]);

  const handleSave = async () => {
    if (!userEmail || stage === currentLifeStage) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = { life_stage: stage };
    // Clear stage-specific fields when switching away
    if (stage !== "postpartum") payload.postpartum_start_date = null;
    if (stage === "menopause") payload.last_period_start = null;

    const { error } = await supabase
      .from("participants")
      .update(payload)
      .eq("email", userEmail);

    setSaving(false);
    if (error) {
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Updated", description: `Life stage set to ${stage}.` });
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
