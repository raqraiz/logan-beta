# Log symptoms sheet cleanup

Old logs are never rewritten. Each alias counts as its main name in the Together daily totals, Your patterns, the symptom page and search.

## 1. Merges (main name ← aliases)

These are added on top of the aliases the shared list already has (for example Cramps ← Crampy, Vertigo ← Dizzy). Those existing aliases are copied into the new aliases list too.

| Main name | Aliases |
|---|---|
| Fatigue | Tiredness, Low energy, Depleted, Always tired, Exceptionally tired |
| Trouble sleeping | Insomnia, Sleep deprived, Poor sleep, Difficulty sleeping |
| Irritability | Short fuse, Feeling reactive, Short tempered |
| Sudden rage | Shaking from anger, Rage |
| Low mood | Sadness, Bad mood, Depressed |
| Low motivation | Lack of motivation, Unmotivated |
| Overwhelm | Feeling of overload, Overstimulated |
| Restlessness | Jittery, Wired |
| Stomach pain | Abdominal pain |
| Acne | Breakouts |
| Dry skin | Dehydrated skin |
| Itchy skin | Back itchiness |
| Breast tenderness | Nipples hurting, Sensitive nipples, Swollen breasts |
| Spotting | Spotty bleeding |
| Feverish | Low grade fever |
| Hot flashes | Hot, Overheating |
| Hunger | Starving |
| Diarrhea | Soft stools |
| Ovulation discharge | Egg white |
| Ovulation pain | Mittelschmerz |

Kept separate because they mean different things or carry a doctor note: Hearing loss / Muffled hearing, Feeling faint / Vertigo, High fever / Feverish, Cystic acne / Acne, Brain fog / Poor focus, Anhedonia / Low mood, Cravings / Hunger.

Main names are also tidied to sentence case: "Memory loss", "Hearing loss", "Tingly hands", "Libido", "Cervical position". "🖐🏻CTS pain" becomes "Hand pain (CTS)".

Retired names ("louder", "storm", "stronger") stay hidden.

## 2. Three groups

**Body**: Acne, Back pain, Bloating, Body aches, Body odor changes, Breast tenderness, Burning sensation, Cervical position, Chills, Chin hairs, Congestion, Constipation, Cough, Cramps, Cystic acne, Diarrhea, Discharge, Dry skin, Ear fullness, Ear itchiness, Eating habits, Feeling faint, Feverish, Frequent urination, Gas, Gum sensitivity, Hair shedding, Hand pain (CTS), Headache, Hearing loss, Heartburn, Heavy legs, High fever, Hot ear, Hot flashes, Hunger, Inflammation, Itchy eyes, Itchy scalp, Itchy skin, Joint pain, Libido, Mastitis, Muffled hearing, Muscle tension, Nausea, Ovulation, Ovulation discharge, Ovulation pain, Pelvic floor heaviness, Period flu, Phantom bites, Prickly throat, Reaction to mosquito bites, Redness, Sensitive to smells, Shaking, Shortness of breath, Skin flare, Sneezing, Sore throat, Spotting, Stabbing pain, Stomach pain, Swollen glands, Thirst, Tingly hands, Tooth sensitivity, Vaginal dryness, Vaginal itching, Vertigo, Vulvar itchiness, Belly pressure, Blebs, Blood clots, Musky

**Mood & mind**: Anhedonia, Anxiety, Brain fog, Confident, Cravings, Dissociative, Emotional intensity, Feeling alone, Feeling fat, Feeling hurt, Feeling in body, Feeling incompetent, Feeling stuck, Feeling surge, Feeling thoughtful, Feeling underwhelmed, Guilt, Irritability, Low mood, Low motivation, Memory loss, Mood swings, Overwhelm, Poor focus, Positive shift, Restlessness, Shame, Sharp focus, Stress, Sudden rage

**Sleep & energy**: Dreams and nightmares, Fatigue, High energy, Night sweats, Rested, Sleepy, Trouble sleeping

**Your words**: anything she typed that isn't on the shared list, shown in sentence case ("Heavy legs").

Together's "Body", "Mood & mind" and "Sleep" filters use these same groups.

## 3. Sheet layout

```text
[ Search or add your own            ]   full width, matches aliases ("tired" finds Fatigue)
Frequently logged   up to 6 of HER symptoms
Body            (open)
Mood & mind     (closed)
Sleep & energy  (closed)
Your words      (closed, only if she has any)
[ Log 3 ]                               one ink button
```

Each symptom chip appears in only one place. If it shows under Frequently logged, it's left out of its group.

## 4. Severity

- Tapping a chip selects it at Mild, with three pills underneath: Mild, Moderate, Strong. The selected pill is dark with a ✓. Tapping the chip again unselects it.
- The 0 to 10 slider and "Not feeling it" are removed.
- "Log it now" on a symptom page opens the sheet with that symptom already selected at Mild.

## 5. After saving

The button reads "Log [N]". Once the log is saved and read back, Logan posts "Logged. Thanks for telling me." in the chat.

## Needs your approval (protected areas)

- New aliases list in the database (alias, main name). Signed-in users can read it, only admins can change it.
- Updating the shared symptom list's groups and tidying main-name casing. Logs are untouched.
- Changing the Together daily totals so aliases count as their main name.
- A new chat message from Logan written after a save.

## Technical details

- New table `symptom_aliases(alias text unique, main_name text)`, with grants and row security. Both columns are stored in normalized form.
- `refresh_together_aggregates()` maps each name through the aliases first, then `together_norm`.
- `community_symptoms.category` is set to Body, Mood & mind or Sleep & energy. `mapCategory()` in Together reads these new values.
- A client helper `canonicalSymptom(name)` is loaded once. `patternCycles.symptomPoints`, `symptomPageData`, the Together "You too" check and sheet search all use it.
- Severity is still stored as a number so old logs keep working: Mild 3, Moderate 6, Strong 9.
- The confirmation is an assistant row in chat_messages, inserted after the symptom_logs save is re-read.
