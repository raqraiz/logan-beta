import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single source for "has she asked Logan not to bring up her life stage?".
 * Reads the active stage row from user_topic_boundaries once per signed-in
 * user and shares the result across every component (module-level cache),
 * so Home, Plan and Chat never query the table separately.
 * Display-only: never changes life_stage or any stage data.
 */

type Entry = { stageKey: string | null; loaded: boolean };

let cacheUserId: string | null = null;
let cacheEntry: Entry = { stageKey: null, loaded: false };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

async function load(force = false): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id ?? null;
  if (!userId) {
    cacheUserId = null;
    cacheEntry = { stageKey: null, loaded: true };
    notify();
    return;
  }
  if (!force && cacheUserId === userId && cacheEntry.loaded) return;
  if (cacheUserId !== userId) {
    cacheUserId = userId;
    cacheEntry = { stageKey: null, loaded: false };
  }
  const { data, error } = await supabase
    .from("user_topic_boundaries")
    .select("stage_key")
    .eq("user_id", userId)
    .eq("active", true)
    .not("stage_key", "is", null)
    .limit(1)
    .maybeSingle();
  if (cacheUserId !== userId) return;
  // On error, fail open to the normal display rather than blocking the screen.
  cacheEntry = { stageKey: error ? null : (data?.stage_key ?? null), loaded: true };
  notify();
}

function ensureLoaded(force = false) {
  if (!inflight || force) {
    inflight = load(force).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Re-read after a new boundary may have been saved (e.g. after a chat reply). */
export function refreshStageBoundary() {
  return ensureLoaded(true);
}

supabase.auth.onAuthStateChange(() => {
  void ensureLoaded(true);
});

/** Map the app's life_stage value to the boundary table's stage_key. */
export function stageKeyForLifeStage(lifeStage: string | null | undefined): string | null {
  switch (lifeStage) {
    case "pregnancy_loss":
      return "pregnancy_loss";
    case "pregnant":
      return "pregnancy";
    case "postpartum":
      return "postpartum";
    case "perimenopause":
      return "perimenopause";
    case "menopause":
      return "menopause";
    default:
      return null;
  }
}

/** True when the active stage boundary covers her current life stage. */
export function isStageHidden(stageKey: string | null, lifeStage: string | null | undefined): boolean {
  const k = stageKeyForLifeStage(lifeStage);
  return !!stageKey && !!k && stageKey === k;
}

export function useStageBoundary(): { stageKey: string | null; loading: boolean } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    void ensureLoaded();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { stageKey: cacheEntry.stageKey, loading: !cacheEntry.loaded };
}
