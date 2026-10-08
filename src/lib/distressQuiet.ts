// Quiet period after a distress moment: no one-time announcements or prompts in chat.

export const DISTRESS_QUIET_MS = 6 * 3600_000;

interface MaybeDistressMessage {
  created_at?: string | null;
  metadata?: unknown;
}

const FLAGS = ["distress_mode", "distress_checkin", "distress_post", "distress_log_ask", "distress_logged_ids", "distress_post_crisis", "distress_heavy_exit"];

/** True while a distress-mode message is the latest of its kind within the last 6 hours (newest distress message + 6h). */
export function isDistressQuiet(messages: MaybeDistressMessage[], now: number = Date.now()): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const md = (m?.metadata ?? null) as Record<string, unknown> | null;
    if (!md || typeof md !== "object") continue;
    if (!FLAGS.some((k) => md[k] !== undefined && md[k] !== null && md[k] !== false)) continue;
    // Post-crisis replies carry the exact end of the 6-hour window, which never restarts.
    const end = typeof md.distress_window_end === "string" ? new Date(md.distress_window_end).getTime() : NaN;
    if (Number.isFinite(end)) return now <= end;
    const t = m.created_at ? new Date(m.created_at).getTime() : NaN;
    return Number.isFinite(t) ? now - t <= DISTRESS_QUIET_MS : false;
  }
  return false;
}

/** The quiet line under a post-crisis reply, or null once the 6-hour window has ended. */
export function postCrisisLine(metadata: unknown, now: number = Date.now()): string | null {
  const md = (metadata ?? null) as Record<string, unknown> | null;
  if (!md || md.distress_post_crisis !== true || typeof md.distress_support_line !== "string") return null;
  const end = typeof md.distress_window_end === "string" ? new Date(md.distress_window_end).getTime() : NaN;
  return Number.isFinite(end) && now <= end ? md.distress_support_line : null;
}
