import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
/**
 * Tracks user activity (page views, clicks, tab switches, widget interactions)
 * and batches inserts to avoid spamming the database.
 */

interface ActivityEvent {
  user_id: string;
  event_type: string;
  page_path: string;
  element_label: string | null;
  element_type: string | null;
  metadata: Json;
}

const FLUSH_INTERVAL = 5000; // flush every 5 seconds
const MAX_BUFFER = 20;

/** Last tab the user opened — prefixes event names as `<tab>.<feature>.<action>`. */
let currentTab = "app";


export function useActivityTracker(userId?: string) {
  const bufferRef = useRef<ActivityEvent[]>([]);
  const lastPageView = useRef<string>("");

  const flush = useCallback(async () => {
    if (!userId || bufferRef.current.length === 0) return;
    const batch = bufferRef.current.splice(0);
    try {
      await supabase.from("user_activity_events").insert(batch);
    } catch (e) {
      // silently fail — analytics shouldn't break the app
      console.error("Activity tracking error:", e);
    }
  }, [userId]);

  const track = useCallback(
    (
      eventType: string,
      opts?: {
        elementLabel?: string;
        elementType?: string;
        metadata?: Record<string, unknown>;
      }
    ) => {
      if (!userId) return;
      bufferRef.current.push({
        user_id: userId,
        event_type: eventType,
        page_path: window.location.pathname,
        element_label: opts?.elementLabel || null,
        element_type: opts?.elementType || null,
        metadata: (opts?.metadata || {}) as Json,
      });
      if (bufferRef.current.length >= MAX_BUFFER) flush();
    },
    [userId, flush]
  );

  // Track page views on path change
  const trackPageView = useCallback(
    (path: string) => {
      if (path === lastPageView.current) return;
      lastPageView.current = path;
      track("page_view", { metadata: { path } });
    },
    [track]
  );

  // Track tab switches
  const trackTabSwitch = useCallback(
    (tabId: string) => {
      currentTab = (tabId || "app").toLowerCase();
      track("tab_switch", { elementLabel: tabId, elementType: "tab" });
    },
    [track]
  );



  // Track button/element clicks
  const trackClick = useCallback(
    (label: string, type: string = "button", meta?: Record<string, unknown>) => {
      track("click", { elementLabel: label, elementType: type, metadata: meta });
    },
    [track]
  );

  // Track widget interactions
  const trackWidget = useCallback(
    (widgetId: string, action: string = "view") => {
      track("widget_interact", {
        elementLabel: widgetId,
        elementType: "widget",
        metadata: { action },
      });
    },
    [track]
  );

  // Auto-capture clicks on interactive elements via event delegation
  useEffect(() => {
    if (!userId) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Walk up to find nearest button, link, or interactive element
      const el =
        target.closest("button") ||
        target.closest("a") ||
        target.closest("[role='button']") ||
        target.closest("[data-track]");
      if (!el) return;

      // Extract a label
      const label =
        el.getAttribute("data-track") ||
        el.getAttribute("aria-label") ||
        el.textContent?.trim().slice(0, 60) ||
        el.tagName.toLowerCase();

      const type = el.tagName.toLowerCase() === "a" ? "link" : "button";

      track("click", { elementLabel: label, elementType: type });
    };

    document.addEventListener("click", handleClick, { capture: true, passive: true });

    // Coverage fill: interactions that are NOT buttons/links and therefore never
    // reached the delegated click handler — sliders, selects, text fields,
    // drag-reordering. All user-initiated; nothing here fires on render.
    const featureOf = (el: Element | null) =>
      (el?.closest("[data-feature]")?.getAttribute("data-feature") ||
        el?.getAttribute("aria-label") ||
        el?.getAttribute("name") ||
        "control")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .slice(0, 40);

    const emit = (feature: string, action: string, el: Element | null) => {
      track(`${currentTab}.${feature}.${action}`, {
        elementLabel: el?.getAttribute("aria-label") || feature,
        elementType: el?.tagName.toLowerCase() || null,
      });
    };

    const handlePointerDown = (e: Event) => {
      const el = (e.target as HTMLElement)?.closest?.("[role='slider'], input[type='range']");
      if (!el) return;
      emit(featureOf(el), "adjust", el);
    };

    const handleChange = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName.toLowerCase();
      if (tag !== "input" && tag !== "select" && tag !== "textarea") return;
      const type = (el as HTMLInputElement).type;
      if (type === "range") return; // already covered by pointerdown
      emit(featureOf(el), type === "checkbox" || type === "radio" ? "toggle" : "edit", el);
    };

    const handleDragEnd = (e: Event) => {
      const el = (e.target as HTMLElement)?.closest?.("[draggable='true']");
      if (!el) return;
      emit(featureOf(el), "reorder", el);
    };

    document.addEventListener("pointerdown", handlePointerDown, { capture: true, passive: true });
    document.addEventListener("change", handleChange, { capture: true, passive: true });
    document.addEventListener("dragend", handleDragEnd, { capture: true, passive: true });

    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("change", handleChange, true);
      document.removeEventListener("dragend", handleDragEnd, true);
    };
  }, [userId, track]);


  // Periodic flush
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(flush, FLUSH_INTERVAL);
    // Flush on unload
    const handleUnload = () => flush();
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleUnload);
      flush(); // flush remaining on unmount
    };
  }, [userId, flush]);

  return { track, trackPageView, trackTabSwitch, trackClick, trackWidget };
}
