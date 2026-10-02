import { useState } from "react";
import { PartnerHeadsupSetup } from "./PartnerHeadsupSetup";

interface Props {
  userId: string;
  kind: "offer" | "ask";
}

const chip =
  "min-h-[44px] px-4 rounded-full border border-border/60 bg-card/60 text-sm font-medium text-foreground hover:bg-card transition-colors";

/** Buttons under Logan's partner heads-up offer / ask messages. */
export function PartnerHeadsupOfferCard({ userId, kind }: Props) {
  const [state, setState] = useState<"idle" | "setup" | "dismissed" | "one_off">("idle");

  if (state === "dismissed") return null;
  if (state === "setup") return <PartnerHeadsupSetup userId={userId} onClose={() => setState("dismissed")} />;
  if (state === "one_off") {
    // PART 2 STUB: the one-off "Just this week" draft card goes here.
    return (
      <div className="headsup-surface mt-2 rounded-[20px] border border-dashed border-border/60 p-4 text-xs text-muted-foreground">
        One-off draft card coming soon.
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
