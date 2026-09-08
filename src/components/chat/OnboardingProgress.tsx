import { Progress } from "@/components/ui/progress";
import { Clock } from "lucide-react";

interface OnboardingProgressProps {
  currentStep: number;
  totalSteps: number;
  /** Optional branch override (e.g. postpartum). When set, drives the counter/labels
   *  instead of the raw question index. General path passes nothing and is unchanged. */
  branch?: {
    step: number;      // 1-based ordinal within the branch
    total: number;
    labels: string[];  // labels indexed by ordinal-1
  };
}

const STEP_LABELS = [
  "Age",
  "Cycle length",
  "Last period",
  "Symptoms",
  "Anchor symptom",
  "Focus areas"
];

export const OnboardingProgress = ({ currentStep, totalSteps, branch }: OnboardingProgressProps) => {
  const total = branch ? branch.total : totalSteps;
  const shownStep = branch ? branch.step : Math.min(currentStep + 1, totalSteps);
  const completed = branch ? branch.step - 1 : currentStep;
  const label = branch ? (branch.labels[branch.step - 1] || "") : (STEP_LABELS[currentStep] || "");

  const progress = Math.min((completed / total) * 100, 100);
  const remainingSteps = Math.max(total - completed, 0);
  const estimatedMinutes = Math.ceil(remainingSteps * 0.5); // ~30 seconds per step

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">
          Step {shownStep} of {total}
          {completed < total && (
            <span className="text-muted-foreground font-normal ml-2">
              / {label}
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
  );
};
