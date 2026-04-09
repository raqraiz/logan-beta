import { ChevronUp, ChevronDown, Eye, EyeOff } from "lucide-react";
import { WidgetConfig, WIDGET_LABELS } from "@/hooks/useWidgetPreferences";

interface WidgetEditModeProps {
  widgets: WidgetConfig[];
  onMove: (index: number, direction: "up" | "down") => void;
  onToggle: (id: string) => void;
}

export function WidgetEditMode({ widgets, onMove, onToggle }: WidgetEditModeProps) {
  return (
    <div className="w-full max-w-xs mx-auto flex flex-col gap-2 px-2">
      {widgets.map((widget, idx) => (
        <div
          key={widget.id}
          className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${
            widget.visible
              ? "border-border/40 bg-card/60"
              : "border-border/20 bg-card/20 opacity-50"
          }`}
        >
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => onMove(idx, "up")}
              disabled={idx === 0}
              className="text-muted-foreground/50 hover:text-foreground disabled:opacity-20 transition-colors"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onMove(idx, "down")}
              disabled={idx === widgets.length - 1}
              className="text-muted-foreground/50 hover:text-foreground disabled:opacity-20 transition-colors"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
          <span className="text-sm text-foreground/80 flex-1">
            {WIDGET_LABELS[widget.id] || widget.id}
          </span>
          <button
            onClick={() => onToggle(widget.id)}
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            {widget.visible ? (
              <Eye className="w-4 h-4" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
