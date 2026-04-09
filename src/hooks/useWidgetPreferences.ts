import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WidgetConfig {
  id: string;
  visible: boolean;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "cycle_circle", visible: true },
  { id: "succeed_you", visible: true },
  { id: "succeed_him", visible: true },
  { id: "dontmessup_you", visible: true },
  { id: "dontmessup_him", visible: true },
  { id: "hormone_chart", visible: false },
  { id: "symptom_map", visible: false },
];

export const WIDGET_LABELS: Record<string, string> = {
  cycle_circle: "Cycle Circle",
  succeed_you: "Succeed Today — For You",
  succeed_him: "Succeed Today — For Him",
  dontmessup_you: "Don't Mess Up — For You",
  dontmessup_him: "Don't Mess Up — For Him",
  hormone_chart: "Hormone Chart",
  symptom_map: "Symptom Map",
};

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
        // Merge saved prefs with defaults (in case new widgets were added)
        const saved = data.widget_order as WidgetConfig[];
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

  const moveWidget = useCallback((index: number, direction: "up" | "down") => {
    setWidgets(prev => {
      const next = [...prev];
      const swapIdx = direction === "up" ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
      return next;
    });
  }, []);

  const toggleWidget = useCallback((id: string) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  }, []);

  return { widgets, loading, saving, save, moveWidget, toggleWidget, setWidgets };
}
