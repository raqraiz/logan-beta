// ONE list of everything cleared when an account is deleted. Used by delete-user (super admin
// deletes a woman) and delete-account (she deletes herself), so the two can never drift apart.
// When you add a table that holds her data, add it here. The after-delete check
// (admin_leftover_rows) also scans every public table with a user_id column, so a table missed
// here shows up in the failure report instead of being silently kept.
//
// Never log personal or health data in here: only table names and counts.

// deno-lint-ignore no-explicit-any
type Client = any;

/** Tables cleared by `user_id`. */
export const USER_ID_TABLES = [
  // chat and settings
  "chat_messages", "team_messages", "notification_preferences", "home_widget_preferences", "daily_home_insights",
  "user_topic_boundaries", "user_hidden_symptoms", "symptom_candidate_rejections", "user_word_prefs",
  // tracking and health records
  "tracker_logs", "custom_trackers", "symptom_logs", "weight_logs", "meals", "nutrition_goals",
  "user_dietary_prefs", "lab_markers", "lab_panels", "history_imports", "user_memory_notes",
  "insight_feedback_events",
  // credits and integrations
  "user_credits", "credit_transactions", "user_integrations", "push_tokens",
  // partner heads-ups
  "partner_headsup_events", "partner_headsup_settings", "partner_headsup_style_examples", "headsup_people",
  // feedback, resources, activity
  "user_feedback", "feature_requests", "feedback_prompt_state", "user_resources", "resource_feedback",
  "user_activity_events", "feature_events", "attribution_events", "message_failures",
  "policy_notifications", "referral_code_attempts",
  // Together (her votes, her hidden-author choices, her own words)
  "together_tip_votes", "together_tip_hidden_authors", "together_words",
] as const;

/** Tables cleared by a differently named person column. */
export const OTHER_COLUMN_TABLES: { table: string; column: string }[] = [
  { table: "together_tip_hidden_authors", column: "author_id" },
  { table: "together_tip_reports", column: "reporter_id" },
  { table: "together_word_reports", column: "reporter_id" },
  { table: "symptom_reports", column: "reporter_id" },
];

/** Her Together tips (author_id). Votes and reports other women made on them go first. */
export const TIP_TABLE = "together_tips";
export const TIP_CHILD_TABLES = ["together_tip_votes", "together_tip_reports"] as const;

/** Send logs and tracking, keyed by her email address. */
export const EMAIL_TABLES: { table: string; column: string }[] = [
  { table: "email_send_log", column: "recipient_email" },
  { table: "email_opens", column: "recipient_email" },
  { table: "email_unsubscribe_tokens", column: "email" },
];

/** Hang off her participants row (found by user_id, never by email). */
export const PARTICIPANT_CHILD_TABLES = ["cycle_history", "cycle_updates", "feedback", "insights"] as const;

/** Last, in this order: participants, role rows, profile, then the login itself. */
export const FINAL_TABLES = ["participants", "user_roles", "profiles"] as const;

/** Kept on purpose, so an unsubscribe is still honoured and the admin audit trail survives. */
export const KEPT_TABLES = ["suppressed_emails", "admin_audit_log"] as const;

/** Every table cleared, for the PR description and tests. */
export const CLEARED_TABLES: string[] = Array.from(new Set([
  ...USER_ID_TABLES,
  ...OTHER_COLUMN_TABLES.map((t) => t.table),
  TIP_TABLE,
  ...EMAIL_TABLES.map((t) => t.table),
  ...PARTICIPANT_CHILD_TABLES,
  ...FINAL_TABLES,
]));

export type DeletionResult =
  | { ok: true; unlinkedParticipants: number }
  | { ok: false; stage: string; failures: string[]; leftover: { table: string; rows: number }[] };

const fail = (stage: string, failures: string[], leftover: { table: string; rows: number }[] = []): DeletionResult =>
  ({ ok: false, stage, failures, leftover });

/**
 * Deletes everything we hold about one account, then checks nothing is left.
 * Any failed step stops the run and is reported. Safe to run again after a failure.
 * Callers must already have checked who is allowed to do this.
 */
export async function deleteAccountData(admin: Client, userId: string, email: string | null): Promise<DeletionResult> {
  // Before touching anything, make sure the after-delete check exists, so we never delete blind.
  const pre = await admin.rpc("admin_leftover_rows", { _user_id: userId });
  if (pre.error) return fail("preflight", ["after-delete check unavailable (apply the latest database migration)"]);

  const failures: string[] = [];
  const del = async (table: string, column: string, value: string) => {
    const { error } = await admin.from(table).delete().eq(column, value);
    if (error) failures.push(`${table}.${column}: ${error.message}`);
  };

  // Her participants row(s), by user_id only. Anyone can create a row with any email.
  const { data: parts, error: partsErr } = await admin.from("participants").select("id").eq("user_id", userId);
  if (partsErr) return fail("participants lookup", [`participants: ${partsErr.message}`]);
  const participantIds: string[] = (parts ?? []).map((p: { id: string }) => p.id);

  // Her tips, and the votes and reports other women made on them.
  const { data: tips, error: tipsErr } = await admin.from(TIP_TABLE).select("id").eq("author_id", userId);
  if (tipsErr) return fail("tips lookup", [`${TIP_TABLE}: ${tipsErr.message}`]);
  const tipIds: string[] = (tips ?? []).map((t: { id: string }) => t.id);
  if (tipIds.length) {
    for (const t of TIP_CHILD_TABLES) {
      const { error } = await admin.from(t).delete().in("tip_id", tipIds);
      if (error) failures.push(`${t}.tip_id: ${error.message}`);
    }
  }

  for (const id of participantIds) for (const t of PARTICIPANT_CHILD_TABLES) await del(t, "participant_id", id);
  for (const t of USER_ID_TABLES) await del(t, "user_id", userId);
  for (const t of OTHER_COLUMN_TABLES) await del(t.table, t.column, userId);
  await del(TIP_TABLE, "author_id", userId);
  if (email) for (const t of EMAIL_TABLES) await del(t.table, t.column, email);

  // Women she invited keep their accounts; they just lose the link to her.
  {
    const { error } = await admin.from("profiles").update({ referred_by: null }).eq("referred_by", userId);
    if (error) failures.push(`profiles.referred_by: ${error.message}`);
  }

  if (failures.length) return fail("clearing data", failures);

  await del("participants", "user_id", userId);
  await del("user_roles", "user_id", userId);
  await del("profiles", "id", userId);
  if (failures.length) return fail("clearing account", failures);

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError && !(authError.message ?? "").toLowerCase().includes("not found")) {
    return fail("login", [`auth user: ${authError.message}`]);
  }

  // Check: no row with her user_id may remain in any table that has a user_id column.
  const post = await admin.rpc("admin_leftover_rows", { _user_id: userId });
  if (post.error) return fail("check", [`after-delete check failed: ${post.error.message}`]);
  const leftover = (post.data ?? []).map((r: { table_name: string; row_count: number }) => ({ table: r.table_name, rows: Number(r.row_count) }));
  if (leftover.length) return fail("check", [`rows still carry her id in ${leftover.length} table(s)`], leftover);

  // Info only: participants rows with her email but no user_id link are NOT deleted (email is not proof it is hers).
  let unlinkedParticipants = 0;
  if (email) {
    const { count } = await admin.from("participants").select("id", { count: "exact", head: true }).eq("email", email).is("user_id", null);
    unlinkedParticipants = count ?? 0;
  }
  return { ok: true, unlinkedParticipants };
}
