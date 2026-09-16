# MY_TASKS V15 

V15 is a UX-focused refinement of the existing tracker. It keeps the Projects section, Mission start date, Daily Work chart, history, authentication, and existing Supabase database setup.
https://syedjunaid23.github.io/MY_TASKS/

## Main fixes
- Work-ahead no longer jumps back to today during the background refresh.
- Mission and Today cards keep their original compact shape; the Today card can grow without stretching the Mission card.
- Progress ring stays circular instead of becoming an ellipse.
- Completing a day is now saved to `completed_days`.
- Daily task completion remains date-specific; checking a task on one mission day does not automatically check it on another day.
- Weekly streak is represented as a seven-dot progress strip plus a weekly streak count.
- Work-ahead navigation uses a compact footer instead of a large cluster of controls.
- Task creation is simplified to **name + time + Add task**. New tasks repeat Mon-Fri by default.
- Repeat scheduling is an optional small `↻` control. Weekend schedules expose a weekend time only when needed.
- Existing task editing remains inline, with Save/Remove and simple ↑/↓ reorder controls.
- Historical custom-task snapshots retain a task's creation date so newly-created tasks do not retroactively appear on earlier mission days.
- Daily/weekly/final celebrations remain one-time milestone overlays and no longer cause future-day navigation to reset.

## Deployment
Upload only these four files to the GitHub Pages repository root:
- index.html
- app.js
- styles.css
- README.md

No new SQL is included in V15; it uses the database/RPC setup already applied for V13/V14.
