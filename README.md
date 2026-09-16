# MY_TASKS v17

A cloud-synced 100-day study/work tracker built for GitHub Pages + Supabase.

## V17 changes

- Future/work-ahead view is persisted per signed-in user so switching tabs or reopening the app does not jump back to Day 1.
- Day completion is tied to the exact mission date.
- A completed day is automatically reopened if a task is later unchecked, so the button/state stays consistent.
- Progress graph renders all 100 mission days in one horizontal scroll area with D1–D100 labels.
- Graph bars use GitHub-style intensity: more completed hours = darker green.
- Hovering a bar lifts it slightly and shows a glass tooltip with completion, planned time, completed time, and task-by-task minutes.
- Clicking a bar still opens the normal day detail modal.
- History cells use the same activity intensity language and remain clickable for all 100 days.
- Weekly streak remains a 7-day milestone rather than a daily streak.
- Checklist tasks can optionally be linked to a private project with a compact `@` project picker.
- Completing a linked task adds its scheduled minutes to that project's target progress.
- Projects now display live progress such as `2h / 5h` and a compact progress bar.
- Task setup remains simple: name, time, optional schedule, optional project.

## Files

For GitHub Pages deployment, upload only:

- `index.html`
- `app.js`
- `styles.css`
- `README.md`

## Database update

Run `tasks_permissions_and_custom_v17.sql` once in the Supabase SQL editor after the existing v13 setup. It adds the project link on tasks and stores a stable minute snapshot for completed checklist work.

No frontend build step is required.
