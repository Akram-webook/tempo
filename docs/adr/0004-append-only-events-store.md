# ADR 0004 — Append-only events store (no edit/delete; idempotent ingest)

- **Status:** Accepted
- **Date:** 2026-07-02

## Context
Tempo's signals (daily check-ins, Slack-ingested activity) feed capacity, well-being, and
evaluation intelligence. If those records could be edited or deleted in place, history would be
mutable and the decisions built on it would stop being explainable or auditable — a direct
conflict with the Evidence and Trust articles. Ingest also re-runs on a schedule and must not
double-count on retry. (Substance: `docs/SLACK-INTEGRATION.md`, `SPEC-slack-real-data.md`,
`src/js/core/events.js`, `src/js/core/slackIngest.js`.)

## Decision
The events store is **append-only**: events are inserted, never edited or deleted. Corrections
are new events, not mutations of old ones. Ingest is **idempotent** — each source message maps to
a stable id, so re-running a window skips already-inserted events (dedupe) instead of inserting
duplicates.

## Consequences
- History is immutable and auditable; a decision can always be traced to the events behind it.
- Scheduled re-runs and backfills are safe — the same window ingested twice yields one copy.
- Cost: "fixing" data means appending a correcting event and teaching readers to fold it in;
  there is no in-place undo. Storage only grows.
