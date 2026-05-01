## Goal

The "Specific users" filter in the Notifications tab currently renders a tall, always-visible 160px scrolling checkbox list, which clutters the form. Replace it with a compact dropdown trigger that opens a searchable popover on click, plus inline chips showing who's selected.

## What changes

In `src/components/admin/NotificationsTab.tsx`:

- Replace the inline search input + `ScrollArea` checkbox list with a single dropdown button.
- Button label: `Select specific users` when empty, or `3 users selected` when not.
- Clicking the button opens a `Popover` containing:
  - A search input at the top (filters by name or email)
  - A scrollable checkbox list of participants (max ~280px tall, capped at 100 results)
- Below the dropdown, render selected users as small removable chips (name + ✕). Clicking ✕ removes that user from the selection.
- Keep the existing "Clear" link and the "(N selected — overrides other filters)" hint next to the label.
- No changes to filter state shape, edge function, or send logic — purely a UI refactor of the picker.

## Result

```text
Specific users (3 selected — overrides other filters)     Clear
[ 3 users selected                                    v ]
[ Raquella ✕ ] [ Liying ✕ ] [ Jane ✕ ]
```

Collapsed by default, no more wall of checkboxes.

## Technical notes

- Use the existing shadcn `Popover` component (`@/components/ui/popover`).
- Add `ChevronDown`, `X`, `Search` from `lucide-react`.
- Popover width matches trigger via `className="w-[--radix-popover-trigger-width] p-0"`.
- Selected chips use `Badge variant="secondary"` for consistency with the rest of the admin UI.
