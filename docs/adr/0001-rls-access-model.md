# ADR 0001 — RLS access model (self / direct-manager / director, no skip-level)

- **Status:** Accepted
- **Date:** 2026-07-02

## Context
Tempo holds workforce data (workload, evaluations, well-being signals). Who may read a
person's record — and who may see the *sensitive* parts of it — must be a single, explainable
rule, not scattered per-view checks. The Constitution's Human-First and Trust articles require
that access be traceable and that the app track work without becoming a surveillance tool.
(Substance: `docs/ACCESS-MODEL.md`, `src/js/core/access.js`.)

## Decision
We model read access as two predicates, `can_read_person` and `can_see_sensitive`, resolved
from the org tree:
- **Self** — you can always read and see sensitive fields on your own record.
- **Direct manager** — a person's immediate manager can read them and see sensitive fields.
- **Director / Super-Admin** — role-scoped visibility above the line.
- **No skip-level** — a manager's manager does **not** automatically get the direct-report's
  sensitive fields; access does not silently cascade up the chain.

The same predicates back both the front-end gating and the intended Supabase RLS policies, so
the client never becomes the source of truth for access.

## Consequences
- One place defines "who can see what"; views ask the predicate rather than re-deriving rules.
- No skip-level keeps sensitive data narrow by default — the safe direction under Human-First.
- Directors get an explicit, role-scoped path rather than an implicit skip-level leak.
- The real edge/data-layer enforcement (RLS in Supabase + the edge gate, ADR-linked to F3)
  is gated on Akram's Cloudflare + backend work; the predicates here are the contract it fills.
