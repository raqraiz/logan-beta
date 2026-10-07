# Together step 4: What helped other women

## What she sees

**Symptom page card** (ink, now tappable)
- With tips: "What helped other women" + "[N] tips · top one helped [M] women". Opens the What helped page.
- No tips: "No tips yet. Be the first to share what helped you." Opens the share screen.

**What helped page** (round back to the symptom page)
- Cormorant title "What helped with [symptom]".
- Pills: Most helpful (default), Women like me (same stage), Newest. Selected = ink with ✓. "Women like me" is dimmed when no tips from her stage exist.
- White tip cards (radius 22): tip in curly quotes (Quicksand 16), then the author label, never a name. "♡ Helped me too · [N]" toggles to filled ♥ and back. "⋯" opens Report.
- After every 3rd tip, a "LOGAN'S NOTE" card only when tips share a theme (see safety note below).
- Ink button at the bottom: "Share what helped you".

**Share screen**
- "What helped you?", "Your words could be what another woman needs tonight.", tag "For [symptom]", text box max 160 with counter.
- Privacy lines as written, "Share anonymously" ink button, "Cancel" link.
- After sending: "Thanks. It will appear once Logan has checked it."
- Women who haven't joined Together see "Count me in" (consent sheet) instead of the share and vote actions. Reading is open to everyone.

**Report**: "Why are you reporting this?" with the four reasons. Hidden for her at once; 3 reports hide it for everyone until an admin reviews.

**Admin**: new "Tips" queue in the back office with Approve / Remove, totals only, no author names.

## Moderation
Every tip goes through an AI check before it can show: strips names, links, contact details and medicine doses; rejects harmful, diagnostic, promotional or unsafe tips. Tips about a safety-list symptom are rejected with a kind note to see a doctor. Result: approved (live), pending (admin queue) or rejected (she sees a gentle reason).

## Data (needs your approval: database change)
- `together_tips`: symptom (canonical name), text, author id (never returned to others), author label, status, report count, created at.
- `together_tip_votes`: one per woman per tip.
- `together_tip_reports`: reason, reporter.
- Row security: she creates and deletes her own tips, votes once per tip. Others read approved tips only through a secure function that returns text, label, vote count and "voted by me", never author or voter ids. Only Together-joined women can share or vote (checked on the server).
- "Delete all memory" and account deletion remove her tips, votes and reports.
- Analytics: tip_shared, tip_helped, tip_reported, respecting analytics consent; no tip text in events.

## Decisions to confirm
1. **Author labels**: only stage labels exist today ("Someone in her luteal week", "Someone in perimenopause", "Someone postpartum"). "Someone with PMOS" needs a new "show this on my tips" choice that doesn't exist yet. Plan: stage labels now, condition labels later.
2. **Logan's note wording**: project rules say never name medication or dosage. Your magnesium example names a supplement. Plan: notes are fixed, reviewed lines per theme (for example "Several tips mention supplements. Check with your doctor first if you take other medication."), never naming a specific product, and never AI-written live.
3. **Rejected tips**: she sees a short kind reason and can edit and resend. Rejected text is deleted after 30 days.

## Technical details
- Edge function `together-tip-submit`: validates, checks consent, runs moderation through Lovable AI (default chat model, strict JSON schema output, streamed), writes the row with the resulting status. Safety list reused from the existing safety matcher.
- Edge function or RPC for report (increments count, auto-hides at 3) and admin approve/remove (has_role admin/super_admin).
- RPC `get_together_tips(symptom, sort, stage)` security definer; symptom matched through together_canonical().
- New components: WhatHelpedPage, ShareTipPage, TipReportSheet, admin TipsQueue; PatternPage card wired to them.
- AGENTS.md: one rule for the tips tables and the read-only-through-RPC pattern (inside the LOVABLE marker block).
- Tests: moderation schema parse, vote toggle, label helper, deletion coverage; Playwright check at 390px.
