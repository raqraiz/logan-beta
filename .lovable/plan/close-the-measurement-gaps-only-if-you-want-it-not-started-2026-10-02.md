# Close the measurement gaps (only if you want it, not started)

Today the following are partly measurable or missing: a structured "insight shown" record, a true "confirmed" vs "corrected" signal, doctor summaries, and a record that a partner heads-up was sent. This plan adds only what is missing. No outside analytics tool is needed.

## Steps
1. One events table, `insight_feedback_events`: user, insight message id, insight type, action (shown / confirmed / corrected / dismissed), date. Only own rows can be read or written. No message text is stored.
2. "Shown": record this when an opener or proactive insight first appears on screen. Each insight is recorded only once.
3. "Confirmed" / "Corrected":
   - Existing thumbs up/down count as confirmed or not confirmed.
   - Add a small "That's right" / "Not quite" pair to opener insights.
   - "Not quite" also records a correction when she then edits her cycle or symptoms.
4. Partner heads-up sent: add a `sent_at` date to partner_headsup_events when she taps "Send on WhatsApp" or "Share". This records a tap only, because the app can't confirm that WhatsApp actually delivered the message.
5. Doctor summary: this feature doesn't exist yet. Its created and shared events would be added when the feature is built.
6. Admin dashboard: one panel showing these counts per week, plus days with at least one conversation per user.

## Technical notes
- Reuse the `useActivityTracker` batching for "shown" events. Write confirmed and corrected events directly.
- The admin panel uses a security-definer function that only admins can call.
