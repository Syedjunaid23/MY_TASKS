# MY_TASKS V14

Four-file GitHub Pages deployment for the 100-Day Study Tracker.

## V14 highlights

- Keeps the existing dashboard, Projects, Mission start date, Daily Work chart, history, notes, boosters, auth, and backup flow.
- Checklist management is simplified:
  - Add a task with name + weekday time.
  - Weekend time is optional; when blank it follows weekday time.
  - Default schedule is Mon–Fri.
  - A small Schedule control lets you switch to Sat–Sun, Every day, or choose specific days.
  - Edit name, times, schedule, reorder, or remove.
- Weekend plan is automatic for scheduled Saturday/Sunday tasks.
- Work ahead is simple: once the selected day reaches 100%, a small Work ahead button unlocks the next mission day.
- Future days use the same checklist rules and can be completed early.
- Mission progress is based on 100% day completion rather than a separate manual daily-complete toggle.
- The old date-picker navigation was removed from the main dashboard to keep the flow clean.
- Weekly streaks are shown instead of a daily streak: a week counts when all 7 mission days in that week reach 100%.
- Daily, weekly, and final celebration overlays remain one-time milestones with animated confetti/fireworks/party effects.

## Database

No new SQL file is required for V14. It continues using the task RPC/database structure from V13.

Deploy these four files to GitHub Pages:

- index.html
- app.js
- styles.css
- README.md
