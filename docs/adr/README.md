# Architecture Decision Records (ADRs)

Short, dated records of the major architectural decisions behind Tempo — the *why*, not just the
*what*. Each is immutable once Accepted; we supersede rather than rewrite. New records use
[`template.md`](template.md) (Context / Decision / Consequences / Status / Date).

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-rls-access-model.md) | RLS access model — self / direct-manager / director, no skip-level | Accepted |
| [0002](0002-mvp-lean-flag.md) | MVP lean-flag — gate, don't delete (`WP.config.mvp`) | Accepted |
| [0003](0003-auth-modes-decoupling.md) | Auth modes (directory / verified-link / google) decoupled from the data backend | Accepted |
| [0004](0004-append-only-events-store.md) | Append-only events store — no edit/delete, idempotent ingest | Accepted |
| [0005](0005-never-blank-mock-fallback.md) | Never-blank mock fallback — server-wins merge, offline-safe | Accepted |
| [0006](0006-staged-waves-human-merge-gate.md) | Staged waves rollout + human merge gate — no AI auto-merge, never hand-edit `dist/` | Accepted |
