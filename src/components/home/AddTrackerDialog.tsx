import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sparkles, X, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  onAdded: () => void;
}

const SUGGESTIONS = [
  { name: "Surfing performance", emoji: "🏄‍♀️" },
  { name: "Loneliness", emoji: "🌙" },
  { name: "Focus", emoji: "🎯" },
  { name: "Cervical fluid", emoji: "💧", type: "single_choice" as const },
  { name: "Cervix position", emoji: "🌷", type: "single_choice" as const },
  { name: "Libido", emoji: "🔥" },
  { name: "Sleep quality", emoji: "💤" },
];

type TrackerType = "scale_0_5" | "single_choice";

export function AddTrackerDialog({ open, onOpenChange, userId, onAdded }: Props) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("✨");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TrackerType>("scale_0_5");
  const [options, setOptions] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [enablingFam, setEnablingFam] = useState(false);

  const reset = () => {
    setName("");
    setEmoji("✨");
    setDescription("");
    setType("scale_0_5");
    setOptions([""]);
  };

  const handlePick = (s: typeof SUGGESTIONS[number]) => {
    setName(s.name);
    setEmoji(s.emoji);
    if (s.type === "single_choice") setType("single_choice");
  };

  const handleSuggest = async () => {
    if (!name.trim()) {
      toast.error("Give it a name first");
      return;
    }
    setSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-tracker-options", {
        body: { name: name.trim(), description: description.trim() },
      });
      if (error) throw error;
      const opts = (data?.options as string[] | undefined) || [];
      if (opts.length === 0) {
        toast.error("Logan couldn't think of options — add them yourself");
        return;
      }
      setOptions(opts);
      setType("single_choice");
    } catch {
      toast.error("Suggestion failed");
    } finally {
      setSuggesting(false);
    }
  };

  const updateOption = (i: number, v: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? v.slice(0, 24) : o)));
  const removeOption = (i: number) =>
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  const addOption = () =>
    setOptions((prev) => (prev.length >= 8 ? prev : [...prev, ""]));

  const handleSave = async () => {
    if (!name.trim()) return;
    if (type === "single_choice") {
      const clean = options.map((o) => o.trim()).filter(Boolean);
      if (clean.length < 2) {
        toast.error("Add at least 2 options");
        return;
      }
    }
    setSaving(true);
    const cleanOptions =
      type === "single_choice"
        ? options.map((o) => o.trim()).filter(Boolean)
        : null;
    const { error } = await supabase.from("custom_trackers").insert({
      user_id: userId,
      name: name.trim(),
      emoji: emoji || "✨",
      description: description.trim() || null,
      tracker_type: type,
      options: cleanOptions as unknown as never,
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't add tracker");
      return;
    }
    toast.success(`Now tracking ${name}`);
    reset();
    onAdded();
  };

  const handleEnableFAM = async () => {
    setEnablingFam(true);
    const fam = [
      { name: "Cervical fluid", emoji: "💧", options: ["Dry", "Sticky", "Creamy", "Egg-white", "Watery", "Spotting"] },
      { name: "Cervix position", emoji: "🌷", options: ["Low", "Mid", "High"] },
      { name: "Cervix texture", emoji: "🌸", options: ["Firm", "Medium", "Soft"] },
      { name: "Cervix opening", emoji: "🔓", options: ["Closed", "Slightly open", "Open"] },
    ];
    // Skip ones the user already has (case-insensitive)
    const { data: existing } = await supabase
      .from("custom_trackers")
      .select("name")
      .eq("user_id", userId);
    const existingNames = new Set((existing || []).map((r: { name: string }) => r.name.toLowerCase()));
    const rows = fam
      .filter((f) => !existingNames.has(f.name.toLowerCase()))
      .map((f) => ({
        user_id: userId,
        name: f.name,
        emoji: f.emoji,
        tracker_type: "single_choice" as const,
        options: f.options as unknown as never,
        is_fam: true,
        is_builtin: true,
        source: "user",
      }));
    if (rows.length === 0) {
      toast.success("FAM trackers already enabled");
    } else {
      const { error } = await supabase.from("custom_trackers").insert(rows);
      if (error) {
        toast.error("Couldn't enable FAM trackers");
      } else {
        toast.success(`Added ${rows.length} FAM tracker${rows.length === 1 ? "" : "s"}`);
        onAdded();
      }
    }
    setEnablingFam(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-sm rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Track something new</DialogTitle>
          <DialogDescription>
            Log it daily and Logan will surface how it tracks with your cycle.
          </DialogDescription>
        </DialogHeader>

        {/* FAM one-tap */}
        <button
          onClick={handleEnableFAM}
          disabled={enablingFam}
          className="w-full rounded-xl border border-teal-500/40 bg-teal-500/10 hover:bg-teal-500/15 transition-colors px-3 py-2 text-left flex items-center gap-3 disabled:opacity-60"
        >
          <div className="w-8 h-8 rounded-lg bg-teal-500/20 flex items-center justify-center text-base">🌸</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground/90">Enable FAM tracking</p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              Adds cervical fluid, cervix position, texture & opening
            </p>
          </div>
          {enablingFam && <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />}
        </button>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.name}
                onClick={() => handlePick(s)}
                className="px-2.5 py-1 rounded-full border border-border/40 bg-background/60
                  text-xs text-foreground/80 hover:bg-teal-500/10 hover:border-teal-500/40 transition-colors"
              >
                {s.emoji} {s.name}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="w-16">
              <Label className="text-xs">Emoji</Label>
              <Input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
                className="mt-1 text-center"
                maxLength={4}
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Surfing performance"
                className="mt-1"
                maxLength={60}
              />
            </div>
          </div>

          {/* Type toggle */}
          <div>
            <Label className="text-xs">How will you log it?</Label>
            <div className="mt-1 grid grid-cols-2 gap-1.5 rounded-lg bg-muted/30 p-1">
              <button
                onClick={() => setType("scale_0_5")}
                className={cn(
                  "text-xs py-1.5 rounded-md transition-colors",
                  type === "scale_0_5"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Scale 0–5
              </button>
              <button
                onClick={() => setType("single_choice")}
                className={cn(
                  "text-xs py-1.5 rounded-md transition-colors",
                  type === "single_choice"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Choose one
              </button>
            </div>
          </div>

          {type === "single_choice" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Options</Label>
                <button
                  onClick={handleSuggest}
                  disabled={suggesting || !name.trim()}
                  className="text-[11px] inline-flex items-center gap-1 text-teal-400 hover:text-teal-300 disabled:opacity-50"
                >
                  {suggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Suggest
                </button>
              </div>
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    value={o}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    maxLength={24}
                    className="h-8 text-xs"
                  />
                  {options.length > 1 && (
                    <button
                      onClick={() => removeOption(i)}
                      className="text-muted-foreground hover:text-foreground p-1"
                      aria-label="Remove option"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {options.length < 8 && (
                <button
                  onClick={addOption}
                  className="text-[11px] inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-3 h-3" /> Add option
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? "Adding…" : "Add tracker"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
