# 06 — Security (SDL-lite)
- No secrets in the front-end/repo. Public keys (Supabase publishable) only; never `service_role`.
- Auth: don't regress verified sign-in. Server-enforced access via RLS where data is shared.
- Validate inputs; least-privilege; OWASP top-10 awareness on any new surface.
- Privacy by design: track WORK, never surveil people (`00-governance/PRINCIPLES.md`).
