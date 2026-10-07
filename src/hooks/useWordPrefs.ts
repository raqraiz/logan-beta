import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sentenceCase } from "@/lib/symptomCatalog";
import { toast } from "sonner";

/** Her own words: rename/remove in user_word_prefs (her account), future logs only. Legacy phone copies are moved in once. */
export function useWordPrefs(userId: string) {
  const [prefs, setPrefs] = useState<Record<string, string | null>>({});
  useEffect(() => {
    if (!userId) return;
    const legacyKey = `logan:your-words:${userId}`;
    (async () => {
      let legacy: Record<string, string | null> = {};
      try { legacy = JSON.parse(localStorage.getItem(legacyKey) || "{}"); } catch { /* ignore */ }
      const entries = Object.entries(legacy);
      if (entries.length) {
        const { error } = await supabase.from("user_word_prefs").upsert(
          entries.map(([original_word, v]) => ({ user_id: userId, original_word, new_name: v, removed: v === null })),
          { onConflict: "user_id,original_word" });
        if (!error) { try { localStorage.removeItem(legacyKey); } catch { /* ignore */ } }
      }
      const { data } = await supabase.from("user_word_prefs").select("original_word, new_name, removed").eq("user_id", userId);
      const m: Record<string, string | null> = {};
      for (const r of data ?? []) m[r.original_word] = r.removed ? null : (r.new_name ?? sentenceCase(r.original_word));
      setPrefs(m);
    })();
  }, [userId]);
  const save = async (word: string, value: string | null) => {
    const prev = prefs;
    setPrefs({ ...prefs, [word]: value });
    const { error } = await supabase.from("user_word_prefs").upsert(
      { user_id: userId, original_word: word, new_name: value, removed: value === null }, { onConflict: "user_id,original_word" });
    if (error) { setPrefs(prev); toast.error("That didn't save. Try again."); }
  };
  return { prefs, save };
}
