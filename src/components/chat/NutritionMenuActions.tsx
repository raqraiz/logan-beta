import { useState } from "react";
import { Library, Sparkles } from "lucide-react";
import { MealPlanSetupDialog } from "./MealPlanSetupDialog";
import { MenuLibraryDialog } from "./MenuLibraryDialog";
import { toast } from "@/hooks/use-toast";

interface NutritionMenuActionsProps {
  userId: string;
}

export function NutritionMenuActions({ userId }: NutritionMenuActionsProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={() => setLibraryOpen(true)}
          className="rounded-xl border border-border/40 bg-card/40 hover:border-primary/40 hover:bg-card/70 transition-all px-3 py-3 flex flex-col items-start gap-1 text-left"
        >
          <div className="w-7 h-7 rounded-lg bg-phase-luteal/15 flex items-center justify-center">
            <Library className="w-3.5 h-3.5 text-phase-luteal" />
          </div>
          <p className="text-xs font-semibold text-foreground">Menu Library</p>
          <p className="text-[10px] text-muted-foreground leading-tight">Your saved meal plans</p>
        </button>

        <button
          onClick={() => setBuilderOpen(true)}
          className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-card/40 hover:border-primary/50 transition-all px-3 py-3 flex flex-col items-start gap-1 text-left"
        >
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <p className="text-xs font-semibold text-foreground">Menu Builder</p>
          <p className="text-[10px] text-muted-foreground leading-tight">AI plan tailored to you</p>
        </button>
      </div>

      <MenuLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        userId={userId}
        onCreateNew={() => setBuilderOpen(true)}
      />
      <MealPlanSetupDialog
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        userId={userId}
        onGenerated={() => {
          toast({
            title: "Building your menu…",
            description: "Find it in Menu Library (Plan tab) when it's ready — usually 10–30s.",
          });
        }}
      />
    </>
  );
}
