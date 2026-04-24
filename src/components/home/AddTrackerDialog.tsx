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
import { toast } from "sonner";

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
  { name: "Confidence", emoji: "✨" },
  { name: "Anxiety", emoji: "🌀" },
  { name: "Libido", emoji: "🔥" },
  { name: "Sleep quality", emoji: "💤" },
  { name: "Patience", emoji: "🕊️" },
];

export function AddTrackerDialog({ open, onOpenChange, userId, onAdded }: Props) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("✨");
  const [saving, setSaving] = useState(false);

  const handlePick = (s: { name: string; emoji: string }) => {
    setName(s.name);
    setEmoji(s.emoji);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("custom_trackers").insert({
      user_id: userId,
      name: name.trim(),
      emoji: emoji || "✨",
    });
    setSaving(false);
    if (error) {
      toast.error("Couldn't add tracker");
      return;
    }
    toast.success(`Now tracking ${name}`);
    setName("");
    setEmoji("✨");
    onAdded();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>Track something new</DialogTitle>
          <DialogDescription>
            What do you want to see correlated with your cycle? Log it daily on a 1–5 scale.
          </DialogDescription>
        </DialogHeader>

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
        </div>

        <div className="flex gap-2 justify-end mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? "Adding…" : "Add tracker"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
