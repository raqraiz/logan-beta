import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Upload, Trash2 } from "lucide-react";
import { HistoryImportDialog } from "./HistoryImportDialog";
import { ProviderConnectCard } from "@/components/settings/ProviderConnectCard";
import { ReferralCard } from "@/components/settings/ReferralCard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type LifeStage = "cycling" | "irregular" | "postpartum" | "menopause" | "perimenopause" | "pregnancy_loss" | "pregnant";

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
  const [lossDate, setLossDate] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [pregnancyLmp, setPregnancyLmp] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account", {
        body: { confirm: "DELETE" },
      });
      if (error) throw error;
      toast({ title: "Account deleted", description: "Your account and data are gone. Sorry to see you go." });
      await supabase.auth.signOut();
      window.location.href = "/";
    } catch (e: any) {
      toast({
        title: "Couldn't delete account",
        description: e?.message ?? "Please try again or contact support.",
        variant: "destructive",
      });
      setDeleting(false);
    }
  };

  // Load current postpartum_active + postpartum_start_date when dialog opens
  useEffect(() => {
    if (!open || !userEmail) return;
    setStage(currentLifeStage);
    (async () => {
      const { data } = await supabase
        .from("participants")
        .select("postpartum_active, postpartum_start_date, loss_date")
        .eq("email", userEmail)
        .maybeSingle();
      if (data) {
        setPostpartumActive(!!(data as any).postpartum_active);
        setPostpartumStartDate((data as any).postpartum_start_date ?? "");
        setLossDate((data as any).loss_date ?? "");
      }
    })();
  }, [open, userEmail, currentLifeStage]);

  const handleSave = async () => {
    if (!userEmail) {
      onOpenChange(false);
      return;
    }
    // Validate: postpartum recovery toggle requires a birth date
    if ((stage === "cycling" || stage === "irregular") && postpartumActive && !postpartumStartDate) {
      toast({
        title: "Add baby's birth date",
        description: "Logan needs the birth date to track recovery weeks.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = { life_stage: stage };

    if (stage === "postpartum") {
      payload.postpartum_active = false;
      if (postpartumStartDate) payload.postpartum_start_date = postpartumStartDate;
      payload.loss_date = null;
    } else if (stage === "pregnancy_loss") {
      payload.postpartum_active = false;
      payload.postpartum_start_date = null;
      payload.loss_date = lossDate || null;
      payload.last_period_start = null;
    } else if (stage === "cycling" || stage === "irregular" || stage === "perimenopause") {
      payload.postpartum_active = postpartumActive;
      if (postpartumActive && postpartumStartDate) {
        payload.postpartum_start_date = postpartumStartDate;
      } else if (!postpartumActive) {
        payload.postpartum_start_date = null;
      }
      payload.loss_date = null;
    } else if (stage === "menopause") {
      payload.last_period_start = null;
      payload.postpartum_start_date = null;
      payload.postpartum_active = false;
      payload.loss_date = null;
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
              <RadioGroupItem value="perimenopause" id="stage-perimenopause" className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">Perimenopause</div>
                <div className="text-xs text-muted-foreground">Still getting periods, but the pattern is shifting (cycles, sleep, mood, hot flashes).</div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-accent/30 cursor-pointer">
              <RadioGroupItem value="menopause" id="stage-menopause" className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">Menopause</div>
                <div className="text-xs text-muted-foreground">12+ months without a period. No active cycle tracking.</div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border border-rose-300/40 bg-rose-50/40 dark:bg-rose-950/10 hover:bg-rose-100/40 cursor-pointer">
              <RadioGroupItem value="pregnancy_loss" id="stage-loss" className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">Pregnancy loss / miscarriage recovery</div>
                <div className="text-xs text-muted-foreground">Logan pauses cycle tracking and shifts into gentle, grief-aware recovery support. You can switch back anytime.</div>
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

          {stage === "pregnancy_loss" && (
            <div className="mt-4 p-3 rounded-lg border border-rose-300/40 bg-rose-50/40 dark:bg-rose-950/10 space-y-3">
              <div>
                <Label htmlFor="loss-date" className="text-xs text-muted-foreground">Date of loss (optional)</Label>
                <Input
                  id="loss-date"
                  type="date"
                  value={lossDate}
                  onChange={(e) => setLossDate(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  className="mt-1"
                />
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  Logan will hold a gentle, no-pressure space. When you're ready to track cycles again, switch back to "Cycling" — your data stays.
                </p>
              </div>
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

        <ReferralCard userId={userId} />

        <div className="border-t border-destructive/30 pt-4">
          <Label className="text-sm font-medium mb-2 block text-destructive">Danger zone</Label>
          <p className="text-xs text-muted-foreground mb-3">
            Permanently delete your account, chat history, cycle data, and connected device tokens. This can't be undone.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="w-4 h-4 mr-2" /> Delete my account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes your profile, chat history, cycle data, symptoms, widgets, and connected device tokens. There's no recovery.
                  Type <span className="font-mono font-semibold">DELETE</span> below to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Type DELETE"
                autoFocus
              />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting} onClick={() => setDeleteConfirm("")}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleteConfirm !== "DELETE" || deleting}
                  onClick={handleDeleteAccount}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Permanently delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
