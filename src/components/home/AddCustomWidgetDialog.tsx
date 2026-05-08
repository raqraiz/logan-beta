import { useState } from "react";
import { Plus, Sparkles, X } from "lucide-react";
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

interface AddCustomWidgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (title: string, prompt: string) => void;
}

const PROMPT_EXAMPLES = [
  { title: "Daily Workout", prompt: "Suggest a workout that matches my energy level and cycle phase today" },
  { title: "Meal Idea", prompt: "Give me a meal idea that supports my hormones during this phase" },
  { title: "Journal Prompt", prompt: "Give me a reflective journal prompt based on where I am in my cycle" },
  { title: "Relationship Tip", prompt: "How can I nurture my closest relationship during this cycle phase?" },
];

export function AddCustomWidgetDialog({ open, onOpenChange, onAdd }: AddCustomWidgetDialogProps) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");

  const handleAdd = () => {
    if (!title.trim() || !prompt.trim()) return;
    onAdd(title.trim(), prompt.trim());
    setTitle("");
    setPrompt("");
    onOpenChange(false);
  };

  const useExample = (example: typeof PROMPT_EXAMPLES[0]) => {
    setTitle(example.title);
    setPrompt(example.prompt);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Create Your Widget
          </DialogTitle>
          <DialogDescription>
            Describe what you want Logan to show you every day. It'll be personalized to your cycle phase.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
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
              What should Logan generate for you?
            </label>
            <Textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Suggest a workout that matches my energy level today"
              className="min-h-[80px] text-sm resize-none"
            />
          </div>

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
        </div>

        <div className="flex gap-2 justify-end mt-1">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!title.trim() || !prompt.trim()}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Widget
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
