# MY_TASKS v13

This version keeps the existing dashboard, Projects, Mission start date, Daily Work chart, history, notes, backup/import and Supabase authentication while adding schedule flexibility and work-ahead mode.

## Checklist scheduling
Each custom task can now have its own repeat schedule:
- Mon, Tue, Wed, Thu, Fri, Sat, Sun can be selected individually.
- Weekday time and weekend time can be different.
- Quick presets: Mon–Fri, Sat–Sun, Every day, Never.
- The repeat control is compact and stays out of the main dashboard.

The dashboard automatically shows **Normal Working-Day Plan** on weekdays and **Weekend Plan** on Saturday/Sunday according to each task's repeat schedule.

## Work ahead
After the selected day is completed at 100%, **Work ahead** becomes available. A small date picker also lets you choose another day inside the 100-day mission. Future mission days can be worked on and saved without changing the actual calendar date.

## Celebrations
- Daily 100% completion: full-screen confetti, fireworks, sparkles, light rays and burst effects.
- Every 7 completed mission days: larger party/birthday-style celebration with balloons, cake, extra confetti and fireworks.
- Day 100: final mission celebration.
- Each celebration is stored locally and only plays once for its milestone/day on that device.

## Supabase
Run `tasks_permissions_and_custom_v13.sql` once in the Supabase SQL Editor before deploying this version. It adds repeat-schedule fields and the secure task RPCs used by the checklist manager.

## Deployment
GitHub Pages needs only these four files:

- `index.html`
- `app.js`
- `styles.css`
- `README.md`

The SQL file is separate and is not part of the four-file GitHub deployment package.
