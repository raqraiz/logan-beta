import { ChatCycleCircle } from "@/components/chat/ChatCycleCircle";
import { LoganLogo } from "@/components/LoganLogo";

interface CycleData {
  cycleDay: number;
  phase: string;
  cycleLengthDays: number;
  lastPeriodStart?: string;
}

interface HomeTabProps {
  cycleData: CycleData | null;
  anchorSymptom?: string | null;
}

export function HomeTab({ cycleData }: HomeTabProps) {
  if (!cycleData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <LoganLogo size="md" />
        <h2 className="font-display font-semibold text-lg text-foreground mt-4">Welcome to Logan</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs">
          Complete your onboarding in the Ask tab to see your cycle overview here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-16">
      {/* Cycle circle hero */}
      <div className="flex flex-col items-center pt-8 pb-6 px-4">
        <ChatCycleCircle
          cycleDay={cycleData.cycleDay}
          phase={cycleData.phase}
          cycleLengthDays={cycleData.cycleLengthDays}
          size="md"
        />
        <p className="text-sm text-muted-foreground mt-3">
          Day {cycleData.cycleDay} of {cycleData.cycleLengthDays}
        </p>
      </div>
    </div>
  );
}
