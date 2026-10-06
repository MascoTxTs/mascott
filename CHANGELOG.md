# Changelog

## 2026-10-04

### Project Setup
- Created the Astro personal website project.
- Initialized the local Git repository.
- Installed project dependencies manually after the initial installation timed out.
- Started the local Astro development server.

### Design
- Established the website as a long-term personal research archive rather than a traditional résumé.
- Defined the main relationship as:
  - Research
  - Projects
  - Notes
  - Archive
- Reviewed personal homepage references including:
  - Jake Wharton
  - John Resig
  - Linus Torvalds
  - Complexity Zoo
- Reworked the homepage toward a denser two-column technical/research-oriented layout.
- Reduced decorative UI elements and large empty spaces.
- Introduced a left identity/navigation column and a content-focused right column.
- Made Projects the main visual content area.
## Feedback System — Supabase Integration

### Added
- Added a dedicated feedback page.
- Added nickname, page/section, device/platform, and message fields.
- Connected the feedback form to Supabase.
- Added PostgreSQL `feedback` table.
- Enabled Row Level Security (RLS).
- Added anonymous INSERT policy.

### Problem
The feedback form initially returned:

`404 PGRST125 — Invalid path specified in request URL`

The browser requested:

`/rest/v1/rest/v1/feedback`

### Diagnosis
The runtime Supabase URL contained `/rest/v1/`, while the Supabase JavaScript client automatically adds `/rest/v1`.

### Solution
Changed `PUBLIC_SUPABASE_URL` in `.env` from:

`https://tgyjdfssmpyopqlgnmky.supabase.co/rest/v1/`

to:

`https://tgyjdfssmpyopqlgnmky.supabase.co`

After restarting the Astro development server, the feedback submission worked successfully.