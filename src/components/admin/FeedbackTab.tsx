import { useState } from "react";
import { ParticipantThreadList } from "./ParticipantThreadList";
import { ConversationThread } from "./ConversationThread";

export function FeedbackTab() {
  const [selectedParticipant, setSelectedParticipant] = useState<{
    id: string;
    name: string;
  } | null>(null);

  if (selectedParticipant) {
    return (
      <ConversationThread
        participantId={selectedParticipant.id}
        participantName={selectedParticipant.name}
        onClose={() => setSelectedParticipant(null)}
      />
    );
  }

  return (
    <ParticipantThreadList
      onSelectParticipant={(id, name) => setSelectedParticipant({ id, name })}
    />
  );
}
