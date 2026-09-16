# 100-Day Study Tracker — GitHub Pages + Supabase

This version is a static frontend designed for GitHub Pages. Existing tracker progress is stored in Supabase, so the same account can use the tracker from multiple devices. The Projects feature is also stored in a separate Supabase `projects` table and is scoped to the signed-in user.

## Deployment
1. Put `index.html`, `app.js`, and `styles.css` in the GitHub Pages repository.
2. Run `projects-migration.sql` once in the Supabase SQL Editor to create the isolated Projects table and its row-level security policies.
3. Enable GitHub Pages.
4. Open the Pages URL and sign in with the Supabase Auth account.

The browser only contains the Supabase project URL and publishable key. Never put a Supabase secret/service-role key in this repository.
