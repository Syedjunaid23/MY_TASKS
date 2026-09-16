# MY_TASKS — preserved tracker + custom checklist

This build keeps the original tracker behavior and visual structure from the supplied ZIP, while adding only the requested controls:

- Daily checklist starts empty for the active checklist.
- No browser `prompt()` is used for adding tasks.
- `⚙ Edit checklist` opens a proper in-page editor.
- Add, rename, change daily time, remove, and reorder tasks.
- The original Daily Work 100-day bar chart is preserved.
- The original 100-day history table/grid is preserved.
- Daily notes, productivity boosters, day-detail modal, backup, auth, and daily rollover are preserved.
- `⚙ Mission` lets you choose the 100-day start date.
- Projects remain a separate private section with create/edit/delete and target time.

## Important compatibility choice

The supplied database schema for `tasks` does **not** contain the `active` column used by the previous build, so this version uses the original task columns (`id`, `name`, `weekday_minutes`, `holiday_minutes`, `sort_order`) and does not require a database migration or SQL file.

Existing task rows are left untouched so the old history can still be reconstructed. The new checklist uses task IDs created/selected by this build and stores that selection in the browser for this signed-in account.

## Deploy

Replace only these four GitHub Pages files:

- `index.html`
- `app.js`
- `styles.css`
- `README.md`

No SQL file is included.
