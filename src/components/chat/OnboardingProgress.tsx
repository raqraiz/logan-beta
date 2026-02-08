import { Progress } from "@/components/ui/progress";
import { Clock } from "lucide-react";

interface OnboardingProgressProps {
  currentStep: number;
  totalSteps: number;
}

const STEP_LABELS = [
  "Age",
  "Cycle length",
  "Last period",
  "Symptoms",
  "Anchor symptom",
  "Notifications"
];

export const OnboardingProgress = ({ currentStep, totalSteps }: OnboardingProgressProps) => {
  const progress = Math.min(((currentStep) / totalSteps) * 100, 100);
  const remainingSteps = Math.max(totalSteps - currentStep, 0);
  const estimatedMinutes = Math.ceil(remainingSteps * 0.5); // ~30 seconds per step

  return (
    <div className="bg-card/80 backdrop-blur-sm border-b border-border/50 px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground">
            Step {Math.min(currentStep + 1, totalSteps)} of {totalSteps}
            {currentStep < totalSteps && (
              <span className="text-muted-foreground font-normal ml-2">
                / {STEP_LABELS[currentStep] || ""}
              </span>
            )}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {remainingSteps === 0 
                ? "All done" 
                : `~${estimatedMinutes} min left`}
            </span>
          </div>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>
    </div>
  );
};
