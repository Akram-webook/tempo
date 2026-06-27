# Decisions log
| Date | Decision | Why | Rejected alternatives | Owner |
|------|----------|-----|-----------------------|-------|
| 2026-06-27 | Verified sign-in via Supabase magic link | Static host can't verify a typed code without SMTP; link is equally secure, ships now | Typed 6-digit code (needs custom SMTP); Google-only | Akram |
| 2026-06-27 | Backend rollout phased, evaluations first, localStorage fallback | De-risk; prove pattern before migrating all data | Big-bang full backend | Akram |
| 2026-06-27 | Adopt TAOS v3 (Constitution supreme law; Council of Critics for M/L; standards cite REFERENCES.md) | Operate like a world-class company, not just good prompts; right-size rigor XS/S/M/L | Looser ad-hoc process | Akram (#5) |
| 2026-06-27 | Merge Phase-1 Supabase backend (evaluations); read policy PERMISSIVE for now | Ship the shared-data slice; verify-db proves lossless de-duped handoff (no dupes, newer not overwritten); write=own-rows via RLS | Strict role-scoped read now (needs server-side roles — deferred to Phase 2) | Akram (#3) |
| 2026-06-27 | Phase-2 follow-ups logged | Tighten evaluations read to role-scoped (server-side roles); run supabase/0001_evaluations.sql before backend goes live | — | Akram |
