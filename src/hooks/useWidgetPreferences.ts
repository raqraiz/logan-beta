import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WidgetConfig {
  id: string;
  visible: boolean;
  customTitle?: string;
  type?: "built-in" | "custom";
  prompt?: string; // AI prompt for custom widgets
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "cycle_circle", visible: true, type: "built-in" },
  { id: "track", visible: true, type: "built-in" },
  { id: "lab_results", visible: true, type: "built-in" },
  { id: "succeed_you", visible: true, type: "built-in" },
  { id: "succeed_him", visible: true, type: "built-in" },
  { id: "dontmessup_you", visible: true, type: "built-in" },
  { id: "dontmessup_him", visible: true, type: "built-in" },
  { id: "hormone_chart", visible: false, type: "built-in" },
  { id: "symptom_map", visible: false, type: "built-in" },
];

export const DEFAULT_WIDGET_LABELS: Record<string, string> = {
  cycle_circle: "Cycle Circle",
  track: "Track",
  lab_results: "Lab Results",
  succeed_you: "Succeed Today — For You",
  succeed_him: "Succeed Today — For Him",
  dontmessup_you: "Don't Mess Up — For You",
  dontmessup_him: "Don't Mess Up — For Him",
  hormone_chart: "Hormone Chart",
  symptom_map: "Symptom Map",
};

const LEGACY_ID_MAP: Record<string, string> = {
  symptom_tracker: "track",
  cycle_correlations: "track",
};

export function getWidgetLabel(widget: WidgetConfig): string {
  return widget.customTitle || DEFAULT_WIDGET_LABELS[widget.id] || widget.id;
}

export function useWidgetPreferences(userId?: string) {
  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    (async () => {
      const { data } = await supabase
        .from("home_widget_preferences")
        .select("widget_order")
        .eq("user_id", userId)
        .maybeSingle();

      if (data?.widget_order && Array.isArray(data.widget_order)) {
        const rawSaved = (data.widget_order as unknown) as WidgetConfig[];
        const seen = new Set<string>();
        const saved: WidgetConfig[] = [];
        for (const w of rawSaved) {
          const mapped = LEGACY_ID_MAP[w.id] || w.id;
          if (seen.has(mapped)) continue;
          seen.add(mapped);
          saved.push({ ...w, id: mapped });
        }
        const savedIds = new Set(saved.map(w => w.id));
        const merged = [
          ...saved,
          ...DEFAULT_WIDGETS.filter(w => !savedIds.has(w.id)),
        ];
        setWidgets(merged);
      }
      setLoading(false);
    })();
  }, [userId]);

  const save = useCallback(async (newWidgets: WidgetConfig[]) => {
    setWidgets(newWidgets);
    if (!userId) return;
    setSaving(true);
    await supabase
      .from("home_widget_preferences")
      .upsert({ user_id: userId, widget_order: newWidgets as any }, { onConflict: "user_id" });
    setSaving(false);
  }, [userId]);

  const toggleWidget = useCallback((id: string) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  }, []);

  const renameWidget = useCallback((id: string, newTitle: string) => {
    setWidgets(prev => prev.map(w =>
      w.id === id ? { ...w, customTitle: newTitle || undefined } : w
    ));
  }, []);

  const addCustomWidget = useCallback((title: string, prompt: string) => {
    const id = `custom_${Date.now()}`;
    setWidgets(prev => [...prev, {
      id,
      visible: true,
      customTitle: title,
      type: "custom",
      prompt,
    }]);
    return id;
  }, []);

  const removeWidget = useCallback((id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id));
  }, []);

  return { widgets, loading, saving, save, toggleWidget, renameWidget, setWidgets, addCustomWidget, removeWidget };
}
