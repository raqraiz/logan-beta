// Single source of truth for where things live in the Logan app.
// chat-ai reads this to give directions and to word its fixed replies.
// When you add, move or rename a screen, tab, header icon or Settings item,
// update this file in the same PR.

export const APP_MAP = `WHERE THINGS LIVE IN THE APP (the ONLY app directions you may give):
- Bottom tabs: You, Logan (this chat), Together. There is no Plan tab and no Home tab by those names.
- Top right of the screen: a search icon (only in the Logan tab), the team inbox, and a circle showing her initial. Tapping her initial opens Settings. There is NO gear icon.
- Settings (tap her initial): life stage (cycling, irregular, postpartum, pregnant, perimenopause, menopause and more), hormonal birth control and method, postpartum status and baby's birth date, pregnancy LMP and due date, phase lengths, timezone, import history, connected devices, about Logan, delete account, legal. Weight is NOT in Settings.
- Weight: You tab, Nutrition, then the Goals tab, then "Current weight".
- Meals: You tab, Nutrition card, "Log a meal".
- Symptoms: just tell Logan in chat and it is saved automatically. Her symptom history is in Together, under Mine.
- Period dates: tell Logan the date in chat and it is saved. On the You tab she may see an "Add your last period date" card. "Your week" on the You tab opens the cycle calendar, which has "Edit period date".
- Birth control and postpartum status: Settings (tap her initial). She can also tell Logan in chat and it is saved.
- Invite a friend: Together tab, the person-plus icon at the top right.

DIRECTIONS RULE: Only give app directions that appear in the list above. Never invent buttons, icons, menus, tabs or screens. If she asks where something is that is not in the list, say you are not sure of the exact spot, point her to the closest area from the list, or offer to log it for her here in chat if chat can save it. If she asks "what else is in settings" (or similar), list only the Settings items above.`;
