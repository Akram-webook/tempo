# ADR 0003 — Auth modes + decoupling from the data backend

- **Status:** Accepted
- **Date:** 2026-07-02

## Context
Access to Tempo must work in more than one environment: a directory-only demo, a verified
sign-in link, and eventually Google sign-in — without the choice of *who signs you in* dictating
*where data lives*. Coupling authentication to Supabase would make the auth decision hard to
change later. (Substance: `docs/ACCESS-MODEL.md`, `SPEC-supabase-backend.md`,
`src/js/core/config.js`, `src/js/app.js`.)

## Decision
We select the sign-in path with an explicit `authMode`: `directory` (map a known email to a
person), `verified-link` (Supabase magic-link session consumed at boot), or `google` (Google
Identity, pending Client ID — issue #51). Authentication is **decoupled** from data: whichever
auth mode is active, **Supabase stays the DATA layer**. The auth mode maps an identity to a
registered person; it does not decide the storage backend.

## Consequences
- Auth can evolve (add Google, swap link providers) without migrating data.
- Environments differ by a mode setting, not by forked code paths for storage.
- Cost: each mode needs its own gate test, and the identity→person mapping must stay consistent
  across all three. Google mode remains inert until the Client ID lands (#51).
