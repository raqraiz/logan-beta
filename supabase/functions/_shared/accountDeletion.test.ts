const assert = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };
import { CLEARED_TABLES, KEPT_TABLES, USER_ID_TABLES } from "./accountDeletion.ts";

// Tables that hold a woman's own data. If you add one, add it to accountDeletion.ts too.
const MUST_BE_CLEARED = [
  "chat_messages", "symptom_logs", "tracker_logs", "meals", "lab_panels", "lab_markers", "weight_logs",
  "user_memory_notes", "partner_headsup_events", "partner_headsup_settings", "partner_headsup_style_examples",
  "push_tokens", "together_tips", "together_tip_votes", "together_tip_reports", "email_send_log",
  "participants", "profiles", "user_roles", "cycle_history", "insights",
];

Deno.test("account deletion covers the tables that hold her data", () => {
  for (const t of MUST_BE_CLEARED) assert(CLEARED_TABLES.includes(t), `${t} is not cleared`);
});

Deno.test("no duplicates in the user_id list, and kept tables are never cleared", () => {
  assert(new Set(USER_ID_TABLES).size === USER_ID_TABLES.length, "duplicate in USER_ID_TABLES");
  for (const t of KEPT_TABLES) assert(!CLEARED_TABLES.includes(t), `${t} must be kept`);
});
