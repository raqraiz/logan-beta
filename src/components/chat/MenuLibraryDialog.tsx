import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Eye, Trash2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { MealPlanPreviewDialog } from "./MealPlanPreviewDialog";
import { MealPlanSetupDialog } from "./MealPlanSetupDialog";

interface SavedMenu {
  id: string;
  title: string | null;
  status: string | null;
  pdf_path: string | null;
  style: string | null;
  created_at: string;
  metadata: any;
}

interface MenuLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onCreateNew?: () => void;
}

export function MenuLibraryDialog({ open, onOpenChange, userId, onCreateNew }: MenuLibraryDialogProps) {
  const [menus, setMenus] = useState<SavedMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SavedMenu | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    supabase
      .from("user_resources")
      .select("*")
      .eq("user_id", userId)
      .eq("type", "meal_plan")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setMenus((data ?? []) as SavedMenu[]);
        setLoading(false);
      });
  }, [open, userId]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("user_resources").delete().eq("id", id);
    setMenus(prev => prev.filter(m => m.id !== id));
  };

  const handleOpen = (menu: SavedMenu) => {
    setSelected(menu);
    setPreviewOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Menu Library
            </DialogTitle>
            <DialogDescription>
              Your saved meal plans, ready to revisit anytime.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : menus.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">No saved menus yet.</p>
              {onCreateNew && (
                <Button
                  onClick={() => { onOpenChange(false); onCreateNew(); }}
                  variant="premium"
                  size="sm"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Build your first menu
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2 py-1">
              {menus.map(menu => {
                const isReady = menu.status === "ready";
                const isGenerating = menu.status === "generating";
                return (
                  <button
                    key={menu.id}
                    onClick={() => isReady && handleOpen(menu)}
                    disabled={!isReady}
                    className={cn(
                      "w-full rounded-xl border p-3 flex items-center gap-3 text-left transition-all",
                      isReady
                        ? "border-border/40 bg-card/50 hover:bg-card/80 hover:border-primary/40 cursor-pointer"
                        : "border-border/30 bg-card/30 opacity-70 cursor-default"
                    )}
                  >
                    <div className={cn(
                      "shrink-0 w-10 h-12 rounded-md flex items-center justify-center",
                      isReady ? "bg-primary/15" : "bg-muted/40",
                    )}>
                      <FileText className={cn("h-4 w-4", isReady ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {menu.title || "Meal Plan"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {isGenerating ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" /> Building…
                          </span>
                        ) : isReady ? (
                          new Date(menu.created_at).toLocaleDateString(undefined, {
                            month: "short", day: "numeric", year: "numeric",
                          })
                        ) : (
                          "Failed"
                        )}
                      </p>
                    </div>
                    {isReady && <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    <button
                      onClick={(e) => handleDelete(menu.id, e)}
                      className="shrink-0 p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Delete menu"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </button>
                );
              })}

              {onCreateNew && (
                <Button
                  onClick={() => { onOpenChange(false); onCreateNew(); }}
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Build a new menu
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {selected && (
        <MealPlanPreviewDialog
          open={previewOpen}
          onOpenChange={(o) => {
            setPreviewOpen(o);
            if (!o) setSelected(null);
          }}
          title={selected.title || "Meal Plan"}
          preview={selected.metadata?.preview ?? null}
          previewUrl={null}
          previewLoading={false}
        />
      )}
    </>
  );
}
