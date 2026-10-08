# Roadmap

## Log mode bubbles
- [x] Share Together packing, category colors and Mine size rules; rank her 12-month counts before minimum-size suggestions, max 14.
- [x] Add exact dark category, selected and ring colors to the shared field.
- [x] Verify ranking, selection and non-overlapping packing on phone/desktop; minimum measured contrast 9.99:1 dark and 11.96:1 light, 41 unit and 9 boundary tests pass, no data saved.

## Real-data symptom page fixes
- [x] Always show the prevalence ring and honest empty-data copy.
- [x] Use circular usual windows consistently for timing, comparisons and chart dots.
- [x] Remove duplicate doctor advice and verify with real logs, without writes (41 unit tests, 9 boundary tests; real Muffled hearing: 13 logs, 7 cycles, Days 25 to 3).

## Consistent symptom pages
- [x] Keep all symptom page sections visible, including honest chart and ring empty states.
- [x] Add daily privacy-safe community pairs and own-log fallback across two real cycles.
- [x] Add the noninteractive sharing placeholder and verify populated/empty pages (phone/desktop, light/dark, related-symptom navigation; 36 unit tests and 9 boundary tests pass).

## Your data page
- [x] Replace the You tile dialog with the full Your data page and three views.
- [x] Reuse cycle analytics, pattern rows, memory controls, and existing fact/tracker settings.
- [x] Verify navigation, empty states, light/dark themes, and memory confirmation without deleting real data.

- [x] Inline severity sliders under selected symptom chips
  - [x] Remove standalone Severity section
  - [x] Render slider full-width below each selected chip
  - [x] Keep selected chip compact (same size as unselected chips)

## Partner heads-up part 2
- [x] Part 2 built (drafts, on-demand, edit sheet, sending, skip, check-in, Manage, browser notifications)
- [x] Learning: keep her last 5 edited messages (user chose)

## You tab redesign
- [x] Pill ink color, disclaimer, About Logan, no-diagnosis rule
- [x] You tab: title, ring, patterns, tiles, trackers (Doctor tile hidden: no doctor summary feature exists)

## Symptom page replacement
- [x] Polish equal-width stat tiles, single-line values, short insights and separate doctor advice.
- [x] Replace the old pattern layout with definition and personal symptom cards.
- [x] Connect preselected logging and retain correction/hide controls.
- [x] Verify populated and zero states, mobile spacing, and dark mode (read-only browser checks; hide/undo writes not exercised).

## One place for symptoms (Together)
- [x] Remove old Log symptoms sheet; all openers go to Together log mode (chat "Log X?" card stays inline)
- [x] You tab "Your symptoms" row opens Together on Mine (12 months)
- [x] Everyone / Mine switch, log mode, floating "+ Log how I feel" with room below the field
- [x] No consent gate on viewing; signup checkbox; one-time chat ask

## Together step 4: What helped
- [x] Tips, votes, reports, hidden-authors tables and secure functions
- [x] Moderation function, What helped page, share screen, Logan's notes
- [x] Safety symptoms: doctor line + Ask Logan, no share
- [x] Report for all signed-in women; hide author with Settings undo
- [x] Admin Tips queue incl. remove all from author
- [x] Delete all memory and account deletion cover tips
- [x] Tip rules recorded in the project notes

## Later
- [x] Superseded: custom words no longer wait for 10+ women. See "Together custom words" below.

## Together custom words
- [x] Custom words are shared immediately after AI moderation (library match first, then the existing tips check function in a word mode). A word that is rejected, or whose check fails or times out, stays private in "Your words".
- [x] Counts are bucketed on the server (under 3 / 3 to 9 / 10+): "Named by a woman like you", "A few women", then the exact number. The phone never gets exact counts under 10 or any user IDs.
- [x] Daily totals and symptom pairs now include library entries only. Custom words reach Together only through get_together_words().
- [x] Consent version bumped to together-v2 with new copy. Existing members see one chat message ("Keep me in" / "Leave Together"). Until they answer, their logs keep counting and none of their words are shared.
- [x] Words can be reported from a "..." menu (3 reports hide a word); reported words are reviewed in the existing Tips screen. Counts-only word events live in together_word_events.


