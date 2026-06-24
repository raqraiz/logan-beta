import { useState, useEffect } from "react";
import { Plus, Sparkles, AlignLeft, List, CheckSquare, Hash, Quote, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { WidgetFormat, WidgetAccent } from "@/hooks/useWidgetPreferences";

interface AddCustomWidgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { title: string; prompt: string; format: WidgetFormat; accent: WidgetAccent }) => void;
  initial?: { title: string; prompt: string; format?: WidgetFormat; accent?: WidgetAccent };
}

const PROMPT_EXAMPLES: Array<{ title: string; prompt: string; format: WidgetFormat }> = [
  { title: "Daily Workout", prompt: "Suggest a workout that matches my energy level and cycle phase today", format: "bullets" },
  { title: "Meal Idea", prompt: "Give me a meal idea that supports my hormones during this phase", format: "paragraph" },
  { title: "Today's Focus", prompt: "Give me one number score for how productive I'll feel today and why", format: "stat" },
  { title: "Daily Checklist", prompt: "Give me 3 small wins I should aim for today based on my cycle", format: "checklist" },
  { title: "Journal Prompt", prompt: "Give me a reflective journal prompt based on where I am in my cycle", format: "quote" },
];

const FORMATS: Array<{ id: WidgetFormat; label: string; icon: typeof AlignLeft; hint: string }> = [
  { id: "paragraph", label: "Text", icon: AlignLeft, hint: "1–2 sentence insight" },
  { id: "bullets", label: "Bullets", icon: List, hint: "Short list of ideas" },
  { id: "checklist", label: "Checklist", icon: CheckSquare, hint: "Tickable to-dos" },
  { id: "stat", label: "Stat", icon: Hash, hint: "Big number + caption" },
  { id: "quote", label: "Quote", icon: Quote, hint: "Reflective prompt" },
];

const ACCENTS: Array<{ id: WidgetAccent; hex: string }> = [
  { id: "teal", hex: "#15B88C" },
  { id: "rose", hex: "#E94560" },
  { id: "amber", hex: "#F0A33C" },
  { id: "violet", hex: "#9D6BE0" },
  { id: "sky", hex: "#4FA8E0" },
];

export function AddCustomWidgetDialog({ open, onOpenChange, onSave, initial }: AddCustomWidgetDialogProps) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState<WidgetFormat>("paragraph");
  const [accent, setAccent] = useState<WidgetAccent>("teal");

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? "");
      setPrompt(initial?.prompt ?? "");
      setFormat(initial?.format ?? "paragraph");
      setAccent(initial?.accent ?? "teal");
    }
  }, [open, initial]);

  const handleSave = () => {
    if (!title.trim() || !prompt.trim()) return;
    onSave({ title: title.trim(), prompt: prompt.trim(), format, accent });
    onOpenChange(false);
  };

  const useExample = (example: typeof PROMPT_EXAMPLES[0]) => {
    setTitle(example.title);
    setPrompt(example.prompt);
    setFormat(example.format);
  };

  const isEdit = !!initial;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {isEdit ? "Edit Widget" : "Create Your Widget"}
          </DialogTitle>
          <DialogDescription>
            Describe what you want Logan to show you every day. Pick a layout and accent to make it feel like yours.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Widget name</label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Daily Workout"
              className="h-9"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Instructions for Logan
            </label>
            <Textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Suggest a workout that matches my energy level today"
              className="min-h-[90px] text-sm resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Layout</label>
            <div className="grid grid-cols-5 gap-1.5">
              {FORMATS.map(f => {
                const Icon = f.icon;
                const active = format === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] transition-all ${
                      active
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border/40 bg-card/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {f.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-1.5">
              {FORMATS.find(f => f.id === format)?.hint}
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Accent</label>
            <div className="flex gap-2">
              {ACCENTS.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAccent(a.id)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                    accent === a.id ? "ring-2 ring-offset-2 ring-offset-background ring-foreground/70 scale-110" : ""
                  }`}
                  style={{ backgroundColor: a.hex }}
                  aria-label={a.id}
                >
                  {accent === a.id && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {!isEdit && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40 mb-2">
                Or try an idea
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PROMPT_EXAMPLES.map(ex => (
                  <button
                    key={ex.title}
                    onClick={() => useExample(ex)}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-border/40 bg-card/60
                      text-muted-foreground hover:bg-card hover:text-foreground transition-all"
                  >
                    {ex.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end mt-1">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!title.trim() || !prompt.trim()}
            className="gap-1.5"
          >
            {isEdit ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {isEdit ? "Save" : "Add Widget"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
