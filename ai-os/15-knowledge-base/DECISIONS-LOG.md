# Decisions log
| Date | Decision | Why | Rejected alternatives | Owner |
|------|----------|-----|-----------------------|-------|
| 2026-06-27 | Verified sign-in via Supabase magic link | Static host can't verify a typed code without SMTP; link is equally secure, ships now | Typed 6-digit code (needs custom SMTP); Google-only | Akram |
| 2026-06-27 | Backend rollout phased, evaluations first, localStorage fallback | De-risk; prove pattern before migrating all data | Big-bang full backend | Akram |
