import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Under "Logged for today.": a small Undo that removes the rows the server just saved. */
export function DistressLogUndo({ userId, ids }: { userId: string; ids: string[] }) {
  const [state, setState] = useState<"saved" | "busy" | "undone" | "error">("saved");
  if (!ids.length) return null;
  const undo = async () => {
    setState("busy");
    const { error } = await supabase.from("symptom_logs").delete().in("id", ids).eq("user_id", userId);
    if (error) { setState("error"); return; }
    setState("undone");
    window.dispatchEvent(new CustomEvent("logan:symptoms-changed"));
  };
  if (state === "undone") return <p className="mt-2 text-[13px] text-muted-foreground">Removed.</p>;
  return (
    <p className="mt-2 text-[13px] text-muted-foreground">
      <button type="button" onClick={undo} disabled={state === "busy"} className="underline underline-offset-2">Undo</button>
      {state === "error" && " That didn't work. Try again."}
    </p>
  );
}
