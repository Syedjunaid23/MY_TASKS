# MY_TASKS — Personal 100-Day Tracker

This version keeps the existing tracker design while making the checklist and mission user-controlled.

## User-controlled setup
- Starts with **zero default checklist tasks**.
- Add your own task names and times.
- Edit task names and times later.
- Remove tasks without deleting their existing completion records.
- Reorder tasks.
- Projects also start empty and are private to the signed-in account.
- Choose the 100-day mission start date yourself: tomorrow, next month, or any date.
- The dashboard calculates Day 1–Day 100 from that chosen start date.
- Existing daily completion records continue to feed the history and Daily Work chart.

## Supabase
The frontend uses the existing Supabase project configured in `app.js`. User-owned checklist tasks expect the flexible task fields already discussed for this project (`user_id`, `active`, `weekday_minutes`, `holiday_minutes`, and `sort_order`). No default tasks are inserted by the frontend.

## Deployment
Upload these four files to the GitHub Pages repository:
- `index.html`
- `app.js`
- `styles.css`
- `README.md`

No SQL file is included in this package.
