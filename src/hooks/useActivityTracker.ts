import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  metadata: Record<string, unknown>;
}

const FLUSH_INTERVAL = 5000; // flush every 5 seconds
const MAX_BUFFER = 20;

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
        metadata: opts?.metadata || {},
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

    return () => {
      document.removeEventListener("click", handleClick, true);
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
