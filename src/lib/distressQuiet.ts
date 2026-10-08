// Quiet period after a distress moment: no one-time announcements or prompts in chat.

export const DISTRESS_QUIET_MS = 6 * 3600_000;

interface MaybeDistressMessage {
  created_at?: string | null;
  metadata?: unknown;
}

const FLAGS = ["distress_mode", "distress_checkin", "distress_post", "distress_log_ask", "distress_logged_ids"];

/** True while a distress-mode message is the latest of its kind within the last 6 hours (newest distress message + 6h). */
export function isDistressQuiet(messages: MaybeDistressMessage[], now: number = Date.now()): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const md = (m?.metadata ?? null) as Record<string, unknown> | null;
    if (!md || typeof md !== "object") continue;
    if (!FLAGS.some((k) => md[k] !== undefined && md[k] !== null && md[k] !== false)) continue;
    const t = m.created_at ? new Date(m.created_at).getTime() : NaN;
    return Number.isFinite(t) ? now - t <= DISTRESS_QUIET_MS : false;
  }
  return false;
}
