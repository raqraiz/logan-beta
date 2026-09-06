import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildCanonicalNameMap, resolveSymptomName, type CanonicalRow } from "@/lib/symptomModeration";

/**
 * Logs store symptom names, so merges/deprecations resolve by name at read time.
 * Returns a resolver: canonical name, or null when the entry was retired.
 */
export function useCanonicalSymptoms() {
  const [map, setMap] = useState<Map<string, string | null>>(new Map());

  useEffect(() => {
    let active = true;
    supabase
      .from("community_symptoms")
      .select("id, name, status, canonical_id")
      .in("status", ["approved", "merged", "deprecated"])
      .then(({ data }) => {
        if (!active || !data) return;
        setMap(buildCanonicalNameMap(data as CanonicalRow[]));
      });
    return () => { active = false; };
  }, []);

  const resolve = useCallback((name: string) => resolveSymptomName(name, map), [map]);
  return { resolve, map };
}
