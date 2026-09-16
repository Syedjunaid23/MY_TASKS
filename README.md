# MY_TASKS — checklist + projects update

This deployment keeps the existing tracker layout, Daily Work chart, 100-day history, notes, productivity boosters, Projects section, and Mission start-date setting.

## Daily Checklist
- Starts empty for each user.
- Add your own task name and daily time.
- Edit task name/time.
- Remove tasks without deleting existing completion history.
- Reorder tasks.
- No browser `prompt()` dialogs.
- Checklist completion continues to feed the existing Daily Work/history system.

## Mission
Use **⚙ Mission** to choose the start date. Day 1 begins on that date; the tracker runs for 100 days.

## Projects
Projects stay separate from the checklist and are private to the signed-in user.

## Supabase setup
Run `tasks_permissions_and_custom.sql` once in the Supabase SQL Editor. This adds the user-owned checklist fields and creates secure RPC functions for task reads/writes. The frontend uses those RPC functions so checklist writes do not depend on conflicting old `tasks` RLS policies.

Then upload only these four frontend files to GitHub Pages:

```text
index.html
app.js
styles.css
README.md
```

Do not upload the SQL file to GitHub Pages; it is only for the Supabase SQL Editor.

### Celebration milestones
- Completing the final task of a day at 100% triggers one full-screen daily celebration.
- Every completed 7-day block gets a separate birthday/party-style celebration.
- Day 100 has a final mission celebration.
- Each milestone is stored in browser local storage so refreshes do not replay the celebration on that device.
- Celebration effects are CSS/JavaScript only; no database changes are required for this feature.