## Acute-distress mode
- [x] Acute-distress mode: no hormonal attribution, no auto-logging, red-flag line, localized emergency info.
- [x] Self-harm path: explicit phrases get the full reply, ambiguous phrases get a gentle check-in, and the mode lasts the whole session.
- [x] Live-test fixes: log saves on "yes", announcements paused during and 6h after distress, check-in chips, hedged hormone wording.
- [ ] Follow-up (separate PR): Hebrew versions of the fixed replies, check-in and red-flag line, for Hebrew messages. Needs native review before shipping.

## Together words in other languages
- [x] Words in other languages map to existing library entries by meaning, and only when the meaning is clear (e.g. a Hebrew "headache" counts as Headache, never Migraine). Unsure means a new word with the usual checks.
- [x] Mappings live in a locked table, follow library merges, stop when an entry is retired, and can be switched off with one SQL line. Her logs are never rewritten.
- [ ] Not built: a language setting and translated library names (own task).

## Back office
- [ ] Back office rebuilt from the hi-fi design in 6 phases. Rule: no health data in the back office for anyone. Super admins can see a woman's name, email, engagement counts and consent; admins see first names on feedback and referrals; everything else is totals. Send audiences need 10+ women when filtered by stage.
  - [x] Phase 1: shell, Today, Growth.
  - [x] Phase 2: Users list and one woman's page (super admin only), audit log, safer account delete.
  - [ ] Data export: private bucket, signed link that expires, one export list per table, email template.
  - [ ] Health-data consent needs a stored version (consent_version), written at sign-up. Part of the Beta 2.0 onboarding.

## Back office phase 3a: Feedback
- [x] Feedback health rule: admins always see health details replaced by [health detail]; super admins see them only when she taps 'Yes, they can' (or for feedback sent before the question existed). Check failure = hidden.

## Back office phase 3b: Referrals and Tips
- [ ] Tips: store Logan's reason when it's unsure about a tip (needs a change to the moderation edge function), so the review card can show the real reason instead of the generic line.

## Decisions
- Decision: team messages live in a separate inbox, never in the Logan chat. The inbox is also an entry point for feedback.

## Back office Phase 4: Send
- [x] Decision: broadcasts go to the team inbox only, with a minimum audience of 10 women for any filtered group. No email or push yet.
- [x] Send screen: audience (Everyone or life stages), live count, compose with inbox preview, drafts and approvals, confirm dialog, sent history, "Send a test to me" for super admins.
- [x] Old chat-based Send tab removed from /admin/classic; send-broadcast and draft-broadcast now answer 410 "Moved to the new back office".

## Back office phase 5: Investor reports
Decision: investor numbers lock on first view after month end and never change. Reports are copied out, not sent from Logan.
- [x] One report per UTC month: total users at month end, new users, growth % vs previous month (n/a when the previous month had no users), goal progress, monthly active, average weekly active, stickiness (7 day / 30 day), top signup sources, referral joins, feedback counts by theme. Same functions and definitions as Today and Growth; no names, emails, health data or message text.
- [x] Lazy lock: the first open after the month ends freezes the numbers into a snapshot table (no user IDs in it). The current month is live and labelled "So far this month, not locked". Months that ended before this feature are labelled "Calculated after the month ended". The audit log records who locked it and when (`report_locked`), plus `report_finalized` and `report_copied` (no content).
- [x] Notes per month: Highlights, Lowlights, Asks. Admins write a draft (`admin_drafts`, kind `investor_report`); super admin edits, approves or rejects. Only super admin marks a report Final; Final reports are read-only.
- [x] "Copy report" gives plain text for the investor email. No em dashes: any in the notes become hyphens at copy time.
- Definition: "Still active the next month" = of the women who joined in the previous month, the share who had at least one active event (`_admin_user_events`) at any point during this month. Shown as a % plus the counts (for example "62%, 31 of 50"). If the previous month's group is under 10, it shows "Fewer than 10 joined" and no percentage (the real count never leaves the database).
- Definition: monthly active = women active in the 30 days up to month end; stickiness = active in the last 7 days divided by active in the last 30 days, at month end; average weekly active = mean of the Monday to Sunday weeks that fall entirely inside the month.
- Not in v1: life stage breakdown, quarterly reports, PDF export.
- [x] Goal removed from investor reports (numbers, chart and copy text). The goal still lives on Today and Growth. Months locked before this change keep their old goal fields in the snapshot, which the page ignores.
