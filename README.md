# MY_TASKS V18

V18 keeps the existing MY_TASKS dashboard, Projects, Mission start date, 100-day history, Supabase Auth and milestone celebrations, while polishing the productivity UI.

## V18 highlights

- Auto-completes a mission day when all scheduled tasks reach 100%.
- Future-day work-ahead remains tied to the selected mission date.
- Daily Work graph contains all 100 days in one horizontal scroll.
- Graph hover uses a stable hit area with a glass tooltip so bars do not vibrate or flicker.
- Hover shows completion %, worked time, planned time and task-by-task time.
- Bars use a GitHub-style green intensity scale based on completed focus time.
- Range buttons jump to 1–20, 21–40, 41–60, 61–80 and 81–100.
- Adds momentum stats: weekly completion, focus time and best focus day.
- Adds a lightweight Focus Sprint timer (25/50/90 minutes).
- Projects show logged time, target time, active days, streak and the task contributing the most time.
- Task/project dropdowns are compact floating panels rather than layout-breaking sections.
- Existing task-to-project linking and project progress logic remain compatible with the V17 database setup.

## Deployment

Upload exactly these four files to the root of the GitHub Pages `main` branch:

- `index.html`
- `app.js`
- `styles.css`
- `README.md`

No new SQL migration is required for V18. Keep the database/RPC setup already applied for V17.


Login fix: cache-busted app.js to v18 and bound the sign-in handler before other UI listeners.
