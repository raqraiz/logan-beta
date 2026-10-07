import { Info } from "lucide-react";
import { SAFETY_NOTE } from "@/lib/symptomPage";
import { cn } from "@/lib/utils";

/** The one safety note style, used everywhere the note appears. */
export function SafetyCallout({ className }: { className?: string }) {
  return (
    <div className={cn("safety-callout flex items-start gap-2.5 rounded-2xl p-[14px] text-left", className)} role="note">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="font-sans text-[15px] font-medium leading-snug">{SAFETY_NOTE}</p>
    </div>
  );
}
