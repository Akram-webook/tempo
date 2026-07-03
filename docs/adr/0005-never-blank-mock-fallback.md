# ADR 0005 — Never-blank mock fallback (server-wins merge, offline-safe)

- **Status:** Accepted
- **Date:** 2026-07-02

## Context
Tempo must be demonstrable and usable before — and independently of — a live backend, and it must
never render an empty, broken-looking screen when the network or the data layer is unavailable. At
the same time, when real server data *is* present it must take precedence over the seeded mock, so
the app never shows stale placeholders over live truth. (Substance: `docs/ARCHITECTURE.md`,
`src/js/core/db.js`, `src/js/core/state.js`.)

## Decision
The app ships with a mock dataset and **falls back to it so the UI is never blank**, including
offline. When real data loads, the merge is **server-wins**: server records override the mock for
any key they cover, and the mock only fills gaps the server did not provide.

## Consequences
- The app boots and renders meaningfully with zero backend — good for demos, dev, and outages.
- Real data always wins where it exists; the mock cannot mask live values.
- Cost: the mock is a maintained artifact that must stay shape-compatible with real data, or the
  merge papers over schema drift. Tests assert the never-blank and server-wins behaviour.
