import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const REPORT_REASONS = [
  { value: "spam", label: "Spam" },
  { value: "not_a_symptom", label: "Not a real symptom" },
  { value: "inappropriate", label: "Inappropriate" },
  { value: "other", label: "Other" },
] as const;

export const REPORT_REASON_LABEL: Record<string, string> = Object.fromEntries(
  REPORT_REASONS.map(r => [r.value, r.label]),
);

interface Props {
  symptom: { id: string; name: string } | null;
  userId?: string;
  onOpenChange: (open: boolean) => void;
}

/** Quick report: pick a reason, submit instantly, inline acknowledgment. */
export function ReportSymptomDialog({ symptom, userId, onOpenChange }: Props) {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setReason(null); setDetails(""); setSubmitting(false); setDone(false); setError(null);
  };

  const submit = async () => {
    if (!symptom || !reason || !userId) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from("symptom_reports" as any).insert({
      community_symptom_id: symptom.id,
      reporter_id: userId,
      reason,
      details: details.trim() ? details.trim().slice(0, 300) : null,
    });
    setSubmitting(false);
    if (err) {
      setError(
        /rate_limited/i.test(err.message)
          ? "You've reached today's report limit. Try again tomorrow."
          : "Couldn't send that report. Try again.",
      );
      return;
    }
    setDone(true);
    setTimeout(() => { onOpenChange(false); reset(); }, 1200);
  };

  return (
    <Dialog open={!!symptom} onOpenChange={(o) => { if (!o) { onOpenChange(false); reset(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Report "{symptom?.name}"</DialogTitle>
          <DialogDescription>
            Tell us what's wrong with this entry. It stays on the list until we review it.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <p className="py-6 text-center text-sm text-primary">Reported, thanks.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {REPORT_REASONS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs border transition-colors",
                    reason === r.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card/60 border-border/50 text-foreground/70 hover:border-primary/40",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Textarea
              value={details}
              maxLength={300}
              onChange={e => setDetails(e.target.value)}
              placeholder="Anything else? (optional)"
              className="text-sm min-h-[64px]"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <DialogFooter>
              <Button size="sm" disabled={!reason || submitting} onClick={submit}>
                {submitting ? "Sending…" : "Send report"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
