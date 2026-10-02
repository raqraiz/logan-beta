import { useState } from "react";
import { PartnerHeadsupSetup } from "./PartnerHeadsupSetup";
import { PartnerHeadsupDraftCard } from "./PartnerHeadsupDraftCard";

interface Props {
  userId: string;
  kind: "offer" | "ask";
  cacheKey: string;
}

const chip =
  "min-h-[44px] px-4 rounded-full border border-border/60 bg-card/60 text-sm font-medium text-foreground hover:bg-card transition-colors";

/** Buttons under Logan's partner heads-up offer / ask messages. */
export function PartnerHeadsupOfferCard({ userId, kind, cacheKey }: Props) {
  const [state, setState] = useState<"idle" | "setup" | "dismissed" | "one_off">("idle");

  if (state === "dismissed") return null;
  if (state === "setup") return <PartnerHeadsupSetup userId={userId} onClose={() => setState("dismissed")} />;
  if (state === "one_off") {
    // "Just this week": draft right away with default content; no settings are saved.
    return (
      <div className="headsup-surface mt-2 rounded-[20px] border border-border/50 bg-card/70 p-4">
        <PartnerHeadsupDraftCard userId={userId} cacheKey={cacheKey} mode="predicted" kind="on_demand" justThisWeek />
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {kind === "offer" ? (
        <>
          <button className={chip} onClick={() => setState("setup")}>Set it up</button>
          <button className={chip} onClick={() => setState("dismissed")}>Not now</button>
        </>
      ) : (
        <>
          <button className={chip} onClick={() => setState("setup")}>Every cycle</button>
          <button className={chip} onClick={() => setState("one_off")}>Just this week</button>
        </>
      )}
    </div>
  );
}
