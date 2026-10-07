# One place for symptoms: Together

Together becomes her only symptom library, logging screen and dashboard. The symptom page, list view, aliases and totals stay as they are.

## What gets removed
- The Log symptoms sheet, everywhere it opens: Logan home "How I feel", symptom page "Log it now", You tab, and chat entry points. All of them now open Together in log mode.
- "Your patterns" on the You tab. In its place goes one row card, "Your symptoms", listing her top 3 and "and N more". Tapping it opens Together on Mine.
- The consent gate on viewing Together. Everyone can see it. Consent only decides whether her logs count in the totals.

## Together field
- A segmented switch next to the title: "Everyone" | "Mine". White track; the selected side is ink with ✓.
- **Everyone:** works as it does now. If she hasn't joined, one quiet line under the caption: "Your logs aren't counted yet." with a "Count me in" link that opens the consent sheet.
- **Mine:** only her symptoms. Bubble size is how often she logged each one in the last 90 days. No rings, and ★ before the ones she's watching. Subtitle "[N] things you've told me about." Caption: "Bigger bubbles are what you feel most. ★ You're watching these. Tap one to see your pattern." plus a "Choose what to watch" link that reuses the current chooser. Works whether she joined or not.
- Tapping a bubble in either view opens the symptom page.
- A floating ink pill, "+ Log how I feel", sits bottom right above the tab bar.

## Log mode (same screen)
- Title "What are you feeling?" (Cormorant 28), "Logging for Today ⌄" under it (date picker: today and the past 7 days), "Cancel" top right.
- Search field "Search or add your own", matching names and aliases. Each result has a hint: "Closest match", "You log this often", or the alias it matched. The last row is "+ Add "[text]" as your own". Under the field: "Your own words stay private. If 10 women use the same word, it joins Together." Below that, a small "Edit your words" link opens the existing rename and remove controls.
- The bubble field shows her most logged symptoms first (bigger), then ones common around her cycle day (smaller), 14 at most.
- Tapping a bubble fills it ink with paper text and ✓. A white card under the field lists her picks, each with "Mild · Moderate · Strong" (Mild preselected).
- The bottom button reads "Pick what you feel" (sand, disabled) until something is picked, then "Log [N]" in ink. After saving, the screen goes back to the field and Logan posts "Logged. Thanks for telling me." in the chat.
- "Log it now" on a symptom page opens log mode with that symptom already picked and placed in the center.

## Consent
- **Onboarding:** a separate, unticked checkbox: "Add my logs, without my name, to what women see in Together." It saves to together_consent with a version and timestamp.
- **Existing users:** Logan asks once in chat: "Want your logs to count in Together, without your name? It helps women see they're not alone." with "Count me in" and "Not now". It never asks again after either answer. This uses the existing "consent shown" timestamp, so nothing new is stored.

## Approvals needed (protected areas)
1. **Database and privacy:** the shared totals function currently returns data only to women who joined. Viewing without joining means letting every signed-in woman read the totals. They are already thresholded, with no names and nothing under 3 women. I'll change only that check. Whether her logs count still follows her consent.
2. **Consent:** adding the onboarding checkbox changes the consent screen.
3. **Time window:** Mine sizes bubbles by her last 90 days, as you wrote. Her symptom page stats stay on the 12 months you approved earlier. Say if you want Mine on 12 months too.

## Technical details
- New `TogetherMode` state in TogetherTab: `everyone | mine | log`, opened from a `logan:open-together-log` event that carries an optional preselected symptom. It replaces every `SymptomLogWidget` sheet opener (Chat.tsx, HomeTab, PatternPage onLog).
- Mine bubbles reuse BubbleCluster with rows built client-side from her own logs (canonicalSymptom grouping) and the magenta rings turned off.
- Log mode reuses the search, alias and "Your words" logic pulled out of SymptomLogWidget into a hook. The insert keeps the current severity scale (Mild 1, Moderate 3, Strong 5), then reads back the saved row and posts the chat message.
- Migration: relax the consent check in `get_together_aggregates()` to authenticated users. Aggregation still counts only consenting women.
- AGENTS.md gets one rule: Together is the only symptom logging surface.
- Checks: tsgo, vitest, and Playwright at 390px for both views, log mode and the consent prompt.
