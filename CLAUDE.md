# Logan (asklogan.ai)

Intelligent health companion for women. Built in Lovable, edited with Claude Code via GitHub two-way sync.

## Who you're working with

The founder is non-technical. Explain changes in plain English, keep summaries short, and ask before anything risky or hard to undo.

## How this repo syncs with Lovable

- Lovable syncs with GitHub on the `main` branch only. Changes pushed to `main` appear in Lovable automatically.
- Work on a branch is invisible to Lovable until merged into `main`.
- Default: commit small, focused changes directly to `main` unless told otherwise.
- Always pull the latest `main` before starting work. The founder may have made changes in Lovable.
- Never rename, move, or delete the repo, and never force-push. This breaks the sync.

## What you can change freely

- Frontend code: pages, components, styles, copy, hooks, utilities.
- Server-side app code that lives in the main app folder. These deploy through GitHub sync with no Lovable prompt needed.

## What needs a Lovable prompt after you change it

- Supabase Edge Functions (`supabase/functions/`)
- Database migrations, schema changes, and RLS policies (`supabase/migrations/`)
- Secrets and environment variables

When you change any of these, end your summary with a section like this, ready to paste into Lovable:

LOVABLE PROMPT:
Deploy the [function-name] edge function.

or

Apply the latest database migration in supabase/migrations/[file-name].

Keep the prompt short and exact so it uses as few Lovable credits as possible.

## Do not touch

- `.env` files and any API keys or secrets. Never commit secrets.
- Lovable config files unless explicitly asked.
- Auto-generated Supabase types file, unless the schema changed.

## Product and privacy

- This is a health app. Treat all user data as sensitive. Never log personal or health data, and never weaken auth or RLS policies.
- Do not present app content as medical advice or diagnosis.
- Brand palette: magenta, violet, teal. Keep the tone warm, clear, and reassuring.

## Before you finish

- Make sure the app builds without errors.
- Summarize what changed in 2 to 4 plain-English bullets.
- Note anything the founder should check in the Lovable preview.
