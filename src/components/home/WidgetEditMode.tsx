import { useState } from "react";
import { Eye, EyeOff, GripVertical, Pencil, Check, Trash2, Plus, Sparkles, Settings2 } from "lucide-react";
import { WidgetConfig, getWidgetLabel, DEFAULT_WIDGET_LABELS } from "@/hooks/useWidgetPreferences";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface WidgetEditModeProps {
  widgets: WidgetConfig[];
  onToggle: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onReorder: (widgets: WidgetConfig[]) => void;
  onRemove: (id: string) => void;
  onAddCustom: () => void;
  onEditCustom: (widget: WidgetConfig) => void;
}

function SortableWidgetItem({
  widget,
  onToggle,
  onRename,
  onRemove,
  onEditCustom,
}: {
  widget: WidgetConfig;
  onToggle: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onRemove: (id: string) => void;
  onEditCustom: (widget: WidgetConfig) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(getWidgetLabel(widget));
  const isCustom = widget.type === "custom";

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${
        isDragging ? "shadow-lg scale-[1.02]" : ""
      } ${
        widget.visible
          ? "border-border/40 bg-card/60"
          : "border-border/20 bg-card/20 opacity-50"
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {isCustom && (
        <Sparkles className="w-3 h-3 text-primary/50 shrink-0" />
      )}

      {editing ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="h-7 text-sm px-2 flex-1 min-w-0"
            placeholder={DEFAULT_WIDGET_LABELS[widget.id] || "Widget name"}
            autoFocus
            onKeyDown={e => {
              if (e.key === "Enter") {
                onRename(widget.id, title);
                setEditing(false);
              }
            }}
          />
          <button
            onClick={() => {
              onRename(widget.id, title);
              setEditing(false);
            }}
            className="text-primary hover:text-primary/80 transition-colors shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 flex-1 min-w-0 group text-left"
        >
          <span className="text-sm text-foreground/80 truncate">
            {getWidgetLabel(widget)}
          </span>
          <Pencil className="w-3 h-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
        </button>
      )}

      <div className="flex items-center gap-1 shrink-0">
        {isCustom && (
          <>
            <button
              onClick={() => onEditCustom(widget)}
              className="text-muted-foreground/40 hover:text-foreground transition-colors"
              aria-label="Edit widget"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onRemove(widget.id)}
              className="text-muted-foreground/40 hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
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
    </div>
  );
}

export function WidgetEditMode({ widgets, onToggle, onRename, onReorder, onRemove, onAddCustom }: WidgetEditModeProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = widgets.findIndex(w => w.id === active.id);
      const newIndex = widgets.findIndex(w => w.id === over.id);
      onReorder(arrayMove(widgets, oldIndex, newIndex));
    }
  };

  return (
    <div className="w-full max-w-xs mx-auto flex flex-col gap-2 px-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={widgets.map(w => w.id)} strategy={verticalListSortingStrategy}>
          {widgets.map(widget => (
            <SortableWidgetItem
              key={widget.id}
              widget={widget}
              onToggle={onToggle}
              onRename={onRename}
              onRemove={onRemove}
            />
          ))}
        </SortableContext>
      </DndContext>

      <Button
        variant="outline"
        size="sm"
        onClick={onAddCustom}
        className="mt-2 gap-1.5 text-xs border-dashed border-border/50 text-muted-foreground hover:text-foreground"
      >
        <Plus className="w-3.5 h-3.5" />
        <Sparkles className="w-3 h-3" />
        Create AI Widget
      </Button>
    </div>
  );
}
