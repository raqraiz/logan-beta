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
- [ ] Custom community symptoms become visible to everyone once 10+ consenting women log them. Implement by reading the precomputed Together daily totals, never by scanning symptom_logs at request time.

## Acute-distress mode
- [x] Acute-distress mode: no hormonal attribution, no auto-logging, red-flag line, localized emergency info.
- [x] Self-harm path: explicit phrases get the full reply, ambiguous phrases get a gentle check-in, and the mode lasts the whole session.
- [ ] Follow-up (separate PR): Hebrew versions of the fixed replies, check-in and red-flag line, for Hebrew messages. Needs native review before shipping.
