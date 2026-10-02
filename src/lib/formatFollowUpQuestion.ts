// Light display formatter for Logan's follow-up question bubble only.
// Never apply to general chat replies.
const QUESTION_START = /^(is|are|am|was|were|do|does|did|have|has|had|can|could|will|would|should|shall|may|might|what|when|where|which|who|whom|whose|why|how|any|anything|ever)\b/i;

export function formatFollowUpQuestion(text: string): string {
  let t = (text ?? "").trim();
  if (!t) return t;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[?.!]$/.test(t) && QUESTION_START.test(t)) t += "?";
  return t;
}
