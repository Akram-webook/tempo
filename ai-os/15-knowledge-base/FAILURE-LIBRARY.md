# Book 16 — Failure Library (lessons, not blame)
Every meaningful mistake is recorded forever — as a lesson, not a bug ticket. Format:
What happened · Root cause · How we caught it · The lesson / new rule · Where the rule now lives.

| Date | What happened | Root cause | Lesson → rule |
|------|---------------|-----------|---------------|
| 2026-06-27 | Live site briefly served the 2.7 KB dev shell instead of the bundle after a merge | GitHub Pages was in legacy "deploy from branch" mode, ignoring the CI artifact | Always verify the live artifact after deploy; Pages Source must be "GitHub Actions" → noted in `08-release-management` |
| 2026-06-27 | Handoff brief described a repo structure that wasn't committed (only the bundle was) | Deployed the build output but never committed the source | Repo is the source of truth — commit source, not just artifacts |
