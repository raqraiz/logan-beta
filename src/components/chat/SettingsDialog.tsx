import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { updateParticipant } from "@/lib/participantWrite";
import { Loader2, Upload, Trash2, FileText } from "lucide-react";
import { HistoryImportDialog } from "./HistoryImportDialog";
import { ProviderConnectCard } from "@/components/settings/ProviderConnectCard";
import { ReferralCard } from "@/components/settings/ReferralCard";
import { setPhaseLengthPrefs, defaultPhaseLengths, clampPhaseLength, totalCycleLength, PHASE_LENGTH_BOUNDS, type PhaseLengths } from "@/lib/phaseLengths";

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
  const [timezone, setTimezone] = useState<string>("");
  const [onHormonalBc, setOnHormonalBc] = useState<boolean | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cycleLen, setCycleLen] = useState<number>(28);
  const [phaseLens, setPhaseLens] = useState<Required<PhaseLengths>>(() => defaultPhaseLengths(28));


  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("delete-account", {
        body: { confirm: "DELETE" },
      });
      if (error) throw error;
      toast({ title: "Account deleted", description: "Your account and all your data have been permanently deleted." });
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
        .select("postpartum_active, postpartum_start_date, loss_date, due_date, pregnancy_lmp, timezone, on_hormonal_bc, cycle_length_days, menstruation_days, follicular_days, ovulation_window_days, luteal_days")
        .eq("email", userEmail)
        .maybeSingle();
      if (data) {
        setPostpartumActive(!!(data as any).postpartum_active);
        setPostpartumStartDate((data as any).postpartum_start_date ?? "");
        setLossDate((data as any).loss_date ?? "");
        setDueDate((data as any).due_date ?? "");
        setPregnancyLmp((data as any).pregnancy_lmp ?? "");
        setOnHormonalBc((data as any).on_hormonal_bc ?? null);
        const cl = (data as any).cycle_length_days ?? 28;
        setCycleLen(cl);
        const d = defaultPhaseLengths(cl);
        setPhaseLens({
          menstruation_days: (data as any).menstruation_days ?? d.menstruation_days,
          follicular_days: (data as any).follicular_days ?? d.follicular_days,
          ovulation_window_days: (data as any).ovulation_window_days ?? d.ovulation_window_days,
          luteal_days: (data as any).luteal_days ?? d.luteal_days,
        });
        let tz = (data as any).timezone ?? "";
        if (!tz) {
          try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { tz = ""; }
        }
        setTimezone(tz);
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
    if (timezone && timezone.trim()) payload.timezone = timezone.trim();
    payload.menstruation_days = phaseLens.menstruation_days;
    payload.follicular_days = phaseLens.follicular_days;
    payload.ovulation_window_days = phaseLens.ovulation_window_days;
    payload.luteal_days = phaseLens.luteal_days;


    if (stage === "postpartum") {
      payload.postpartum_active = false;
      if (postpartumStartDate) payload.postpartum_start_date = postpartumStartDate;
      payload.loss_date = null;
    } else if (stage === "pregnancy_loss") {
      payload.postpartum_active = false;
      payload.postpartum_start_date = null;
      payload.loss_date = lossDate || null;
      payload.last_period_start = null;
      payload.due_date = null;
      payload.pregnancy_lmp = null;
    } else if (stage === "pregnant") {
      payload.postpartum_active = false;
      payload.postpartum_start_date = null;
      payload.loss_date = null;
      payload.due_date = dueDate || null;
      payload.pregnancy_lmp = pregnancyLmp || null;
      payload.last_period_start = null;
    } else if (stage === "cycling" || stage === "irregular" || stage === "perimenopause") {
      payload.postpartum_active = postpartumActive;
      if (postpartumActive && postpartumStartDate) {
        payload.postpartum_start_date = postpartumStartDate;
      } else if (!postpartumActive) {
        payload.postpartum_start_date = null;
      }
      payload.loss_date = null;
      payload.due_date = null;
      payload.pregnancy_lmp = null;
      payload.on_hormonal_bc = onHormonalBc;
    } else if (stage === "menopause") {
      payload.last_period_start = null;
      payload.postpartum_start_date = null;
      payload.postpartum_active = false;
      payload.loss_date = null;
      payload.due_date = null;
      payload.pregnancy_lmp = null;
    }

    const ok = await updateParticipant(userId, payload, "Couldn't update your settings");

    setSaving(false);
    if (!ok) return;
    setPhaseLengthPrefs(phaseLens);
    toast({ title: "Updated", description: `Settings saved.` });

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
                <div className="text-sm font-medium">Irregular cycle</div>
                <div className="text-xs text-muted-foreground">PMOS (formerly PCOS), hormonal imbalance, or unpredictable timing. Logan still tracks but won't predict exact phases. (Birth control is a separate setting below.)</div>
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
            <label className="flex items-start gap-3 p-3 rounded-lg border border-emerald-300/40 bg-emerald-50/40 dark:bg-emerald-950/10 hover:bg-emerald-100/40 cursor-pointer">
              <RadioGroupItem value="pregnant" id="stage-pregnant" className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">Pregnant 🌱</div>
                <div className="text-xs text-muted-foreground">Logan pauses cycle tracking and switches to trimester-aware support — symptoms, nutrition, safe movement, and red-flag guardrails.</div>
              </div>
            </label>
          </RadioGroup>
          <p className="text-[11px] text-muted-foreground/80 mt-3">
            Tip: you can also just tell Logan in chat — e.g. "I'm actually still cycling" — and it'll switch automatically.
          </p>

          {(stage === "cycling" || stage === "irregular" || stage === "perimenopause") && (
            <div className="mt-4 p-3 rounded-lg border border-border/50 bg-accent/20 space-y-2">
              <div className="text-sm font-medium">Hormonal birth control</div>
              <div className="text-xs text-muted-foreground">
                Pill, mini-pill, hormonal IUD, implant, ring, or patch. This changes how Logan talks about your hormones and nutrients.
              </div>
              <RadioGroup
                value={onHormonalBc === true ? "yes" : onHormonalBc === false ? "no" : "unknown"}
                onValueChange={(v) => setOnHormonalBc(v === "yes" ? true : v === "no" ? false : null)}
                className="flex flex-wrap gap-4 pt-1"
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="yes" id="bc-yes" />
                  <span className="text-sm">Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="no" id="bc-no" />
                  <span className="text-sm">No</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="unknown" id="bc-unknown" />
                  <span className="text-sm">Prefer not to say</span>
                </label>
              </RadioGroup>
            </div>
          )}

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

          {stage === "pregnant" && (
            <div className="mt-4 p-3 rounded-lg border border-emerald-300/40 bg-emerald-50/40 dark:bg-emerald-950/10 space-y-3">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Add either date so Logan can track your gestational week (LMP is the standard OB method and most accurate). You can update or skip these anytime.
              </p>
              <div>
                <Label htmlFor="lmp-date" className="text-xs text-muted-foreground">Last menstrual period (LMP)</Label>
                <Input
                  id="lmp-date"
                  type="date"
                  value={pregnancyLmp}
                  onChange={(e) => setPregnancyLmp(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="due-date" className="text-xs text-muted-foreground">Due date</Label>
                <Input
                  id="due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}
        </div>

        {(stage === "cycling" || stage === "irregular" || stage === "perimenopause") && (
          <div className="border-t border-border/50 pt-4">
            <Label className="text-sm font-medium mb-2 block">Phase lengths</Label>
            <p className="text-xs text-muted-foreground mb-3">
              Logan assumes typical phase lengths. If you know yours run longer or shorter, set them here and every prediction adapts.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {([
                ["menstruation_days", "Menstruation"],
                ["follicular_days", "Follicular"],
                ["ovulation_window_days", "Ovulation"],
                ["luteal_days", "Luteal"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <Label htmlFor={`pl-${key}`} className="text-xs text-muted-foreground">
                    {label} ({PHASE_LENGTH_BOUNDS[key].min}–{PHASE_LENGTH_BOUNDS[key].max} days)
                  </Label>
                  <Input
                    id={`pl-${key}`}
                    type="number"
                    inputMode="numeric"
                    min={PHASE_LENGTH_BOUNDS[key].min}
                    max={PHASE_LENGTH_BOUNDS[key].max}
                    value={phaseLens[key]}
                    onChange={(e) => {
                      const raw = Number(e.target.value);
                      setPhaseLens((p) => ({ ...p, [key]: Number.isFinite(raw) ? raw : p[key] }));
                    }}
                    onBlur={() =>
                      setPhaseLens((p) => ({ ...p, [key]: clampPhaseLength(key, Number(p[key]) || PHASE_LENGTH_BOUNDS[key].min) }))
                    }
                    className="mt-1"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 text-xs">
              <span className="text-muted-foreground">Total cycle length</span>
              <span className="font-medium">{totalCycleLength(phaseLens, cycleLen)} days</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="mt-2 h-8 px-2 text-xs text-muted-foreground"
              onClick={() => setPhaseLens(defaultPhaseLengths(cycleLen))}
            >
              Reset to defaults
            </Button>
          </div>
        )}


        <div className="border-t border-border/50 pt-4">
          <Label htmlFor="timezone" className="text-sm font-medium mb-2 block">Timezone</Label>
          <p className="text-xs text-muted-foreground mb-3">
            Used to calculate your cycle day accurately. Auto-detected from your device — only change this if it's wrong.
          </p>
          <div className="flex gap-2">
            <Input
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. America/New_York"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                try {
                  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
                  if (detected) setTimezone(detected);
                } catch { /* noop */ }
              }}
            >
              Detect
            </Button>
          </div>
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
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleting}
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

        <div className="border-t border-border/50 pt-4">
          <Label className="text-sm font-medium mb-2 block">Legal</Label>
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <FileText className="w-4 h-4" /> Privacy Policy
          </a>
          <p className="text-xs text-muted-foreground mt-1">
            How Logan collects, uses, and protects your data.
          </p>
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
